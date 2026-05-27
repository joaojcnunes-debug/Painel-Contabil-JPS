// API Route: Distribuição DFe SEFAZ.
//
// POST { id_cliente, ambiente, senha, reset_nsu? }
// 1. Auth + equipe-only
// 2. Acha certificado A1 vinculado ao cliente (ou ao escritório, fallback)
// 3. Baixa .pfx do bucket privado
// 4. Carrega último NSU de nfe_dfe_nsu (ou usa "0" se reset_nsu=true)
// 5. Chama SEFAZ via distribuirDFe()
// 6. Persiste novo NSU
// 7. Retorna documentos
//
// Roda em Node runtime (não Edge — precisa de mTLS via https.Agent).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  distribuirDFe,
  type AmbienteSefaz,
} from "@/lib/integracoes/notas-fiscais/sefaz-dfe";
import { gerarId } from "@/lib/utils";

// Garante Node runtime (não Edge)
export const runtime = "nodejs";
export const maxDuration = 60; // até 60s (limite Vercel Hobby)

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  reset_nsu?: boolean;
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json(
      { ok: false, erro: "Apenas equipe" },
      { status: 403 }
    );
  }

  // Body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "JSON inválido" },
      { status: 400 }
    );
  }

  const { id_cliente, ambiente, senha, reset_nsu } = body;
  if (!id_cliente || !senha || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Parâmetros obrigatórios: id_cliente, ambiente (1|2), senha",
      },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteSefaz;

  // Cliente + CNPJ
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj, cpf, razao_social")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as
    | { cnpj?: string | null; cpf?: string | null; razao_social?: string }
    | null;
  if (!cliente) {
    return NextResponse.json(
      { ok: false, erro: "Cliente não encontrado" },
      { status: 404 }
    );
  }
  const docDest = (cliente.cnpj ?? cliente.cpf ?? "").replace(/\D/g, "");
  if (!docDest || (docDest.length !== 14 && docDest.length !== 11)) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ ou CPF válido" },
      { status: 400 }
    );
  }

  // Certificado: tenta primeiro vinculado ao cliente, senão pega do
  // escritório (id_cliente IS NULL) com mesmo documento (procuração)
  // ou apenas o cert do escritório mais recente
  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("id_certificado, arquivo_path, titular_documento, tipo, validade_fim")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });

  type Cert = {
    id_certificado: string;
    arquivo_path: string;
    titular_documento: string;
    tipo: string;
    validade_fim: string;
  };
  const certList = (certs ?? []) as unknown as Cert[];
  if (certList.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Nenhum certificado A1 com arquivo cadastrado. Vá em Integrações > Certificados.",
      },
      { status: 400 }
    );
  }

  // Prefere cert com documento batendo com cliente, senão pega o primeiro
  const cert =
    certList.find((c) => c.titular_documento === docDest) ?? certList[0];

  // Baixa .pfx do bucket
  const { data: pfxBlob, error: blobErr } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (blobErr || !pfxBlob) {
    return NextResponse.json(
      {
        ok: false,
        erro: `Falha ao baixar certificado do bucket: ${blobErr?.message ?? "blob vazio"}`,
      },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  // Último NSU
  let ultimoNsu = "0";
  if (!reset_nsu) {
    const { data: nsuData } = await supabase
      .from("nfe_dfe_nsu")
      .select("ultimo_nsu")
      .eq("id_cliente", id_cliente)
      .eq("ambiente", amb)
      .maybeSingle();
    const nsuRow = nsuData as { ultimo_nsu?: string } | null;
    if (nsuRow?.ultimo_nsu) ultimoNsu = nsuRow.ultimo_nsu;
  }

  // Chama SEFAZ
  const inicio = Date.now();
  const resultado = await distribuirDFe({
    pfxBuffer,
    senha,
    cnpjOuCpfDestinatario: docDest,
    ambiente: amb,
    ultimoNsu,
  });
  const duracaoMs = Date.now() - inicio;

  // Persiste NSU (mesmo em erro, pra registrar última tentativa)
  const novoNsu = resultado.ok ? resultado.ultimoNsu : ultimoNsu;
  const maxNsu = resultado.ok ? resultado.maxNsu : null;
  const cStat = resultado.ok ? resultado.cStat : resultado.cStat ?? "ERR";

  // Upsert manual (Supabase upsert é chato com unique composta)
  const { data: existente } = await supabase
    .from("nfe_dfe_nsu")
    .select("id_nsu")
    .eq("id_cliente", id_cliente)
    .eq("ambiente", amb)
    .maybeSingle();

  if (existente) {
    await supabase
      .from("nfe_dfe_nsu")
      .update({
        ultimo_nsu: novoNsu,
        max_nsu: maxNsu,
        ultima_consulta: new Date().toISOString(),
        ultimo_status: cStat,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_nsu", (existente as { id_nsu: string }).id_nsu);
  } else {
    await supabase.from("nfe_dfe_nsu").insert({
      id_nsu: gerarId("NSU"),
      id_cliente,
      ambiente: amb,
      ultimo_nsu: novoNsu,
      max_nsu: maxNsu,
      ultima_consulta: new Date().toISOString(),
      ultimo_status: cStat,
    } as never);
  }

  // Log na tabela de integracoes_logs
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "NOTAS_FISCAIS",
    acao: "dfe_distribuir",
    modo: "REAL",
    usuario_email: user.email,
    usuario_nome: null,
    status: resultado.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `ambiente=${amb} ultimoNsu=${ultimoNsu}`,
    response_resumo: {
      cStat: resultado.ok ? resultado.cStat : resultado.cStat,
      xMotivo: resultado.ok ? resultado.xMotivo : resultado.xMotivo,
      total_docs: resultado.ok ? resultado.documentos.length : 0,
    },
    erro_codigo: resultado.ok ? null : resultado.cStat ?? "ERRO_GENERICO",
    erro_mensagem: resultado.ok ? null : resultado.erro,
  } as never);

  if (!resultado.ok) {
    return NextResponse.json(resultado, { status: 400 });
  }
  return NextResponse.json(resultado);
}

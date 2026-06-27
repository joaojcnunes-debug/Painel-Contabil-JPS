// API Route: Manifestação do Destinatário NF-e (REAL).
//
// POST { id_cliente, ambiente, senha, chave_nfe, tipo_evento, justificativa? }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  manifestarNFe,
  type AmbienteSefaz,
} from "@/lib/integracoes/notas-fiscais/sefaz-dfe";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  chave_nfe?: string;
  tipo_evento?: "210210" | "210200" | "210220" | "210240";
  justificativa?: string;
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

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
    return NextResponse.json({ ok: false, erro: "Apenas equipe" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const { id_cliente, ambiente, senha, chave_nfe, tipo_evento, justificativa } =
    body;
  if (
    !id_cliente ||
    !senha ||
    !chave_nfe ||
    !tipo_evento ||
    (ambiente !== 1 && ambiente !== 2)
  ) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros faltando" },
      { status: 400 }
    );
  }
  if (chave_nfe.replace(/\D/g, "").length !== 44) {
    return NextResponse.json(
      { ok: false, erro: "Chave NF-e deve ter 44 dígitos" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteSefaz;

  // Cliente — pega CNPJ/CPF
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj, cpf")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as
    | { cnpj?: string | null; cpf?: string | null }
    | null;
  const docDest = (cliente?.cnpj ?? cliente?.cpf ?? "").replace(/\D/g, "");
  if (!docDest || (docDest.length !== 14 && docDest.length !== 11)) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ/CPF válido" },
      { status: 400 }
    );
  }

  // Cert
  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path")
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false })
    .limit(1);
  const cert = (certs?.[0] ?? null) as { arquivo_path: string } | null;
  if (!cert) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum certificado A1 cadastrado" },
      { status: 400 }
    );
  }

  const { data: pfxBlob, error: blobErr } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (blobErr || !pfxBlob) {
    return NextResponse.json(
      { ok: false, erro: `Baixar cert: ${blobErr?.message}` },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  const inicio = Date.now();
  const res = await manifestarNFe({
    pfxBuffer,
    senha,
    cnpjOuCpfDestinatario: docDest,
    ambiente: amb,
    chaveNFe: chave_nfe.replace(/\D/g, ""),
    tipoEvento: tipo_evento,
    justificativa,
  });
  const duracaoMs = Date.now() - inicio;

  // Persiste o evento na tabela dedicada (mesmo em erro — registro de tentativa)
  const chaveLimpa = chave_nfe.replace(/\D/g, "");
  await supabase.from("nfe_manifestacoes").insert({
    id_manifestacao: gerarId("MNF"),
    id_cliente,
    ambiente: amb,
    chave_nfe: chaveLimpa,
    tipo_evento,
    protocolo: res.ok ? res.protocolo ?? null : null,
    c_stat: res.cStat ?? null,
    x_motivo: res.xMotivo ?? null,
    dh_registrado: res.ok ? res.dhRegEvento ?? null : null,
    justificativa: justificativa ?? null,
    ok: res.ok,
    erro: res.ok ? null : res.erro,
    enviado_por_email: user.email,
  } as never);

  // Log (mantido pra histórico unificado de chamadas a integrações)
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "NOTAS_FISCAIS",
    acao: `manifestar_${tipo_evento}`,
    modo: "REAL",
    usuario_email: user.email,
    status: res.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `chave=${chave_nfe.slice(-8)} amb=${amb}`,
    response_resumo: {
      cStat: res.ok ? res.cStat : res.cStat,
      xMotivo: res.ok ? res.xMotivo : res.xMotivo,
      protocolo: res.ok ? res.protocolo : null,
    },
    erro_codigo: res.ok ? null : res.cStat ?? "ERRO",
    erro_mensagem: res.ok ? null : res.erro,
  } as never);

  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

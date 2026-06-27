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
  cUfDeEstado,
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

type ResumoNfe = {
  chave?: string;
  numero?: string;
  serie?: string;
  emitente_cnpj?: string;
  emitente_nome?: string;
  valor?: number;
  dh_emissao?: string;
};

// Extrai metadata mínima do XML retornado pela Distribuição DFe pra indexar
// na tabela sem precisar reabrir o XML em todo SELECT.
function extrairResumoNfe(xml: string): ResumoNfe {
  const get = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1] : undefined;
  };
  let chave = get("chNFe");
  if (!chave) {
    const m = xml.match(/<infNFe[^>]+Id="NFe(\d{44})"/);
    if (m) chave = m[1];
  }
  // emitente: dentro de <emit>...<CNPJ>...</CNPJ><xNome>...</xNome></emit>
  let emitente_cnpj: string | undefined;
  let emitente_nome: string | undefined;
  const emit = xml.match(/<emit>([\s\S]*?)<\/emit>/);
  if (emit) {
    const cnpjM = emit[1].match(/<CNPJ>(\d+)<\/CNPJ>/);
    const nomeM = emit[1].match(/<xNome>([^<]+)<\/xNome>/);
    emitente_cnpj = cnpjM ? cnpjM[1] : undefined;
    emitente_nome = nomeM ? nomeM[1] : undefined;
  }
  return {
    chave,
    numero: get("nNF"),
    serie: get("serie"),
    emitente_cnpj,
    emitente_nome,
    valor: get("vNF") ? Number(get("vNF")) : undefined,
    dh_emissao: get("dhEmi"),
  };
}

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
    .select("cnpj, cpf, razao_social, estado")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as
    | {
        cnpj?: string | null;
        cpf?: string | null;
        razao_social?: string;
        estado?: string | null;
      }
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
  // Rejeita CNPJ/CPF "00000000000000" (placeholder) que tecnicamente tem
  // o tamanho certo mas não é documento real e a SEFAZ vai rejeitar com 207.
  if (/^0+$/.test(docDest)) {
    return NextResponse.json(
      { ok: false, erro: "CNPJ/CPF do cliente está zerado. Edite o cadastro." },
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
    cUFAutor: cUfDeEstado(cliente.estado),
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

  // Persiste XMLs baixados (bucket nfe-xmls + tabela nfe_dfe_recebidas)
  // Antes os XMLs eram só devolvidos ao frontend e perdidos no refresh.
  let salvos = 0;
  let saveErrors = 0;
  if (resultado.ok && resultado.documentos.length > 0) {
    for (const doc of resultado.documentos) {
      try {
        const resumo = extrairResumoNfe(doc.xml);
        if (!resumo.chave) {
          // doc sem chave reconhecível (provavelmente cancelamento/evento) — pula
          continue;
        }
        const path = `${id_cliente}/${amb}/${resumo.chave}.xml`;
        const { error: upErr } = await supabase.storage
          .from("nfe-xmls")
          .upload(path, doc.xml, {
            contentType: "application/xml",
            upsert: true,
          });
        if (upErr) {
          saveErrors++;
          continue;
        }
        // Upsert na tabela
        const { error: dbErr } = await supabase
          .from("nfe_dfe_recebidas")
          .upsert(
            {
              chave: resumo.chave,
              id_cliente,
              ambiente: amb,
              nsu: doc.nsu,
              schema_xml: doc.schema,
              xml_path: path,
              emitente_cnpj: resumo.emitente_cnpj ?? null,
              emitente_nome: resumo.emitente_nome ?? null,
              numero: resumo.numero ?? null,
              serie: resumo.serie ?? null,
              valor_total: resumo.valor ?? null,
              dh_emissao: resumo.dh_emissao ?? null,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "chave" }
          );
        if (dbErr) {
          saveErrors++;
        } else {
          salvos++;
        }
      } catch {
        saveErrors++;
      }
    }
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
      salvos,
      save_errors: saveErrors,
    },
    erro_codigo: resultado.ok ? null : resultado.cStat ?? "ERRO_GENERICO",
    erro_mensagem: resultado.ok ? null : resultado.erro,
  } as never);

  if (!resultado.ok) {
    return NextResponse.json(resultado, { status: 400 });
  }
  return NextResponse.json(resultado);
}

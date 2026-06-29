// API Route: eSocial — Enviar S-1000 (cadastro empregador, inclusão).
//
// POST { id_cliente, ambiente, senha, grupo, iniValid, nmRazao, classTrib,
//        natJurid, indCoop?, indConstr?, indDesFolha?, indOptRegEletron?,
//        indEntEd?, indEtt?, nrRegEtt?, dtRegEtt?, contato:{...} }
//
// Fluxo:
// 1. Auth + carrega cert A1 do bucket
// 2. Monta XML do S-1000 + assina XMLDSig SHA-256
// 3. Persiste em esocial_lotes (status=PENDENTE) + esocial_eventos
// 4. Envia via enviarLoteEventos
// 5. Atualiza lote com protocolo + status=ENVIADO (ou REJEITADO/ERRO)
// 6. Retorna { ok, protocolo, idLote, idEvento } pro cliente fazer
//    polling depois via /api/integracoes/esocial-consultar-lote

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { extrairKeyECert, type AmbienteEsocial } from "@/lib/integracoes/esocial/_shared";
import { enviarLoteEventos, type GrupoEnvio } from "@/lib/integracoes/esocial/enviar-lote";
import {
  montarS1000InclusaoAssinado,
  type ContatoS1000,
  type S1000IncParams,
} from "@/lib/integracoes/esocial/eventos/s1000-builder";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  grupo?: GrupoEnvio;
  iniValid?: string;
  nmRazao?: string;
  classTrib?: string;
  natJurid?: string;
  indCoop?: S1000IncParams["indCoop"];
  indConstr?: S1000IncParams["indConstr"];
  indDesFolha?: S1000IncParams["indDesFolha"];
  indOptRegEletron?: S1000IncParams["indOptRegEletron"];
  indEntEd?: S1000IncParams["indEntEd"];
  indEtt?: S1000IncParams["indEtt"];
  nrRegEtt?: string;
  dtRegEtt?: string;
  contato?: Partial<ContatoS1000>;
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

  const {
    id_cliente,
    ambiente,
    senha,
    grupo = 2,
    iniValid,
    nmRazao,
    classTrib,
    natJurid,
    contato,
  } = body;

  if (
    !id_cliente ||
    !senha ||
    (ambiente !== 1 && ambiente !== 2) ||
    !iniValid ||
    !nmRazao ||
    !classTrib ||
    !natJurid ||
    !contato?.nmCtt ||
    !contato?.cpfCtt
  ) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Parâmetros obrigatórios: id_cliente, ambiente (1|2), senha, iniValid, nmRazao, classTrib, natJurid, contato.{nmCtt,cpfCtt}",
      },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteEsocial;

  // Cliente + CNPJ
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj, razao_social")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as
    | { cnpj?: string | null; razao_social?: string }
    | null;
  if (!cliente?.cnpj) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ cadastrado" },
      { status: 400 }
    );
  }
  const cnpjLimpo = cliente.cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14 || /^0+$/.test(cnpjLimpo)) {
    return NextResponse.json(
      { ok: false, erro: "CNPJ do cliente inválido" },
      { status: 400 }
    );
  }

  // Certificado A1
  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path, titular_documento")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });
  type Cert = { arquivo_path: string; titular_documento: string };
  const certList = (certs ?? []) as unknown as Cert[];
  if (certList.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum certificado A1 cadastrado" },
      { status: 400 }
    );
  }
  const cert =
    certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];

  const { data: pfxBlob, error: blobErr } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (blobErr || !pfxBlob) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao baixar cert: ${blobErr?.message}` },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  // Extrai chave + cert pra reusar na assinatura
  let privateKeyPem: string;
  let certPem: string;
  try {
    const k = extrairKeyECert(pfxBuffer, senha);
    privateKeyPem = k.privateKeyPem;
    certPem = k.certPem;
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao ler .pfx: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  // Monta + assina o evento S-1000
  let s1000;
  try {
    s1000 = montarS1000InclusaoAssinado(
      {
        ambiente: amb,
        verProc: "PainelContabilJSP-1.0",
        cnpjCompleto: cnpjLimpo,
        iniValid,
        nmRazao,
        classTrib,
        natJurid,
        indCoop: body.indCoop,
        indConstr: body.indConstr,
        indDesFolha: body.indDesFolha,
        indOptRegEletron: body.indOptRegEletron,
        indEntEd: body.indEntEd,
        indEtt: body.indEtt,
        nrRegEtt: body.nrRegEtt,
        dtRegEtt: body.dtRegEtt,
        contato: contato as ContatoS1000,
      },
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao montar/assinar S-1000: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  // Persiste lote + evento (status PENDENTE)
  const idLote = gerarId("LOT");
  await supabase.from("esocial_lotes").insert({
    id_lote: idLote,
    id_cliente,
    ambiente: amb,
    grupo,
    status_lote: "PENDENTE",
    enviado_por_email: user.email,
    request_xml: null, // só popularemos com o envelope completo após o envio
  } as never);

  await supabase.from("esocial_eventos").insert({
    id_evento: s1000.id,
    id_lote: idLote,
    id_cliente,
    tp_evt: "S-1000",
    status_evento: "PENDENTE",
    evento_xml: s1000.xmlOriginal,
    evento_xml_signed: s1000.xmlAssinado,
  } as never);

  // Envia
  const inicio = Date.now();
  const resultado = await enviarLoteEventos({
    pfxBuffer,
    senha,
    ambiente: amb,
    cnpjEmpregador: cnpjLimpo,
    grupo,
    eventosAssinadosXml: [s1000.xmlAssinado],
  });
  const duracaoMs = Date.now() - inicio;

  // Atualiza lote conforme resultado
  if (resultado.ok) {
    await supabase
      .from("esocial_lotes")
      .update({
        protocolo: resultado.protocolo,
        cd_resposta: resultado.cdResposta,
        desc_resposta: resultado.descResposta,
        status_lote: "ENVIADO",
        enviado_em: new Date().toISOString(),
        response_xml: resultado.rawXml ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_lote", idLote);
    await supabase
      .from("esocial_eventos")
      .update({
        status_evento: "PROCESSANDO",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_evento", s1000.id);
  } else {
    const statusFinal =
      resultado.cdResposta && resultado.cdResposta !== ""
        ? "REJEITADO"
        : "ERRO";
    await supabase
      .from("esocial_lotes")
      .update({
        cd_resposta: resultado.cdResposta ?? null,
        desc_resposta: resultado.descResposta ?? null,
        status_lote: statusFinal,
        enviado_em: new Date().toISOString(),
        response_xml: resultado.rawXml ?? null,
        erro: resultado.erro,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_lote", idLote);
    await supabase
      .from("esocial_eventos")
      .update({
        status_evento: "REJEITADO",
        cd_resposta: resultado.cdResposta ?? null,
        desc_resposta: resultado.descResposta ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_evento", s1000.id);
  }

  // Log na tabela de logs gerais
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "ESOCIAL",
    acao: "enviar_s1000",
    modo: "REAL",
    usuario_email: user.email,
    status: resultado.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} idLote=${idLote} idEvt=${s1000.id}`,
    response_resumo: {
      cdResposta: resultado.cdResposta ?? null,
      descResposta: resultado.descResposta ?? null,
      protocolo: resultado.ok ? resultado.protocolo : null,
    },
    erro_codigo: resultado.ok ? null : resultado.cdResposta ?? "ERRO",
    erro_mensagem: resultado.ok ? null : resultado.erro,
  } as never);

  if (!resultado.ok) {
    return NextResponse.json(
      { ...resultado, id_lote: idLote, id_evento: s1000.id },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ...resultado,
    id_lote: idLote,
    id_evento: s1000.id,
  });
}

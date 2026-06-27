// API Route: eSocial — Consultar Identificadores de Eventos.
//
// POST { id_cliente, ambiente (1|2), senha, tpEvt?, perApur? }
//
// Faz uma chamada ao webservice WsConsultarIdentificadoresEventos do eSocial
// usando o certificado A1 do cliente. Se retornar HTTP 200 + cdResposta
// 201/211, o webservice está acessível (status check) e a lista de eventos
// vem populada (ou vazia, caso 211).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  consultarIdentificadoresEsocial,
  type AmbienteEsocial,
  type TipoEventoEsocial,
} from "@/lib/integracoes/esocial/consultar";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  tpEvt?: TipoEventoEsocial;
  dtIni?: string;  // YYYY-MM-DD
  dtFim?: string;  // YYYY-MM-DD
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

  const { id_cliente, ambiente, senha, tpEvt, dtIni, dtFim } = body;
  if (!id_cliente || !senha || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros obrigatórios: id_cliente, ambiente (1|2), senha" },
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

  // Certificado A1 (mesma lógica das outras integrações SEFAZ)
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
      {
        ok: false,
        erro: "Nenhum certificado A1 cadastrado. Cadastre em Integrações > Certificados.",
      },
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
      {
        ok: false,
        erro: `Falha ao baixar certificado: ${blobErr?.message ?? "vazio"}`,
      },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  // Chama eSocial
  const inicio = Date.now();
  const resultado = await consultarIdentificadoresEsocial({
    pfxBuffer,
    senha,
    cnpjEmpregador: cnpjLimpo,
    ambiente: amb,
    tpEvt,
    dtIni,
    dtFim,
  });
  const duracaoMs = Date.now() - inicio;

  // Log
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "ESOCIAL",
    acao: "consultar_identificadores",
    modo: "REAL",
    usuario_email: user.email,
    status: resultado.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} tpEvt=${tpEvt ?? "S-2200"} ${dtIni ?? "auto"}→${dtFim ?? "auto"}`,
    response_resumo: {
      cdResposta: resultado.ok ? resultado.cdResposta : resultado.cdResposta,
      descResposta: resultado.ok ? resultado.descResposta : resultado.descResposta,
      total: resultado.ok ? resultado.total : 0,
    },
    erro_codigo: resultado.ok ? null : resultado.cdResposta ?? "ERRO",
    erro_mensagem: resultado.ok ? null : resultado.erro,
  } as never);

  if (!resultado.ok) {
    return NextResponse.json(resultado, { status: 400 });
  }
  return NextResponse.json(resultado);
}

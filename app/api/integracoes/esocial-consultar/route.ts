// API Route: eSocial — Consultar Identificadores de Eventos.
//
// POST { id_cliente, ambiente, senha, operacao, ...filtros }
//
// Roteia entre 4 operações conforme `operacao`:
// - "Empregador":    perApur, tpEvt (S-1298/S-1299)
// - "NaoPeriodicos": dtIni, dtFim, tpEvt (S-2200, S-2300, ...)
// - "Trabalhador":   cpfTrab, perApur, tpEvt (S-1200, S-2299, ...)
// - "Tabela":        dtIni, dtFim, tpEvt (S-1010, S-1020, ...)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  consultarIdentificadoresEsocial,
  type TipoEventoEsocial,
} from "@/lib/integracoes/esocial/consultar";
import { consultarNaoPeriodicosEsocial } from "@/lib/integracoes/esocial/consultar-nao-periodicos";
import { consultarTrabalhadorEsocial } from "@/lib/integracoes/esocial/consultar-trabalhador";
import { consultarTabelaEsocial } from "@/lib/integracoes/esocial/consultar-tabela";
import type {
  AmbienteEsocial,
  OperacaoConsulta,
  RetornoConsultaErro,
  RetornoConsultaOk,
} from "@/lib/integracoes/esocial/_shared";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  operacao?: OperacaoConsulta;
  tpEvt?: string;
  perApur?: string;      // Empregador, Trabalhador
  dtIni?: string;        // NaoPeriodicos, Tabela
  dtFim?: string;        // NaoPeriodicos, Tabela
  cpfTrab?: string;      // Trabalhador
  chvEvento?: string;    // Tabela (opcional)
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
    operacao = "Empregador",
    tpEvt,
    perApur,
    dtIni,
    dtFim,
    cpfTrab,
    chvEvento,
  } = body;

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

  // Roteia pra operação correta
  const inicio = Date.now();
  let resultado: RetornoConsultaOk | RetornoConsultaErro;

  switch (operacao) {
    case "NaoPeriodicos":
      if (!tpEvt) {
        return NextResponse.json(
          { ok: false, erro: "tpEvt obrigatório pra NaoPeriodicos" },
          { status: 400 }
        );
      }
      resultado = await consultarNaoPeriodicosEsocial({
        pfxBuffer,
        senha,
        cnpjEmpregador: cnpjLimpo,
        ambiente: amb,
        tpEvt: tpEvt as Parameters<typeof consultarNaoPeriodicosEsocial>[0]["tpEvt"],
        dtIni,
        dtFim,
      });
      break;

    case "Trabalhador":
      if (!tpEvt || !cpfTrab) {
        return NextResponse.json(
          { ok: false, erro: "tpEvt e cpfTrab obrigatórios pra Trabalhador" },
          { status: 400 }
        );
      }
      resultado = await consultarTrabalhadorEsocial({
        pfxBuffer,
        senha,
        cnpjEmpregador: cnpjLimpo,
        ambiente: amb,
        tpEvt: tpEvt as Parameters<typeof consultarTrabalhadorEsocial>[0]["tpEvt"],
        cpfTrab,
        perApur,
      });
      break;

    case "Tabela":
      if (!tpEvt) {
        return NextResponse.json(
          { ok: false, erro: "tpEvt obrigatório pra Tabela" },
          { status: 400 }
        );
      }
      resultado = await consultarTabelaEsocial({
        pfxBuffer,
        senha,
        cnpjEmpregador: cnpjLimpo,
        ambiente: amb,
        tpEvt: tpEvt as Parameters<typeof consultarTabelaEsocial>[0]["tpEvt"],
        dtIni,
        dtFim,
        chvEvento,
      });
      break;

    case "Empregador":
    default:
      resultado = await consultarIdentificadoresEsocial({
        pfxBuffer,
        senha,
        cnpjEmpregador: cnpjLimpo,
        ambiente: amb,
        tpEvt: tpEvt as TipoEventoEsocial | undefined,
        perApur,
      });
      break;
  }

  const duracaoMs = Date.now() - inicio;

  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "ESOCIAL",
    acao: `consultar_${operacao.toLowerCase()}`,
    modo: "REAL",
    usuario_email: user.email,
    status: resultado.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} op=${operacao} tpEvt=${tpEvt ?? "auto"}`,
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

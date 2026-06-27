// Orquestrador: executa uma ação de integração e registra o log.
//
// Roteamento:
// - modo SIMULADO → simulador (dados fictícios deterministas por CNPJ)
// - modo REAL → switch por módulo invoca conector real correspondente.
//   Ações não implementadas em REAL caem em fallback de erro.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ModoIntegracao,
  ModuloIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "./types";
import { registrarLog } from "./logger";
import { executarSimulado } from "../simulador";
import { consultarCnpjBrasilApi } from "../receita-federal/real";
import { checarVencimentosCertificados } from "../certificado-digital/real";

type ExecutarParams = {
  supabase: SupabaseClient;
  modulo: ModuloIntegracao;
  acao: string;
  modo: ModoIntegracao;
  idConfig?: string | null;
  idCliente?: string | null;
  cnpjCliente?: string | null;
  usuario?: { email?: string | null; nome?: string | null };
  params?: Record<string, unknown>;
};

export async function executarIntegracao(
  p: ExecutarParams
): Promise<RespostaIntegracao> {
  const inicio = Date.now();
  let resposta: RespostaIntegracao;

  try {
    if (p.modo === "SIMULADO") {
      resposta = await executarSimulado({
        modulo: p.modulo,
        acao: p.acao,
        cnpjCliente: p.cnpjCliente ?? null,
        params: p.params ?? {},
      });
    } else {
      // Modo REAL — switch por (módulo, ação)
      resposta = await executarReal({
        supabase: p.supabase,
        modulo: p.modulo,
        acao: p.acao,
        idCliente: p.idCliente ?? null,
        cnpjCliente: p.cnpjCliente ?? null,
        params: p.params ?? {},
      });
    }
  } catch (e) {
    resposta = {
      modulo: p.modulo,
      acao: p.acao,
      modo: p.modo,
      ok: false,
      duracaoMs: Date.now() - inicio,
      erro: {
        codigo: "EXCECAO_INESPERADA",
        mensagem: (e as Error).message,
      },
    };
  }

  resposta.duracaoMs = Date.now() - inicio;

  // Registra log (não bloqueia se falhar)
  await registrarLog({
    supabase: p.supabase,
    idConfig: p.idConfig,
    idCliente: p.idCliente,
    modulo: p.modulo,
    acao: p.acao,
    modo: p.modo,
    usuarioEmail: p.usuario?.email,
    usuarioNome: p.usuario?.nome,
    status: resposta.ok ? "OK" : "ERRO",
    duracaoMs: resposta.duracaoMs,
    request: p.params ?? null,
    response: resposta as unknown as Record<string, unknown>,
    erroCodigo: resposta.erro?.codigo ?? null,
    erroMensagem: resposta.erro?.mensagem ?? null,
  });

  return resposta;
}

// ─── Roteamento modo REAL ──────────────────────────────────
// Cada módulo plugado aqui DEVE retornar RespostaIntegracao com modo='REAL'.
// Ações não cobertas caem em erro padronizado pra UI exibir.

type ExecutarRealParams = {
  supabase: SupabaseClient;
  modulo: ModuloIntegracao;
  acao: string;
  idCliente: string | null;
  cnpjCliente: string | null;
  params: Record<string, unknown>;
};

async function executarReal(
  p: ExecutarRealParams
): Promise<RespostaIntegracao> {
  const naoImplementado: RespostaIntegracao = {
    modulo: p.modulo,
    acao: p.acao,
    modo: "REAL",
    ok: false,
    duracaoMs: 0,
    erro: motivoNaoReal(p.modulo, p.acao),
  };

  switch (p.modulo) {
    case "RECEITA_FEDERAL":
      if (p.acao === "consultar_cnpj_brasilapi") {
        return consultarCnpjBrasilApi(p.cnpjCliente);
      }
      return naoImplementado;

    case "CERTIFICADO_DIGITAL":
      if (p.acao === "checar_vencimentos") {
        return checarVencimentosCertificados(p.supabase, p.idCliente);
      }
      return naoImplementado;

    default:
      return naoImplementado;
  }
}

// Mensagem específica por (módulo, ação) explicando POR QUE não tem REAL,
// em vez do genérico "ainda não implementado". Ajuda o usuário a entender
// se é falta de webservice público, se requer cert A1 via fluxo dedicado,
// ou se vai chegar em alguma versão futura.
function motivoNaoReal(
  modulo: ModuloIntegracao,
  acao: string
): { codigo: string; mensagem: string } {
  // Módulos com fluxo dedicado: cert A1 + senha por chamada (não persistidos)
  if (modulo === "NOTAS_FISCAIS") {
    return {
      codigo: "USE_FLUXO_DEDICADO",
      mensagem:
        "Esta ação requer Certificado A1 + senha. Use o fluxo dedicado em /integracoes/notas-fiscais (Distribuição DFe, Status SEFAZ, Manifestação).",
    };
  }
  if (modulo === "ESOCIAL") {
    return {
      codigo: "USE_FLUXO_DEDICADO",
      mensagem:
        "Esta ação requer Certificado A1 + senha. Use o fluxo dedicado em /integracoes/esocial (Consultar IDs de eventos).",
    };
  }

  // Webservices que existem mas não foram implementados ainda
  const exigeCert = new Set<ModuloIntegracao>(["EFD_REINF", "FGTS_DIGITAL"]);
  if (exigeCert.has(modulo)) {
    return {
      codigo: "REQUER_CERT_A1",
      mensagem: `Ação "${acao}" requer chamada com Certificado A1 + assinatura XMLDSig. Implementação real planejada, ainda não disponível.`,
    };
  }

  // Sem API pública gratuita
  const semApiPublica = new Set<ModuloIntegracao>([
    "SIMPLES_NACIONAL",
    "PREFEITURAS",
    "REDESIM",
    "SPED",
  ]);
  if (semApiPublica.has(modulo)) {
    return {
      codigo: "SEM_API_PUBLICA",
      mensagem: `Não há webservice público gratuito pra "${acao}". Alternativas: scraping (RPA), serviços pagos (Migrate/Conexa) ou processo manual. Use modo SIMULADO por enquanto.`,
    };
  }

  // RECEITA_FEDERAL outras ações (pendências, DCTFWeb, etc) — requer e-CAC
  if (modulo === "RECEITA_FEDERAL") {
    return {
      codigo: "REQUER_ECAC",
      mensagem: `"${acao}" requer login no e-CAC com Certificado Digital. e-CAC não tem API REST — só via sessão manual (ver /sessoes-ecac) ou RPA.`,
    };
  }

  return {
    codigo: "ACAO_REAL_NAO_IMPLEMENTADA",
    mensagem: `Ação "${acao}" do módulo ${modulo} ainda não tem implementação real. Use modo SIMULADO.`,
  };
}

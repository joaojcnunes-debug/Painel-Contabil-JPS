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
        modulo: p.modulo,
        acao: p.acao,
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
  modulo: ModuloIntegracao;
  acao: string;
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
    erro: {
      codigo: "ACAO_REAL_NAO_IMPLEMENTADA",
      mensagem: `Ação "${p.acao}" do módulo ${p.modulo} ainda não tem implementação real. Use modo SIMULADO ou aguarde a próxima versão.`,
    },
  };

  switch (p.modulo) {
    case "RECEITA_FEDERAL":
      if (p.acao === "consultar_cnpj_brasilapi") {
        return consultarCnpjBrasilApi(p.cnpjCliente);
      }
      return naoImplementado;

    // Outros módulos ainda só em SIMULADO. Conforme implementarmos
    // (Distribuição DFe SEFAZ, FGTS Digital WS, etc.) plugamos aqui.
    default:
      return naoImplementado;
  }
}

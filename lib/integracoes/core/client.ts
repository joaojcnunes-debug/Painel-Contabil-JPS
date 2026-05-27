// Orquestrador: executa uma ação de integração e registra o log.
//
// Roteamento: por enquanto, TODA execução vai pro simulador (modo SIMULADO).
// Quando partirmos pra modo REAL, este arquivo terá um switch por módulo
// que invoca a implementação real correspondente.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ModoIntegracao,
  ModuloIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "./types";
import { registrarLog } from "./logger";
import { executarSimulado } from "../simulador";

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
      // Modo REAL — ainda não implementado por módulo.
      // Quando ativar, plugar aqui: switch (modulo) { case ... }
      resposta = {
        modulo: p.modulo,
        acao: p.acao,
        modo: "REAL",
        ok: false,
        duracaoMs: 0,
        erro: {
          codigo: "MODO_REAL_NAO_IMPLEMENTADO",
          mensagem:
            "Modo real ainda não disponível para este módulo. Use modo SIMULADO.",
        },
      };
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

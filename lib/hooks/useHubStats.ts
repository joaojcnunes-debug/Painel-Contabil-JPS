"use client";

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ModuloStats = { total: number; pendente: number; recente: number };

type Filtro = (q: Contagem) => Contagem;
// Builder da contagem sem o tipo do Database: o hub consulta tabelas e a view
// vw_nfe_dfe_monitor por nome, e o filtro só aplica eq/in/gte.
type Contagem = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

type Def = {
  tabela: string;
  total?: Filtro;
  pendente?: Filtro;
  recente?: boolean; // conta created_at nos últimos 30 dias
};

function inicioMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Chave = id do cartão em /modulos. Status conferidos nos CHECKs do banco.
const DEFS: Record<string, Def> = {
  lancamentos: {
    tabela: "lancamentos",
    total: (q) => q.gte("data_lancamento", inicioMes()),
    recente: true,
  },
  conciliacao: {
    tabela: "banco_movimentos",
    pendente: (q) => q.eq("conciliado", false).eq("ignorado", false),
  },
  nfe: { tabela: "notas_fiscais", recente: true },
  "monitor-xmls": {
    tabela: "vw_nfe_dfe_monitor",
    pendente: (q) => q.eq("sem_manifestacao", true),
  },
  "pro-labore": { tabela: "socios", total: (q) => q.eq("status", "ATIVO") },
  "distribuicao-lucros": {
    tabela: "distribuicoes_lucros",
    total: (q) => q.gte("data_distribuicao", `${new Date().getFullYear()}-01-01`),
    recente: true,
  },
  folha: { tabela: "funcionarios", total: (q) => q.eq("status", "ATIVO") },
  obrigacoes: {
    tabela: "obrigacoes",
    pendente: (q) => q.in("status", ["PENDENTE", "ATRASADA"]),
    recente: true,
  },
  documentos: {
    tabela: "documentos",
    pendente: (q) => q.in("status", ["RECEBIDO", "EM_ANALISE"]),
    recente: true,
  },
  "sessoes-ecac": {
    tabela: "sessoes_ecac",
    pendente: (q) => q.eq("situacao_fiscal", "PENDENTE"),
    recente: true,
  },
  honorarios: {
    tabela: "faturas",
    pendente: (q) => q.in("status", ["ABERTA", "ATRASADA"]),
    recente: true,
  },
  clientes: { tabela: "clientes", total: (q) => q.eq("status", "Ativo") },
};

async function contar(
  supabase: SupabaseClient,
  tabela: string,
  filtro?: Filtro
): Promise<number> {
  let q = supabase.from(tabela).select("*", { count: "exact", head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Contagens do hub. Passam pelo RLS do usuário logado. Uma consulta que falha
// deixa só aquele cartão sem número; as outras seguem.
export function useHubStats() {
  return useQuery({
    queryKey: ["hub-stats"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient() as unknown as SupabaseClient;
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const entradas = await Promise.all(
        Object.entries(DEFS).map(async ([id, d]) => {
          try {
            const [total, pendente, recente] = await Promise.all([
              contar(supabase, d.tabela, d.total),
              d.pendente ? contar(supabase, d.tabela, d.pendente) : 0,
              d.recente
                ? contar(supabase, d.tabela, (q) => q.gte("created_at", desde))
                : 0,
            ]);
            return [id, { total, pendente, recente }] as const;
          } catch {
            return null;
          }
        })
      );
      const out: Record<string, ModuloStats> = {};
      for (const e of entradas) if (e) out[e[0]] = e[1];
      return out;
    },
    staleTime: 60 * 1000,
  });
}

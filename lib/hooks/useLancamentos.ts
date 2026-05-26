"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Lancamento, PlanoConta } from "@/lib/supabase/types";

export type LancamentoComJoin = Lancamento & {
  clientes: { razao_social: string } | null;
  plano_contas: { codigo: string; nome: string; tipo: string; grupo: string | null } | null;
};

export function useLancamentos(filtros?: {
  idCliente?: string;
  idConta?: string;
  tipo?: string;
  dataInicio?: string;
  dataFim?: string;
}) {
  return useQuery({
    queryKey: ["lancamentos", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("lancamentos")
        .select(
          "*, clientes(razao_social), plano_contas(codigo, nome, tipo, grupo)"
        )
        .order("data_lancamento", { ascending: false })
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.idConta) q = q.eq("id_conta", filtros.idConta);
      if (filtros?.tipo) q = q.eq("tipo", filtros.tipo);
      if (filtros?.dataInicio) q = q.gte("data_lancamento", filtros.dataInicio);
      if (filtros?.dataFim) q = q.lte("data_lancamento", filtros.dataFim);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LancamentoComJoin[];
    },
    staleTime: 30 * 1000,
  });
}

export function usePlanoContas(apenasAtivos = false) {
  return useQuery({
    queryKey: ["plano-contas", { apenasAtivos }],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("plano_contas")
        .select("*")
        .order("codigo");
      if (apenasAtivos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PlanoConta[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

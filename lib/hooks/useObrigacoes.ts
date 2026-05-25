"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Obrigacao, ObrigacaoCatalogo } from "@/lib/supabase/types";

export type ObrigacaoComJoin = Obrigacao & {
  clientes: { razao_social: string } | null;
  obrigacoes_catalogo: {
    sigla: string;
    nome: string;
    periodicidade: string;
    esfera: string;
  } | null;
};

export function useObrigacoes(filtros?: {
  competencia?: string;
  status?: string;
  idCliente?: string;
}) {
  return useQuery({
    queryKey: ["obrigacoes", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("obrigacoes")
        .select(
          "*, clientes(razao_social), obrigacoes_catalogo(sigla, nome, periodicidade, esfera)"
        )
        .order("data_vencimento", { ascending: true });

      if (filtros?.competencia) q = q.eq("competencia", filtros.competencia);
      if (filtros?.status) q = q.eq("status", filtros.status);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ObrigacaoComJoin[];
    },
    staleTime: 30 * 1000,
  });
}

// Variante por intervalo de data_vencimento — usado no calendário.
export function useObrigacoesPorIntervalo(
  inicio: string,
  fim: string,
  filtros?: { idCliente?: string }
) {
  return useQuery({
    queryKey: ["obrigacoes-intervalo", inicio, fim, filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("obrigacoes")
        .select(
          "*, clientes(razao_social), obrigacoes_catalogo(sigla, nome, periodicidade, esfera)"
        )
        .gte("data_vencimento", inicio)
        .lte("data_vencimento", fim)
        .order("data_vencimento", { ascending: true });
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as ObrigacaoComJoin[];
    },
    staleTime: 30 * 1000,
  });
}

export function useObrigacoesCatalogo(apenasAtivos = false) {
  return useQuery({
    queryKey: ["obrigacoes-catalogo", { apenasAtivos }],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("obrigacoes_catalogo")
        .select("*")
        .order("sigla");
      if (apenasAtivos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ObrigacaoCatalogo[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

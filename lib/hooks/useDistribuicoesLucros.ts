"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DistribuicaoLucro } from "@/lib/supabase/types";

export type DistribuicaoComCliente = DistribuicaoLucro & {
  clientes: { razao_social: string; cnpj: string | null } | null;
};

export function useDistribuicoesLucros(filtros: {
  ano: number;
  idCliente?: string;
  idSocio?: string;
}) {
  return useQuery({
    queryKey: ["distribuicoes-lucros", filtros],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("distribuicoes_lucros")
        .select("*, clientes(razao_social, cnpj)")
        .gte("data_distribuicao", `${filtros.ano}-01-01`)
        .lte("data_distribuicao", `${filtros.ano}-12-31`)
        .order("data_distribuicao", { ascending: false })
        .limit(5000);
      if (filtros.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros.idSocio) q = q.eq("id_socio", filtros.idSocio);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DistribuicaoComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

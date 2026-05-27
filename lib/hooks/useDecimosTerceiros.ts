"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DecimoTerceiro } from "@/lib/supabase/types";

export type DecimoComCliente = DecimoTerceiro & {
  clientes: { razao_social: string } | null;
};

export function useDecimosTerceiros(filtros?: {
  idCliente?: string;
  ano?: number;
}) {
  return useQuery({
    queryKey: ["decimos-terceiros", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("decimos_terceiros")
        .select("*, clientes(razao_social)")
        .order("ano", { ascending: false })
        .order("nome_func")
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.ano) q = q.eq("ano", filtros.ano);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DecimoComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

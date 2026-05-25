"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Fatura } from "@/lib/supabase/types";

export type FaturaComCliente = Fatura & {
  clientes: { razao_social: string } | null;
};

export function useFaturas(filtros?: {
  competencia?: string;
  status?: string;
  idCliente?: string;
}) {
  return useQuery({
    queryKey: ["faturas", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("faturas")
        .select("*, clientes(razao_social)")
        .order("data_vencimento", { ascending: false })
        .limit(300);
      if (filtros?.competencia) q = q.eq("competencia", filtros.competencia);
      if (filtros?.status) q = q.eq("status", filtros.status);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FaturaComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

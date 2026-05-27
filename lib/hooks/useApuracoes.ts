"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ApuracaoSimples } from "@/lib/supabase/types";

export type ApuracaoComCliente = ApuracaoSimples & {
  clientes: { razao_social: string; anexo_simples: string | null } | null;
};

export function useApuracoes(filtros?: {
  idCliente?: string;
  competencia?: string;
}) {
  return useQuery({
    queryKey: ["apuracoes", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("apuracoes_simples")
        .select("*, clientes(razao_social, anexo_simples)")
        .order("competencia", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.competencia) q = q.eq("competencia", filtros.competencia);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApuracaoComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

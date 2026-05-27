"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IntegracaoLog } from "@/lib/supabase/types";

export type IntegracaoLogComCliente = IntegracaoLog & {
  clientes: { razao_social: string } | null;
};

export function useIntegracoesLogs(filtros?: {
  idCliente?: string;
  modulo?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["integracoes-logs", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("integracoes_logs")
        .select("*, clientes(razao_social)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.modulo) q = q.eq("modulo", filtros.modulo);
      if (filtros?.status) q = q.eq("status", filtros.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as IntegracaoLogComCliente[];
    },
    staleTime: 15 * 1000,
  });
}

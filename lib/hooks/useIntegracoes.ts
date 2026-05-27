"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IntegracaoConfig } from "@/lib/supabase/types";

export type IntegracaoConfigComCliente = IntegracaoConfig & {
  clientes: { razao_social: string; cnpj: string | null } | null;
};

export function useIntegracoes(filtros?: { idCliente?: string }) {
  return useQuery({
    queryKey: ["integracoes-config", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("integracoes_config")
        .select("*, clientes(razao_social, cnpj)")
        .order("modulo");
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as IntegracaoConfigComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

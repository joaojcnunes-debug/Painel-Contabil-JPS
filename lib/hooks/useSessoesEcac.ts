"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SessaoEcac } from "@/lib/supabase/types";

export type SessaoEcacComCliente = SessaoEcac & {
  clientes: { razao_social: string; cnpj: string | null } | null;
};

export function useSessoesEcac(filtros?: {
  idCliente?: string;
  situacao?: string;
}) {
  return useQuery({
    queryKey: ["sessoes-ecac", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("sessoes_ecac")
        .select("*, clientes(razao_social, cnpj)")
        .order("iniciada_em", { ascending: false })
        .limit(200);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.situacao) q = q.eq("situacao_fiscal", filtros.situacao);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SessaoEcacComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

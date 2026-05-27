"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotaFiscal } from "@/lib/supabase/types";

export type NotaFiscalComCliente = NotaFiscal & {
  clientes: { razao_social: string } | null;
};

export function useNotasFiscais(filtros?: {
  idCliente?: string;
  tipo?: string;
  busca?: string;
  dataInicio?: string;
  dataFim?: string;
}) {
  return useQuery({
    queryKey: ["notas-fiscais", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("notas_fiscais")
        .select("*, clientes(razao_social)")
        .order("data_emissao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.tipo) q = q.eq("tipo", filtros.tipo);
      if (filtros?.dataInicio) q = q.gte("data_emissao", filtros.dataInicio);
      if (filtros?.dataFim) q = q.lte("data_emissao", filtros.dataFim);
      if (filtros?.busca)
        q = q.or(
          `numero.ilike.%${filtros.busca}%,emit_nome.ilike.%${filtros.busca}%,dest_nome.ilike.%${filtros.busca}%`
        );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as NotaFiscalComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

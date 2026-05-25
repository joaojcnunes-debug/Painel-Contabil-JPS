"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Documento } from "@/lib/supabase/types";

export type DocumentoComCliente = Documento & {
  clientes: { razao_social: string } | null;
};

export function useDocumentos(filtros?: {
  idCliente?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["documentos", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("documentos")
        .select("*, clientes(razao_social)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.status) q = q.eq("status", filtros.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Documento } from "@/lib/supabase/types";

export function useDocumentosPorCliente(idCliente: string) {
  return useQuery({
    queryKey: ["documentos-cliente", idCliente],
    enabled: !!idCliente,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("documentos")
        .select(
          "id_documento, tipo, arquivo_nome, descricao, competencia, created_at"
        )
        .eq("id_cliente", idCliente)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        id_documento: string;
        tipo: string;
        arquivo_nome: string;
        descricao: string | null;
        competencia: string | null;
        created_at: string;
      }>;
    },
    staleTime: 30 * 1000,
  });
}

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

"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FolhaItem, FolhaPagamento } from "@/lib/supabase/types";

export type FolhaComCliente = FolhaPagamento & {
  clientes: { razao_social: string } | null;
};

export function useFolhas(filtros?: { idCliente?: string }) {
  return useQuery({
    queryKey: ["folhas-pagamento", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("folhas_pagamento")
        .select("*, clientes(razao_social)")
        .order("competencia", { ascending: false })
        .limit(120);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FolhaComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

export function useFolhaItens(idFolha: string | null) {
  return useQuery({
    queryKey: ["folha-itens", idFolha],
    queryFn: async () => {
      if (!idFolha) return [];
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("folha_itens")
        .select("*")
        .eq("id_folha", idFolha)
        .order("nome_func");
      if (error) throw error;
      return (data ?? []) as unknown as FolhaItem[];
    },
    enabled: !!idFolha,
    staleTime: 60 * 1000,
  });
}

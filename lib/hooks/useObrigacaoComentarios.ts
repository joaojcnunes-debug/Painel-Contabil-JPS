"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ObrigacaoComentario } from "@/lib/supabase/types";

export function useObrigacaoComentarios(idObrigacao: string) {
  return useQuery({
    queryKey: ["obrigacao-comentarios", idObrigacao],
    enabled: !!idObrigacao,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("obrigacoes_comentarios")
        .select("*")
        .eq("id_obrigacao", idObrigacao)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ObrigacaoComentario[];
    },
    staleTime: 30 * 1000,
  });
}

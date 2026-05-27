"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Ferias } from "@/lib/supabase/types";

export type FeriasComCliente = Ferias & {
  clientes: { razao_social: string } | null;
};

export function useFerias(filtros?: {
  idCliente?: string;
  idFuncionario?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["ferias", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("ferias")
        .select("*, clientes(razao_social)")
        .order("data_inicio_gozo", { ascending: false })
        .limit(300);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.idFuncionario)
        q = q.eq("id_funcionario", filtros.idFuncionario);
      if (filtros?.status) q = q.eq("status", filtros.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FeriasComCliente[];
    },
    staleTime: 30 * 1000,
  });
}

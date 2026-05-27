"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Funcionario } from "@/lib/supabase/types";

export type FuncionarioComCliente = Funcionario & {
  clientes: { razao_social: string } | null;
};

export function useFuncionarios(filtros?: {
  idCliente?: string;
  status?: string;
  busca?: string;
}) {
  return useQuery({
    queryKey: ["funcionarios", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("funcionarios")
        .select("*, clientes(razao_social)")
        .order("nome", { ascending: true })
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.status) q = q.eq("status", filtros.status);
      if (filtros?.busca) q = q.ilike("nome", `%${filtros.busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FuncionarioComCliente[];
    },
    staleTime: 60 * 1000,
  });
}

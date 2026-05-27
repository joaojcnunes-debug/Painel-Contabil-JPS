"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProLaborePagamento, Socio } from "@/lib/supabase/types";

export type SocioComCliente = Socio & {
  clientes: { razao_social: string } | null;
};

export function useSocios(filtros?: {
  idCliente?: string;
  status?: string;
  busca?: string;
}) {
  return useQuery({
    queryKey: ["socios", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("socios")
        .select("*, clientes(razao_social)")
        .order("nome", { ascending: true })
        .limit(300);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.status) q = q.eq("status", filtros.status);
      if (filtros?.busca) q = q.ilike("nome", `%${filtros.busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SocioComCliente[];
    },
    staleTime: 60 * 1000,
  });
}

export type ProLaborePagComJoin = ProLaborePagamento & {
  clientes: { razao_social: string } | null;
};

export function useProLabore(filtros?: {
  idCliente?: string;
  idSocio?: string;
  competencia?: string;
}) {
  return useQuery({
    queryKey: ["pro-labore", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("pro_labore_pagamentos")
        .select("*, clientes(razao_social)")
        .order("competencia", { ascending: false })
        .order("nome_socio")
        .limit(500);
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      if (filtros?.idSocio) q = q.eq("id_socio", filtros.idSocio);
      if (filtros?.competencia) q = q.eq("competencia", filtros.competencia);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProLaborePagComJoin[];
    },
    staleTime: 30 * 1000,
  });
}

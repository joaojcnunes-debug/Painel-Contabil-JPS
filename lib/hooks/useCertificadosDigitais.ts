"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CertificadoDigital } from "@/lib/supabase/types";

export type CertificadoComCliente = CertificadoDigital & {
  clientes: { razao_social: string } | null;
};

export function useCertificadosDigitais(filtros?: { idCliente?: string }) {
  return useQuery({
    queryKey: ["certificados-digitais", filtros ?? {}],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("certificados_digitais")
        .select("*, clientes(razao_social)")
        .order("validade_fim", { ascending: true, nullsFirst: false });
      if (filtros?.idCliente) q = q.eq("id_cliente", filtros.idCliente);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CertificadoComCliente[];
    },
    staleTime: 60 * 1000,
  });
}

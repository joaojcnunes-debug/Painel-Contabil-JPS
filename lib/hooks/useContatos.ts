"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ClienteContato } from "@/lib/supabase/types";

export function useContatos(idCliente: string) {
  return useQuery({
    queryKey: ["contatos", idCliente],
    enabled: !!idCliente,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("clientes_contatos")
        .select("*")
        .eq("id_cliente", idCliente)
        .order("principal", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClienteContato[];
    },
    staleTime: 60 * 1000,
  });
}

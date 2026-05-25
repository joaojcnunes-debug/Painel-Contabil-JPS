"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Cliente } from "@/lib/supabase/types";

export function useClientes() {
  return useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as unknown as Cliente[];
    },
    staleTime: 60 * 1000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Usuario } from "@/lib/supabase/types";

export function useUsuarios() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Usuario[];
    },
    staleTime: 60 * 1000,
  });
}

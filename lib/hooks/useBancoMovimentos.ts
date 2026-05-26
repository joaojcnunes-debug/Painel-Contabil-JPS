"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BancoMovimento } from "@/lib/supabase/types";

type Estado = "pendentes" | "conciliados" | "ignorados";

export function useBancoMovimentos(idCliente: string, estado: Estado) {
  return useQuery({
    queryKey: ["banco-movimentos", idCliente, estado],
    enabled: !!idCliente,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase
        .from("banco_movimentos")
        .select("*")
        .eq("id_cliente", idCliente)
        .order("data_movimento", { ascending: false })
        .limit(500);
      if (estado === "pendentes") {
        q = q.eq("conciliado", false).eq("ignorado", false);
      } else if (estado === "conciliados") {
        q = q.eq("conciliado", true);
      } else {
        q = q.eq("ignorado", true);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BancoMovimento[];
    },
    staleTime: 30 * 1000,
  });
}

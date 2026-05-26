"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BancoMovimento } from "@/lib/supabase/types";

export type CandidatoLancamento = {
  id_lancamento: string;
  data_lancamento: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  descricao: string;
};

// Carrega lançamentos do cliente (últimos 90d + futuros 30d) que ainda
// não estão vinculados a NENHUM movimento — base pra sugestão de matching.
export function useLancamentosLivres(idCliente: string) {
  return useQuery({
    queryKey: ["lancamentos-livres", idCliente],
    enabled: !!idCliente,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const hoje = new Date();
      const ini = new Date(hoje);
      ini.setDate(ini.getDate() - 90);
      const fim = new Date(hoje);
      fim.setDate(fim.getDate() + 30);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const { data: lancs, error } = await supabase
        .from("lancamentos")
        .select("id_lancamento, data_lancamento, tipo, valor, descricao")
        .eq("id_cliente", idCliente)
        .gte("data_lancamento", iso(ini))
        .lte("data_lancamento", iso(fim))
        .limit(2000);
      if (error) throw error;

      const { data: vincs } = await supabase
        .from("banco_movimentos")
        .select("id_lancamento")
        .eq("id_cliente", idCliente)
        .not("id_lancamento", "is", null);
      const usados = new Set(
        ((vincs ?? []) as Array<{ id_lancamento: string | null }>)
          .map((v) => v.id_lancamento)
          .filter((x): x is string => !!x)
      );

      return ((lancs ?? []) as CandidatoLancamento[]).filter(
        (l) => !usados.has(l.id_lancamento)
      );
    },
    staleTime: 30 * 1000,
  });
}

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

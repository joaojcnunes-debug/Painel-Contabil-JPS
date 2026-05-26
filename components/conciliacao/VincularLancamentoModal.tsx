"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Link2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import type { BancoMovimento } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  movimento: BancoMovimento | null;
};

type LancamentoMatch = {
  id_lancamento: string;
  data_lancamento: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  descricao: string;
  plano_contas: { codigo: string; nome: string } | null;
};

export function VincularLancamentoModal({ open, onClose, movimento }: Props) {
  const qc = useQueryClient();

  // Busca lançamentos do mesmo cliente, dentro de ±15 dias do movimento,
  // ainda não vinculados a outro movimento (heurística: mesmo valor absoluto)
  const valorAbs = movimento ? Math.abs(Number(movimento.valor)) : 0;
  const tipoEsperado: "RECEITA" | "DESPESA" =
    movimento && Number(movimento.valor) > 0 ? "RECEITA" : "DESPESA";

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: [
      "lancamentos-candidatos",
      movimento?.id_movimento,
      movimento?.id_cliente,
    ],
    enabled: !!movimento,
    queryFn: async () => {
      if (!movimento) return [];
      const supabase = createSupabaseBrowserClient();
      // ±15 dias da data
      const d = new Date(movimento.data_movimento);
      const min = new Date(d);
      min.setDate(min.getDate() - 15);
      const max = new Date(d);
      max.setDate(max.getDate() + 15);
      const iso = (x: Date) => x.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("lancamentos")
        .select(
          "id_lancamento, data_lancamento, tipo, valor, descricao, plano_contas(codigo, nome)"
        )
        .eq("id_cliente", movimento.id_cliente)
        .eq("tipo", tipoEsperado)
        .gte("data_lancamento", iso(min))
        .lte("data_lancamento", iso(max))
        .order("data_lancamento", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as LancamentoMatch[];
    },
  });

  // Ordena por similaridade de valor (mais próximos primeiro)
  const ordenados = useMemo(() => {
    return [...candidatos].sort((a, b) => {
      const da = Math.abs(Math.abs(Number(a.valor)) - valorAbs);
      const db = Math.abs(Math.abs(Number(b.valor)) - valorAbs);
      return da - db;
    });
  }, [candidatos, valorAbs]);

  const vincular = useMutation({
    mutationFn: async (idLancamento: string) => {
      if (!movimento) throw new Error("Sem movimento");
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("banco_movimentos")
        .update({
          conciliado: true,
          id_lancamento: idLancamento,
          ignorado: false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_movimento", movimento.id_movimento);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      toast.success("Movimento vinculado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!movimento) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular a lançamento existente"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Cabeçalho do movimento */}
        <div className="bg-gray-50 border border-card-border rounded-lg p-3">
          <div className="text-[10px] uppercase text-gray-500">Movimento</div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-sm font-medium text-gray-800">
              {movimento.descricao}
            </div>
            <div
              className={
                Number(movimento.valor) >= 0
                  ? "text-sm font-bold text-verde-dark"
                  : "text-sm font-bold text-red-alert"
              }
            >
              {formatBRL(Number(movimento.valor))}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatDate(movimento.data_movimento)} •{" "}
            {tipoEsperado === "RECEITA" ? "Crédito" : "Débito"}
          </div>
        </div>

        <div className="text-xs text-gray-500 leading-relaxed">
          Mostrando lançamentos {tipoEsperado.toLowerCase()}s do mesmo
          cliente em ±15 dias da data do movimento. Os com valor mais
          próximo aparecem no topo.
        </div>

        <div className="border border-card-border rounded-lg overflow-hidden max-h-72 overflow-y-auto divide-y divide-card-border">
          {isLoading && (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              Carregando…
            </div>
          )}
          {!isLoading && ordenados.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              Nenhum lançamento candidato encontrado. Crie um novo com{" "}
              <strong>Lançar</strong>.
            </div>
          )}
          {ordenados.map((l) => {
            const valor = Math.abs(Number(l.valor));
            const dist = Math.abs(valor - valorAbs);
            const match = dist === 0;
            return (
              <button
                key={l.id_lancamento}
                onClick={() => vincular.mutate(l.id_lancamento)}
                disabled={vincular.isPending}
                className="w-full px-3 py-2 hover:bg-verde-light/40 text-left flex items-center gap-3"
              >
                <Link2
                  size={14}
                  className={match ? "text-verde-primary" : "text-gold"}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">
                    {l.descricao}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(l.data_lancamento)} •{" "}
                    {l.plano_contas?.codigo} {l.plano_contas?.nome}
                  </div>
                </div>
                <div
                  className={
                    match
                      ? "text-sm font-bold text-verde-dark whitespace-nowrap"
                      : "text-sm text-gray-700 whitespace-nowrap"
                  }
                >
                  {formatBRL(valor)}
                  {!match && (
                    <div className="text-[10px] text-amber-700">
                      Δ {formatBRL(dist)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId, formatBRL } from "@/lib/utils";
import type { Cliente } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function venctoDoMes(comp: string, dia: number): string {
  const [y, m] = comp.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

const DIA_PADRAO = 10;

export function GeradorFaturasModal({ open, onClose, clientes }: Props) {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());

  useEffect(() => {
    if (open) setCompetencia(competenciaAtual());
  }, [open]);

  const elegiveis = useMemo(
    () =>
      clientes.filter(
        (c) =>
          c.status === "Ativo" &&
          c.honorario_mensal != null &&
          Number(c.honorario_mensal) > 0
      ),
    [clientes]
  );

  const totalEstimado = elegiveis.reduce(
    (acc, c) => acc + Number(c.honorario_mensal ?? 0),
    0
  );

  const gerar = useMutation({
    mutationFn: async () => {
      if (!competencia) throw new Error("Informe a competência");
      if (elegiveis.length === 0)
        throw new Error("Nenhum cliente ativo com honorário definido");

      const supabase = createSupabaseBrowserClient();

      const { data: existentes, error: errEx } = await supabase
        .from("faturas")
        .select("id_cliente")
        .eq("competencia", competencia);
      if (errEx) throw errEx;
      const jaTem = new Set(
        ((existentes ?? []) as Array<{ id_cliente: string }>).map(
          (e) => e.id_cliente
        )
      );

      const novas: Array<Record<string, unknown>> = [];
      for (const c of elegiveis) {
        if (jaTem.has(c.id_cliente)) continue;
        const dia = c.dia_vencimento ?? DIA_PADRAO;
        novas.push({
          id_fatura: gerarId("FAT"),
          id_cliente: c.id_cliente,
          competencia,
          valor: c.honorario_mensal,
          data_vencimento: venctoDoMes(competencia, dia),
          status: "ABERTA",
          descricao: `Honorários contábeis — ${competencia}`,
        });
      }

      if (novas.length === 0) {
        return {
          criadas: 0,
          puladas: elegiveis.length,
          valorTotal: 0,
        };
      }

      const { error } = await supabase.from("faturas").insert(novas as never);
      if (error) throw error;
      const valorTotal = novas.reduce(
        (acc, n) => acc + Number(n.valor ?? 0),
        0
      );
      return {
        criadas: novas.length,
        puladas: elegiveis.length - novas.length,
        valorTotal,
      };
    },
    onSuccess: ({ criadas, puladas, valorTotal }) => {
      qc.invalidateQueries({ queryKey: ["faturas"] });
      if (criadas === 0) toast.success(`Nada a gerar — ${puladas} já existiam`);
      else
        toast.success(
          `${criadas} fatura${criadas === 1 ? "" : "s"} (${formatBRL(valorTotal)})` +
            (puladas > 0 ? ` — ${puladas} pulada${puladas === 1 ? "" : "s"}` : "")
        );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar faturas do mês"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || elegiveis.length === 0}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            {gerar.isPending ? "Gerando..." : "Gerar faturas"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Competência" required>
          <input
            type="month"
            className={inputClass}
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </Field>

        <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark space-y-1">
          <div>
            <strong>{elegiveis.length}</strong> cliente
            {elegiveis.length !== 1 && "s"} ativo
            {elegiveis.length !== 1 && "s"} com honorário definido
          </div>
          <div className="font-serif text-lg font-bold">
            Total estimado: {formatBRL(totalEstimado)}
          </div>
          <div className="text-xs text-verde-dark/70">
            Vencimento conforme dia configurado no cadastro (ou dia {DIA_PADRAO} se
            não houver). Clientes que já têm fatura nessa competência são pulados.
          </div>
        </div>

        {clientes.some(
          (c) => c.status === "Ativo" && (c.honorario_mensal == null || Number(c.honorario_mensal) <= 0)
        ) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Há clientes ativos sem honorário cadastrado — eles não entram no lote.
            Configure em <strong>/clientes → editar</strong>.
          </div>
        )}
      </div>
    </Modal>
  );
}

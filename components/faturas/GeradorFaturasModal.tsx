"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { gerarId, formatBRL, formatCNPJ } from "@/lib/utils";
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

const DIA_PADRAO_FALLBACK = 10;

export function GeradorFaturasModal({ open, onClose, clientes }: Props) {
  const qc = useQueryClient();
  const { data: cfg } = useConfiguracao();
  const DIA_PADRAO = cfg?.dia_padrao_fechamento ?? DIA_PADRAO_FALLBACK;

  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [idsClientes, setIdsClientes] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (!open) return;
    setCompetencia(competenciaAtual());
    setIdsClientes(new Set(elegiveis.map((c) => c.id_cliente)));
  }, [open, elegiveis]);

  const selecionados = elegiveis.filter((c) => idsClientes.has(c.id_cliente));
  const totalEstimado = selecionados.reduce(
    (acc, c) => acc + Number(c.honorario_mensal ?? 0),
    0
  );

  const gerar = useMutation({
    mutationFn: async () => {
      if (!competencia) throw new Error("Informe a competência");
      if (selecionados.length === 0)
        throw new Error("Selecione ao menos 1 cliente");

      const supabase = createSupabaseBrowserClient();

      const { data: existentes, error: errEx } = await supabase
        .from("faturas")
        .select("id_cliente")
        .eq("competencia", competencia)
        .in(
          "id_cliente",
          selecionados.map((c) => c.id_cliente)
        );
      if (errEx) throw errEx;
      const jaTem = new Set(
        ((existentes ?? []) as Array<{ id_cliente: string }>).map(
          (e) => e.id_cliente
        )
      );

      const novas: Array<Record<string, unknown>> = [];
      for (const c of selecionados) {
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
        return { criadas: 0, puladas: selecionados.length, valorTotal: 0 };
      }

      const { error } = await supabase.from("faturas").insert(novas as never);
      if (error) throw error;
      const valorTotal = novas.reduce(
        (acc, n) => acc + Number(n.valor ?? 0),
        0
      );
      return {
        criadas: novas.length,
        puladas: selecionados.length - novas.length,
        valorTotal,
      };
    },
    onSuccess: ({ criadas, puladas, valorTotal }) => {
      qc.invalidateQueries({ queryKey: ["faturas"] });
      if (criadas === 0)
        toast.success(`Nada a gerar — ${puladas} já existiam`);
      else
        toast.success(
          `${criadas} fatura${criadas === 1 ? "" : "s"} (${formatBRL(valorTotal)})` +
            (puladas > 0 ? ` — ${puladas} pulada${puladas === 1 ? "" : "s"}` : "")
        );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const semHonorarios = clientes.filter(
    (c) =>
      c.status === "Ativo" &&
      (c.honorario_mensal == null || Number(c.honorario_mensal) <= 0)
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar faturas do mês"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || idsClientes.size === 0}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            {gerar.isPending
              ? "Gerando..."
              : `Gerar ${selecionados.length} fatura${selecionados.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Competência" required>
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </Field>
          <Field
            label={`Clientes (${elegiveis.length} com honorário)`}
            required
          >
            <MultiSelectDropdown
              items={elegiveis.map((c) => ({
                id: c.id_cliente,
                label: c.razao_social,
                sub: `${formatBRL(c.honorario_mensal)}${c.cnpj ? ` • ${formatCNPJ(c.cnpj)}` : ""}`,
              }))}
              selected={idsClientes}
              onChange={setIdsClientes}
              placeholder="Selecione clientes..."
            />
          </Field>
        </div>

        <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark">
          <div className="flex items-center justify-between">
            <div>
              <strong>{selecionados.length}</strong> fatura
              {selecionados.length !== 1 && "s"} a gerar
            </div>
            <div className="font-serif text-lg font-bold">
              {formatBRL(totalEstimado)}
            </div>
          </div>
          <div className="text-xs text-verde-dark/70 mt-2">
            Vencimento conforme dia configurado no cadastro do cliente (ou dia{" "}
            {DIA_PADRAO} se não houver). Clientes com fatura já lançada nessa
            competência são pulados.
          </div>
        </div>

        {semHonorarios.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>{semHonorarios.length}</strong> cliente
            {semHonorarios.length !== 1 && "s"} ativo sem honorário cadastrado
            — não entra{semHonorarios.length === 1 ? "" : "m"} na lista.
            Configure em <strong>/clientes → editar</strong>.
          </div>
        )}
      </div>
    </Modal>
  );
}

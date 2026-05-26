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
import type { LancamentoModeloComJoin } from "@/lib/hooks/useLancamentos";

type Props = {
  open: boolean;
  onClose: () => void;
  modelos: LancamentoModeloComJoin[];
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dataDoMes(comp: string, dia: number): string {
  const [y, m] = comp.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

export function GeradorLancamentosModal({ open, onClose, modelos }: Props) {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const ativos = useMemo(
    () => modelos.filter((m) => m.ativo),
    [modelos]
  );

  useEffect(() => {
    if (!open) return;
    setCompetencia(competenciaAtual());
    setSelecionados(new Set(ativos.map((m) => m.id_modelo)));
  }, [open, ativos]);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll(marcar: boolean) {
    if (marcar) setSelecionados(new Set(ativos.map((m) => m.id_modelo)));
    else setSelecionados(new Set());
  }

  const selecionadosArr = ativos.filter((m) => selecionados.has(m.id_modelo));
  const totalValor = selecionadosArr.reduce(
    (acc, m) => acc + Number(m.valor),
    0
  );

  const gerar = useMutation({
    mutationFn: async () => {
      if (!competencia) throw new Error("Informe a competência");
      if (selecionados.size === 0)
        throw new Error("Selecione ao menos 1 modelo");

      const supabase = createSupabaseBrowserClient();

      // Detecta lançamentos já existentes desse modelo + competência via descrição
      // (heurística: marca descrição com identificador)
      const tagModelo = (id: string) => `[recorrente:${id}]`;

      const { data: existentes, error: errEx } = await supabase
        .from("lancamentos")
        .select("descricao")
        .eq("competencia", competencia)
        .like("descricao", "%[recorrente:%");
      if (errEx) throw errEx;
      const jaTem = new Set<string>();
      for (const e of (existentes ?? []) as Array<{ descricao: string }>) {
        const m = e.descricao.match(/\[recorrente:([^\]]+)\]/);
        if (m) jaTem.add(m[1]);
      }

      const novos: Array<Record<string, unknown>> = [];
      let pulados = 0;
      for (const mdl of selecionadosArr) {
        if (jaTem.has(mdl.id_modelo)) {
          pulados++;
          continue;
        }
        const data = dataDoMes(competencia, mdl.dia_mes);
        novos.push({
          id_lancamento: gerarId("LCT"),
          id_cliente: mdl.id_cliente,
          id_conta: mdl.id_conta,
          data_lancamento: data,
          competencia,
          tipo: mdl.tipo,
          valor: mdl.valor,
          descricao: `${mdl.descricao} ${tagModelo(mdl.id_modelo)}`,
          documento_ref: mdl.documento_ref,
          observacoes: mdl.observacoes,
        });
      }

      if (novos.length === 0) return { criados: 0, pulados };

      const { error } = await supabase
        .from("lancamentos")
        .insert(novos as never);
      if (error) throw error;
      return { criados: novos.length, pulados };
    },
    onSuccess: ({ criados, pulados }) => {
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      let msg = `${criados} lançament${criados === 1 ? "o gerado" : "os gerados"}`;
      if (pulados > 0)
        msg += ` • ${pulados} já existia${pulados === 1 ? "" : "m"}`;
      toast.success(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar lançamentos recorrentes"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || selecionados.size === 0}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            {gerar.isPending
              ? "Gerando..."
              : `Gerar ${selecionados.size} lançament${selecionados.size === 1 ? "o" : "os"}`}
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

        <div className="bg-verde-light border border-verde-border rounded-lg p-3 text-sm text-verde-dark flex items-center justify-between">
          <div>
            <strong>{selecionados.size}</strong> de {ativos.length} modelos
            selecionados
          </div>
          <div className="font-serif text-lg font-bold">
            {formatBRL(totalValor)}
          </div>
        </div>

        <div className="border border-card-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-card-border text-xs">
            <span className="text-gray-600">Modelos ativos</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-gold hover:text-verde-dark"
              >
                Todos
              </button>
              <span className="text-gray-300">/</span>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-gold hover:text-verde-dark"
              >
                Nenhum
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-card-border">
            {ativos.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-gray-500">
                Nenhum modelo recorrente ativo.{" "}
                <span className="block mt-1">
                  Cadastre em /lancamentos/recorrentes.
                </span>
              </div>
            )}
            {ativos.map((m) => (
              <label
                key={m.id_modelo}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selecionados.has(m.id_modelo)}
                  onChange={() => toggle(m.id_modelo)}
                  className="rounded border-gray-300 text-verde-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-800 truncate">
                    <span className="font-mono text-xs text-verde-dark mr-2">
                      dia {String(m.dia_mes).padStart(2, "0")}
                    </span>
                    {m.descricao}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {m.clientes?.razao_social ?? "—"} •{" "}
                    {m.plano_contas?.codigo} {m.plano_contas?.nome}
                  </div>
                </div>
                <div
                  className={
                    m.tipo === "RECEITA"
                      ? "text-sm font-medium text-verde-dark whitespace-nowrap"
                      : "text-sm font-medium text-red-alert whitespace-nowrap"
                  }
                >
                  {m.tipo === "RECEITA" ? "+" : "−"} {formatBRL(Number(m.valor))}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-500 leading-relaxed">
          Lançamentos gerados ficam marcados como recorrentes via tag oculta
          na descrição. Re-rodar o gerador pra mesma competência não duplica
          (idempotente).
        </div>
      </div>
    </Modal>
  );
}

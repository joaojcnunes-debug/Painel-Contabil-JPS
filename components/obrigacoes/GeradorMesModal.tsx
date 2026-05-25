"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { Cliente, ObrigacaoCatalogo } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  catalogo: ObrigacaoCatalogo[];
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function venctoDoMes(comp: string, dia: number | null): string | null {
  if (!comp || !dia) return null;
  const [y, m] = comp.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

export function GeradorMesModal({ open, onClose, clientes, catalogo }: Props) {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [incluirTrim, setIncluirTrim] = useState(false);
  const [incluirAnual, setIncluirAnual] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCompetencia(competenciaAtual());
    setIncluirTrim(false);
    setIncluirAnual(false);
  }, [open]);

  const clientesAtivos = useMemo(
    () => clientes.filter((c) => c.status === "Ativo"),
    [clientes]
  );

  const itensSelecionados = useMemo(() => {
    return catalogo
      .filter((c) => c.ativo)
      .filter((c) => {
        if (c.periodicidade === "MENSAL") return true;
        if (c.periodicidade === "TRIMESTRAL") return incluirTrim;
        if (c.periodicidade === "ANUAL") return incluirAnual;
        return false; // EVENTUAL nunca
      });
  }, [catalogo, incluirTrim, incluirAnual]);

  const totalEstimado = clientesAtivos.length * itensSelecionados.length;

  const gerar = useMutation({
    mutationFn: async () => {
      if (!competencia) throw new Error("Informe a competência");
      if (clientesAtivos.length === 0)
        throw new Error("Nenhum cliente ativo cadastrado");
      if (itensSelecionados.length === 0)
        throw new Error("Nenhum item do catálogo selecionado");

      const supabase = createSupabaseBrowserClient();

      // Busca tudo que já existe nessa competência pra evitar duplicidade
      const { data: existentes, error: errEx } = await supabase
        .from("obrigacoes")
        .select("id_cliente, id_obrigacao_catalogo")
        .eq("competencia", competencia);
      if (errEx) throw errEx;
      const jaTem = new Set(
        ((existentes ?? []) as Array<{
          id_cliente: string;
          id_obrigacao_catalogo: string;
        }>).map((e) => `${e.id_cliente}::${e.id_obrigacao_catalogo}`)
      );

      const novos: Array<Record<string, unknown>> = [];
      for (const cli of clientesAtivos) {
        for (const item of itensSelecionados) {
          const chave = `${cli.id_cliente}::${item.id_obrigacao_catalogo}`;
          if (jaTem.has(chave)) continue;
          const venc = venctoDoMes(competencia, item.dia_vencimento_padrao);
          if (!venc) continue; // pula itens sem dia padrão configurado
          novos.push({
            id_obrigacao: gerarId("OBR"),
            id_cliente: cli.id_cliente,
            id_obrigacao_catalogo: item.id_obrigacao_catalogo,
            competencia,
            data_vencimento: venc,
            status: "PENDENTE",
          });
        }
      }

      if (novos.length === 0) {
        return { criadas: 0, puladas: totalEstimado };
      }

      const { error } = await supabase
        .from("obrigacoes")
        .insert(novos as never);
      if (error) throw error;
      return { criadas: novos.length, puladas: totalEstimado - novos.length };
    },
    onSuccess: ({ criadas, puladas }) => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      if (criadas === 0)
        toast.success(`Nada a gerar — ${puladas} já existiam`);
      else
        toast.success(
          `${criadas} obrigaç${criadas === 1 ? "ão criada" : "ões criadas"}` +
            (puladas > 0 ? ` (${puladas} já existiam)` : "")
        );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar obrigações do mês"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || totalEstimado === 0}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            {gerar.isPending ? "Gerando..." : "Gerar"}
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

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={incluirTrim}
              onChange={(e) => setIncluirTrim(e.target.checked)}
              className="rounded border-gray-300 text-verde-primary"
            />
            Incluir obrigações trimestrais
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={incluirAnual}
              onChange={(e) => setIncluirAnual(e.target.checked)}
              className="rounded border-gray-300 text-verde-primary"
            />
            Incluir obrigações anuais
          </label>
        </div>

        <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark space-y-1">
          <div>
            <strong>{clientesAtivos.length}</strong> cliente
            {clientesAtivos.length !== 1 && "s"} ativo
            {clientesAtivos.length !== 1 && "s"} × <strong>{itensSelecionados.length}</strong>{" "}
            obrigaç{itensSelecionados.length === 1 ? "ão" : "ões"} do catálogo
          </div>
          <div className="font-serif text-lg font-bold">
            Até {totalEstimado} novas obrigações
          </div>
          <div className="text-xs text-verde-dark/70">
            Itens já existentes nessa competência são pulados (idempotente).
          </div>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { CalendarClock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId, formatDate } from "@/lib/utils";
import {
  ajustarParaDiaUtil,
  ehDiaUtil,
  motivoNaoUtil,
} from "@/lib/dias-uteis";
import type {
  Cliente,
  ObrigacaoCatalogo,
  Obrigacao,
  StatusObrigacao,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  obrigacao: Obrigacao | null;
  clientes: Cliente[];
  catalogo: ObrigacaoCatalogo[];
};

const STATUS: StatusObrigacao[] = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "ENTREGUE",
  "ATRASADA",
  "DISPENSADA",
];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function venctoDoMes(competencia: string, dia: number | null): string {
  if (!competencia || !dia) return "";
  const [y, m] = competencia.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDia);
  const bruto = `${competencia}-${String(diaFinal).padStart(2, "0")}`;
  // Auto-antecipa se cair em fim de semana/feriado (regra padrão pra tributos
  // federais como DAS, DARF etc)
  return ajustarParaDiaUtil(bruto, "anterior");
}

export function ObrigacaoFormModal({
  open,
  onClose,
  obrigacao,
  clientes,
  catalogo,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!obrigacao;

  const [idCliente, setIdCliente] = useState("");
  const [idCatalogo, setIdCatalogo] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [vencimento, setVencimento] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [status, setStatus] = useState<StatusObrigacao>("PENDENTE");
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(obrigacao?.id_cliente ?? "");
    setIdCatalogo(obrigacao?.id_obrigacao_catalogo ?? "");
    setCompetencia(obrigacao?.competencia ?? competenciaAtual());
    setVencimento(obrigacao?.data_vencimento ?? "");
    setDataEntrega(obrigacao?.data_entrega ?? "");
    setStatus((obrigacao?.status as StatusObrigacao) ?? "PENDENTE");
    setResponsavel(obrigacao?.responsavel ?? "");
    setObservacoes(obrigacao?.observacoes ?? "");
  }, [open, obrigacao]);

  // Auto-calcula vencimento ao trocar catálogo + competência (apenas na criação)
  useEffect(() => {
    if (isEdit || !idCatalogo || !competencia) return;
    const cat = catalogo.find((c) => c.id_obrigacao_catalogo === idCatalogo);
    if (cat?.dia_vencimento_padrao) {
      setVencimento(venctoDoMes(competencia, cat.dia_vencimento_padrao));
    }
  }, [idCatalogo, competencia, isEdit, catalogo]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione o cliente");
      if (!idCatalogo) throw new Error("Selecione a obrigação do catálogo");
      if (!competencia) throw new Error("Informe a competência");
      if (!vencimento) throw new Error("Informe a data de vencimento");

      const supabase = createSupabaseBrowserClient();
      const payload = {
        id_cliente: idCliente,
        id_obrigacao_catalogo: idCatalogo,
        competencia,
        data_vencimento: vencimento,
        data_entrega: dataEntrega || null,
        status,
        responsavel: responsavel.trim() || null,
        observacoes: observacoes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase
          .from("obrigacoes")
          .update(payload as never)
          .eq("id_obrigacao", obrigacao!.id_obrigacao);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("obrigacoes")
          .insert({ id_obrigacao: gerarId("OBR"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      toast.success(isEdit ? "Obrigação atualizada" : "Obrigação lançada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar obrigação" : "Lançar obrigação"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Cliente" required>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
            disabled={isEdit}
          >
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Obrigação" required>
          <select
            className={inputClass}
            value={idCatalogo}
            onChange={(e) => setIdCatalogo(e.target.value)}
            disabled={isEdit}
          >
            <option value="">Selecione…</option>
            {catalogo.map((c) => (
              <option key={c.id_obrigacao_catalogo} value={c.id_obrigacao_catalogo}>
                {c.sigla} — {c.nome}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Competência" required hint="Mês de referência">
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </Field>
          <Field label="Data de vencimento" required>
            <input
              type="date"
              className={inputClass}
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
            {vencimento && !ehDiaUtil(vencimento) && (
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-900">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} />
                  {motivoNaoUtil(vencimento)} — sem expediente bancário
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setVencimento(ajustarParaDiaUtil(vencimento, "anterior"))
                  }
                  className="underline hover:text-amber-950 whitespace-nowrap"
                >
                  Antecipar p/ {formatDate(ajustarParaDiaUtil(vencimento, "anterior"))}
                </button>
              </div>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Data de entrega">
            <input
              type="date"
              className={inputClass}
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusObrigacao)}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Responsável">
          <input
            className={inputClass}
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Nome de quem ficou com a tarefa"
          />
        </Field>

        <Field label="Observações">
          <textarea
            className={`${inputClass} min-h-[70px]`}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

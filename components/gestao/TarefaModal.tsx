"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { PRIORIDADES } from "@/lib/gestao/types";
import {
  useSalvarTarefa,
  useExcluirTarefa,
} from "@/lib/gestao/hooks";
import type {
  GestaoStatus,
  GestaoTarefa,
  PrioridadeTarefa,
} from "@/lib/gestao/types";

type Props = {
  open: boolean;
  onClose: () => void;
  idQuadro: string;
  status: GestaoStatus[];
  tarefa?: GestaoTarefa | null;
  statusInicial?: string;
};

export function TarefaModal({
  open,
  onClose,
  idQuadro,
  status,
  tarefa,
  statusInicial,
}: Props) {
  const salvar = useSalvarTarefa();
  const excluir = useExcluirTarefa();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [statusSel, setStatusSel] = useState<string>("A_FAZER");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>("Media");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [etiquetasStr, setEtiquetasStr] = useState("");

  const isEdit = !!tarefa;

  useEffect(() => {
    if (!open) return;
    setTitulo(tarefa?.titulo ?? "");
    setDescricao(tarefa?.descricao ?? "");
    setStatusSel(tarefa?.status ?? statusInicial ?? status[0]?.slug ?? "A_FAZER");
    setPrioridade(tarefa?.prioridade ?? "Media");
    setResponsavel(tarefa?.responsavel ?? "");
    setPrazo(tarefa?.prazo ?? "");
    setEtiquetasStr((tarefa?.etiquetas ?? []).join(", "));
  }, [open, tarefa, statusInicial, status]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    salvar.mutate(
      {
        id_tarefa: tarefa?.id_tarefa,
        id_quadro: idQuadro,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        status: statusSel,
        prioridade,
        responsavel: responsavel.trim() || null,
        prazo: prazo || null,
        etiquetas: etiquetasStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      { onSuccess: () => onClose() }
    );
  }

  function onDelete() {
    if (!tarefa) return;
    if (!confirm(`Excluir "${tarefa.titulo}"?`)) return;
    excluir.mutate(
      { id_tarefa: tarefa.id_tarefa, id_quadro: idQuadro },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar tarefa" : "Nova tarefa"}
      size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          {isEdit ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={excluir.isPending}
              className="text-xs text-red-alert hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={12} /> Excluir
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={salvar.isPending}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} disabled={salvar.isPending || !titulo.trim()}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Título" required>
          <input
            className={inputClass}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Descrição">
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select
              className={inputClass}
              value={statusSel}
              onChange={(e) => setStatusSel(e.target.value)}
            >
              {status.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select
              className={inputClass}
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Responsável (email)">
            <input
              type="email"
              className={inputClass}
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="colaborador@jsp.com.br"
            />
          </Field>
          <Field label="Prazo">
            <input
              type="date"
              className={inputClass}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Etiquetas" hint="Separadas por vírgula (ex: urgente, fiscal, cliente-A)">
          <input
            className={inputClass}
            value={etiquetasStr}
            onChange={(e) => setEtiquetasStr(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

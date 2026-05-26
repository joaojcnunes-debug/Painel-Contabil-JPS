"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { Cliente, Fatura, StatusFatura } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  fatura: Fatura | null;
  clientes: Cliente[];
};

const STATUS: StatusFatura[] = ["ABERTA", "PAGA", "ATRASADA", "CANCELADA"];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function venctoDoMes(comp: string, dia: number): string {
  const [y, m] = comp.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

export function FaturaFormModal({ open, onClose, fatura, clientes }: Props) {
  const qc = useQueryClient();
  const isEdit = !!fatura;

  const [idCliente, setIdCliente] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
  const [status, setStatus] = useState<StatusFatura>("ABERTA");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(fatura?.id_cliente ?? "");
    setCompetencia(fatura?.competencia ?? competenciaAtual());
    setValor(fatura?.valor != null ? String(fatura.valor) : "");
    setVencimento(fatura?.data_vencimento ?? "");
    setDataPagamento(fatura?.data_pagamento ?? "");
    setStatus((fatura?.status as StatusFatura) ?? "ABERTA");
    setDescricao(fatura?.descricao ?? "");
  }, [open, fatura]);

  // Pre-fill valor + vencimento a partir do cliente quando troca (apenas criação)
  useEffect(() => {
    if (isEdit || !idCliente) return;
    const c = clientes.find((cl) => cl.id_cliente === idCliente);
    if (c) {
      if (c.honorario_mensal != null) setValor(String(c.honorario_mensal));
      if (c.dia_vencimento && competencia) {
        setVencimento(venctoDoMes(competencia, c.dia_vencimento));
      }
    }
  }, [idCliente, clientes, isEdit, competencia]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione o cliente");
      if (!competencia) throw new Error("Informe a competência");
      const num = Number((valor ?? "").replace(",", "."));
      if (!isFinite(num) || num <= 0) throw new Error("Informe um valor válido");
      if (!vencimento) throw new Error("Informe a data de vencimento");

      const supabase = createSupabaseBrowserClient();
      const payload = {
        id_cliente: idCliente,
        competencia,
        valor: num,
        data_vencimento: vencimento,
        data_pagamento: dataPagamento || null,
        status,
        descricao: descricao.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error } = await supabase
          .from("faturas")
          .update(payload as never)
          .eq("id_fatura", fatura!.id_fatura);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("faturas")
          .insert({ id_fatura: gerarId("FAT"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faturas"] });
      toast.success(isEdit ? "Fatura atualizada" : "Fatura criada");
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
      title={isEdit ? "Editar fatura" : "Nova fatura"}
      size="md"
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Competência" required>
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </Field>
          <Field label="Valor (R$)" required>
            <input
              className={inputClass}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="1500.00"
            />
          </Field>
          <Field label="Vencimento" required>
            <input
              type="date"
              className={inputClass}
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Data de pagamento">
            <input
              type="date"
              className={inputClass}
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFatura)}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Descrição">
          <input
            className={inputClass}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Honorários contábeis — Abril/2026"
          />
        </Field>
      </form>
    </Modal>
  );
}

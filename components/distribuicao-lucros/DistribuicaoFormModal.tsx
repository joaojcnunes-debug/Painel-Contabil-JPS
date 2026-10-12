"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseValorBR } from "@/lib/distribuicao-lucros";
import { gerarId } from "@/lib/utils";
import type { Cliente, DistribuicaoLucro, Socio } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  distribuicao: DistribuicaoLucro | null;
  clientes: Cliente[];
  socios: Socio[];
  idClienteDefault?: string;
};

const FORMAS = ["PIX", "TED", "Transferência", "Cheque", "Dinheiro"];

export function DistribuicaoFormModal({
  open,
  onClose,
  distribuicao,
  clientes,
  socios,
  idClienteDefault,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!distribuicao;

  const [idCliente, setIdCliente] = useState("");
  const [idSocio, setIdSocio] = useState("");
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(distribuicao?.id_cliente ?? idClienteDefault ?? "");
    setIdSocio(distribuicao?.id_socio ?? "");
    setData(distribuicao?.data_distribuicao ?? new Date().toISOString().slice(0, 10));
    setValor(distribuicao ? String(distribuicao.valor).replace(".", ",") : "");
    setForma(distribuicao?.forma_pagamento ?? "");
    setObs(distribuicao?.observacoes ?? "");
  }, [open, distribuicao, idClienteDefault]);

  const sociosDaEmpresa = useMemo(
    () => socios.filter((s) => s.id_cliente === idCliente),
    [socios, idCliente]
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione a empresa");
      const socio = sociosDaEmpresa.find((s) => s.id_socio === idSocio);
      if (!socio) throw new Error("Selecione o sócio");
      if (!data) throw new Error("Informe a data da distribuição");
      const v = parseValorBR(valor);
      if (!(v > 0)) throw new Error("Valor deve ser maior que zero");

      const payload = {
        id_cliente: idCliente,
        id_socio: socio.id_socio,
        nome_socio: socio.nome,
        cpf_socio: socio.cpf,
        data_distribuicao: data,
        valor: Math.round(v * 100) / 100,
        forma_pagamento: forma || null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("distribuicoes_lucros")
          .update(payload as never)
          .eq("id_distribuicao", distribuicao!.id_distribuicao);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("distribuicoes_lucros")
          .insert({ id_distribuicao: gerarId("DLU"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["distribuicoes-lucros"] });
      toast.success(isEdit ? "Distribuição atualizada" : "Distribuição lançada");
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
      title={isEdit ? "Editar distribuição" : "Nova distribuição de lucros"}
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
        <Field label="Empresa (cliente)" required>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => {
              setIdCliente(e.target.value);
              setIdSocio("");
            }}
          >
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Sócio"
          required
          hint={
            idCliente && sociosDaEmpresa.length === 0
              ? "Nenhum sócio cadastrado nesta empresa — cadastre em RH / DP › Pró-labore."
              : undefined
          }
        >
          <select
            className={inputClass}
            value={idSocio}
            onChange={(e) => setIdSocio(e.target.value)}
            disabled={!idCliente}
          >
            <option value="">Selecione…</option>
            {sociosDaEmpresa.map((s) => (
              <option key={s.id_socio} value={s.id_socio}>
                {s.nome}
                {s.status === "INATIVO" ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Data da retirada" required>
            <input
              type="date"
              className={inputClass}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Field>
          <Field label="Valor (R$)" required>
            <input
              className={inputClass}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="15.000,00"
              inputMode="decimal"
            />
          </Field>
          <Field label="Forma de pagamento">
            <select
              className={inputClass}
              value={forma}
              onChange={(e) => setForma(e.target.value)}
            >
              <option value="">—</option>
              {FORMAS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea
            className={inputClass}
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type {
  Cliente,
  LancamentoModelo,
  PlanoConta,
  TipoLancamento,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  modelo: LancamentoModelo | null;
  clientes: Cliente[];
  contas: PlanoConta[];
};

export function LancamentoModeloFormModal({
  open,
  onClose,
  modelo,
  clientes,
  contas,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!modelo;

  const [tipo, setTipo] = useState<TipoLancamento>("DESPESA");
  const [idCliente, setIdCliente] = useState("");
  const [idConta, setIdConta] = useState("");
  const [valor, setValor] = useState("");
  const [diaMes, setDiaMes] = useState("5");
  const [descricao, setDescricao] = useState("");
  const [docRef, setDocRef] = useState("");
  const [obs, setObs] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTipo((modelo?.tipo as TipoLancamento) ?? "DESPESA");
    setIdCliente(modelo?.id_cliente ?? "");
    setIdConta(modelo?.id_conta ?? "");
    setValor(
      modelo?.valor != null ? String(modelo.valor).replace(".", ",") : ""
    );
    setDiaMes(modelo?.dia_mes ? String(modelo.dia_mes) : "5");
    setDescricao(modelo?.descricao ?? "");
    setDocRef(modelo?.documento_ref ?? "");
    setObs(modelo?.observacoes ?? "");
    setAtivo(modelo?.ativo ?? true);
  }, [open, modelo]);

  const contasFiltradas = contas.filter((c) => c.ativo && c.tipo === tipo);

  useEffect(() => {
    if (idConta) {
      const c = contas.find((x) => x.id_conta === idConta);
      if (c && c.tipo !== tipo) setIdConta("");
    }
  }, [tipo, idConta, contas]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione o cliente");
      if (!idConta) throw new Error("Selecione a conta");
      const v = Number(valor.replace(".", "").replace(",", "."));
      if (!isFinite(v) || v <= 0) throw new Error("Valor inválido");
      const dia = Number(diaMes);
      if (!isFinite(dia) || dia < 1 || dia > 31)
        throw new Error("Dia do mês deve ser entre 1 e 31");
      if (!descricao.trim()) throw new Error("Informe a descrição");

      const supabase = createSupabaseBrowserClient();
      const payload = {
        id_cliente: idCliente,
        id_conta: idConta,
        tipo,
        valor: v,
        dia_mes: dia,
        descricao: descricao.trim(),
        documento_ref: docRef.trim() || null,
        observacoes: obs.trim() || null,
        ativo,
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error } = await supabase
          .from("lancamentos_modelos")
          .update(payload as never)
          .eq("id_modelo", modelo!.id_modelo);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lancamentos_modelos")
          .insert({ id_modelo: gerarId("LCM"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancamentos-modelos"] });
      toast.success(isEdit ? "Modelo atualizado" : "Modelo criado");
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
      title={isEdit ? "Editar modelo recorrente" : "Novo modelo recorrente"}
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
        <Field label="Tipo" required>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipo("RECEITA")}
              className={
                tipo === "RECEITA"
                  ? "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-verde-primary text-white"
                  : "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700"
              }
            >
              Receita
            </button>
            <button
              type="button"
              onClick={() => setTipo("DESPESA")}
              className={
                tipo === "DESPESA"
                  ? "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-alert text-white"
                  : "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700"
              }
            >
              Despesa
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cliente" required>
            <select
              className={inputClass}
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id_cliente} value={c.id_cliente}>
                  {c.razao_social}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Conta" required>
            <select
              className={inputClass}
              value={idConta}
              onChange={(e) => setIdConta(e.target.value)}
            >
              <option value="">Selecione…</option>
              {contasFiltradas.map((c) => (
                <option key={c.id_conta} value={c.id_conta}>
                  {c.codigo} — {c.nome}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Valor (R$)" required>
            <input
              className={inputClass}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="2.000,00"
              inputMode="decimal"
            />
          </Field>
          <Field
            label="Dia do mês"
            required
            hint="Se o mês não tiver esse dia, usa o último"
          >
            <input
              className={inputClass}
              value={diaMes}
              onChange={(e) =>
                setDiaMes(e.target.value.replace(/\D/g, "").slice(0, 2))
              }
              inputMode="numeric"
              placeholder="5"
            />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="rounded border-gray-300 text-verde-primary"
              />
              Ativo
            </label>
          </div>
        </div>

        <Field label="Descrição padrão" required>
          <input
            className={inputClass}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Aluguel sala comercial"
          />
        </Field>

        <Field label="Documento de referência padrão">
          <input
            className={inputClass}
            value={docRef}
            onChange={(e) => setDocRef(e.target.value)}
            placeholder="Opcional"
          />
        </Field>

        <Field label="Observações">
          <textarea
            className={`${inputClass} min-h-[60px]`}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

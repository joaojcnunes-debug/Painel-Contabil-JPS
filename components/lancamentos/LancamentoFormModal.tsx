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
  Lancamento,
  PlanoConta,
  TipoLancamento,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  lancamento: Lancamento | null;
  clientes: Cliente[];
  contas: PlanoConta[];
};

function competenciaDe(data: string): string {
  return data.slice(0, 7);
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

export function LancamentoFormModal({
  open,
  onClose,
  lancamento,
  clientes,
  contas,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!lancamento;

  const [tipo, setTipo] = useState<TipoLancamento>("DESPESA");
  const [idCliente, setIdCliente] = useState("");
  const [idConta, setIdConta] = useState("");
  const [dataLanc, setDataLanc] = useState(hojeIso());
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [docRef, setDocRef] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setTipo((lancamento?.tipo as TipoLancamento) ?? "DESPESA");
    setIdCliente(lancamento?.id_cliente ?? "");
    setIdConta(lancamento?.id_conta ?? "");
    setDataLanc(lancamento?.data_lancamento ?? hojeIso());
    setValor(
      lancamento?.valor != null ? String(lancamento.valor).replace(".", ",") : ""
    );
    setDescricao(lancamento?.descricao ?? "");
    setDocRef(lancamento?.documento_ref ?? "");
    setObs(lancamento?.observacoes ?? "");
  }, [open, lancamento]);

  // Filtra contas pelo tipo selecionado
  const contasFiltradas = contas.filter(
    (c) => c.ativo && c.tipo === tipo
  );

  // Se trocou tipo e a conta atual não bate, limpa
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
      if (!dataLanc) throw new Error("Informe a data");
      const v = Number(valor.replace(".", "").replace(",", "."));
      if (!isFinite(v) || v <= 0) throw new Error("Valor inválido");
      if (!descricao.trim()) throw new Error("Informe a descrição");

      const supabase = createSupabaseBrowserClient();
      const payload = {
        id_cliente: idCliente,
        id_conta: idConta,
        data_lancamento: dataLanc,
        competencia: competenciaDe(dataLanc),
        tipo,
        valor: v,
        descricao: descricao.trim(),
        documento_ref: docRef.trim() || null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error } = await supabase
          .from("lancamentos")
          .update(payload as never)
          .eq("id_lancamento", lancamento!.id_lancamento);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lancamentos")
          .insert({ id_lancamento: gerarId("LCT"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success(isEdit ? "Lançamento atualizado" : "Lançamento criado");
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
      title={isEdit ? "Editar lançamento" : "Novo lançamento"}
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
        {/* Tipo: toggle visual */}
        <Field label="Tipo" required>
          <div className="flex gap-2">
            <ToggleTipo
              value="RECEITA"
              current={tipo}
              onChange={setTipo}
              label="Receita"
              cor="verde"
            />
            <ToggleTipo
              value="DESPESA"
              current={tipo}
              onChange={setTipo}
              label="Despesa"
              cor="red"
            />
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

          <Field label="Conta (plano)" required>
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
          <Field label="Data" required>
            <input
              type="date"
              className={inputClass}
              value={dataLanc}
              onChange={(e) => setDataLanc(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Valor (R$)" required>
              <input
                className={inputClass}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.234,56"
                inputMode="decimal"
              />
            </Field>
          </div>
        </div>

        <Field label="Descrição" required>
          <input
            className={inputClass}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Pagamento conta de luz CEMIG"
          />
        </Field>

        <Field label="Documento de referência (NF, recibo, etc)">
          <input
            className={inputClass}
            value={docRef}
            onChange={(e) => setDocRef(e.target.value)}
            placeholder="Opcional"
          />
        </Field>

        <Field label="Observações">
          <textarea
            className={`${inputClass} min-h-[70px]`}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function ToggleTipo({
  value,
  current,
  onChange,
  label,
  cor,
}: {
  value: TipoLancamento;
  current: TipoLancamento;
  onChange: (v: TipoLancamento) => void;
  label: string;
  cor: "verde" | "red";
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        active
          ? cor === "verde"
            ? "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-verde-primary text-white"
            : "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-alert text-white"
          : "flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:border-verde-primary"
      }
    >
      {label}
    </button>
  );
}

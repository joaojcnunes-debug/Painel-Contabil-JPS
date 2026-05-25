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
  RegimeTributario,
  StatusCliente,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  cliente: Cliente | null;
};

const REGIMES: { value: RegimeTributario; label: string }[] = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "MEI", label: "MEI" },
  { value: "DOMESTICO", label: "Doméstico" },
  { value: "PRODUTOR_RURAL", label: "Produtor Rural" },
];

const STATUS: StatusCliente[] = ["Ativo", "Inativo", "Suspenso"];

export function ClienteFormModal({ open, onClose, cliente }: Props) {
  const qc = useQueryClient();
  const isEdit = !!cliente;

  const [razao, setRazao] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [regime, setRegime] = useState<RegimeTributario>("SIMPLES_NACIONAL");
  const [atividade, setAtividade] = useState("");
  const [inicioContrato, setInicioContrato] = useState("");
  const [status, setStatus] = useState<StatusCliente>("Ativo");
  const [honorario, setHonorario] = useState("");
  const [diaVenc, setDiaVenc] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setRazao(cliente?.razao_social ?? "");
    setFantasia(cliente?.nome_fantasia ?? "");
    setCnpj(cliente?.cnpj ?? "");
    setCpf(cliente?.cpf ?? "");
    setRegime((cliente?.regime as RegimeTributario) ?? "SIMPLES_NACIONAL");
    setAtividade(cliente?.atividade_principal ?? "");
    setInicioContrato(cliente?.inicio_contrato ?? "");
    setStatus((cliente?.status as StatusCliente) ?? "Ativo");
    setHonorario(
      cliente?.honorario_mensal != null ? String(cliente.honorario_mensal) : ""
    );
    setDiaVenc(cliente?.dia_vencimento ? String(cliente.dia_vencimento) : "");
    setObs(cliente?.observacoes ?? "");
  }, [open, cliente]);

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();

      if (!razao.trim()) throw new Error("Razão social é obrigatória");

      const onlyDigits = (s: string) => s.replace(/\D/g, "");
      const dia = diaVenc ? Number(diaVenc) : null;
      if (dia != null && (isNaN(dia) || dia < 1 || dia > 31)) {
        throw new Error("Dia de vencimento deve ser entre 1 e 31");
      }
      const valor = honorario ? Number(honorario.replace(",", ".")) : null;
      if (valor != null && isNaN(valor)) {
        throw new Error("Honorário inválido");
      }

      const payload = {
        razao_social: razao.trim(),
        nome_fantasia: fantasia.trim() || null,
        cnpj: cnpj ? onlyDigits(cnpj) : null,
        cpf: cpf ? onlyDigits(cpf) : null,
        regime,
        atividade_principal: atividade.trim() || null,
        inicio_contrato: inicioContrato || null,
        status,
        honorario_mensal: valor,
        dia_vencimento: dia,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase
          .from("clientes")
          .update(payload as never)
          .eq("id_cliente", cliente!.id_cliente);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clientes")
          .insert({ id_cliente: gerarId("CLI"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      toast.success(isEdit ? "Cliente atualizado" : "Cliente criado");
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
      title={isEdit ? "Editar cliente" : "Novo cliente"}
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
        <Field label="Razão social" required>
          <input
            className={inputClass}
            value={razao}
            onChange={(e) => setRazao(e.target.value)}
            required
          />
        </Field>
        <Field label="Nome fantasia">
          <input
            className={inputClass}
            value={fantasia}
            onChange={(e) => setFantasia(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CNPJ">
            <input
              className={inputClass}
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </Field>
          <Field label="CPF (se PF)">
            <input
              className={inputClass}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Regime tributário" required>
            <select
              className={inputClass}
              value={regime}
              onChange={(e) => setRegime(e.target.value as RegimeTributario)}
            >
              {REGIMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusCliente)}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Atividade principal">
          <input
            className={inputClass}
            value={atividade}
            onChange={(e) => setAtividade(e.target.value)}
            placeholder="Ex.: comércio varejista de calçados"
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Início do contrato">
            <input
              type="date"
              className={inputClass}
              value={inicioContrato}
              onChange={(e) => setInicioContrato(e.target.value)}
            />
          </Field>
          <Field label="Honorário mensal (R$)">
            <input
              className={inputClass}
              value={honorario}
              onChange={(e) => setHonorario(e.target.value)}
              placeholder="1500.00"
            />
          </Field>
          <Field label="Dia venc. honorário">
            <input
              className={inputClass}
              value={diaVenc}
              onChange={(e) => setDiaVenc(e.target.value)}
              placeholder="10"
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Observações">
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

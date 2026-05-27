"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { Cliente, Socio, StatusSocio } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  socio: Socio | null;
  clientes: Cliente[];
  idClienteDefault?: string;
};

const STATUS: StatusSocio[] = ["ATIVO", "INATIVO"];

export function SocioFormModal({
  open,
  onClose,
  socio,
  clientes,
  idClienteDefault,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!socio;

  const [idCliente, setIdCliente] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [participacao, setParticipacao] = useState("");
  const [proLabore, setProLabore] = useState("");
  const [dependentes, setDependentes] = useState("0");
  const [status, setStatus] = useState<StatusSocio>("ATIVO");
  const [pix, setPix] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(socio?.id_cliente ?? idClienteDefault ?? "");
    setNome(socio?.nome ?? "");
    setCpf(socio?.cpf ?? "");
    setRg(socio?.rg ?? "");
    setNascimento(socio?.data_nascimento ?? "");
    setEntrada(socio?.data_entrada ?? "");
    setSaida(socio?.data_saida ?? "");
    setParticipacao(
      socio?.participacao_pct != null ? String(socio.participacao_pct) : ""
    );
    setProLabore(
      socio?.pro_labore_mensal != null ? String(socio.pro_labore_mensal) : ""
    );
    setDependentes(String(socio?.dependentes ?? 0));
    setStatus(socio?.status ?? "ATIVO");
    setPix(socio?.pix ?? "");
    setBanco(socio?.banco ?? "");
    setAgencia(socio?.agencia ?? "");
    setConta(socio?.conta ?? "");
    setEmail(socio?.email ?? "");
    setTelefone(socio?.telefone ?? "");
    setObs(socio?.observacoes ?? "");
  }, [open, socio, idClienteDefault]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione a empresa");
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      if (!entrada) throw new Error("Data de entrada é obrigatória");
      const pl = Number(proLabore.replace(",", ".")) || 0;
      if (pl < 0) throw new Error("Pró-labore inválido");
      const pct = participacao
        ? Number(participacao.replace(",", "."))
        : null;
      if (pct != null && (isNaN(pct) || pct < 0 || pct > 100)) {
        throw new Error("Participação deve ser entre 0 e 100");
      }
      const dep = Number(dependentes) || 0;
      const onlyDigits = (s: string) => s.replace(/\D/g, "");

      const payload = {
        id_cliente: idCliente,
        nome: nome.trim(),
        cpf: cpf ? onlyDigits(cpf) : null,
        rg: rg.trim() || null,
        data_nascimento: nascimento || null,
        data_entrada: entrada,
        data_saida: saida || null,
        participacao_pct: pct,
        pro_labore_mensal: pl,
        dependentes: dep,
        status,
        pix: pix.trim() || null,
        banco: banco.trim() || null,
        agencia: agencia.trim() || null,
        conta: conta.trim() || null,
        email: email.trim().toLowerCase() || null,
        telefone: telefone.trim() || null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("socios")
          .update(payload as never)
          .eq("id_socio", socio!.id_socio);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("socios")
          .insert({ id_socio: gerarId("SOC"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["socios"] });
      toast.success(isEdit ? "Sócio atualizado" : "Sócio cadastrado");
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
      title={isEdit ? "Editar sócio" : "Novo sócio"}
      size="xl"
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
      <form onSubmit={onSubmit} className="space-y-5">
        <Bloco titulo="Identificação">
          <Field label="Empresa (cliente)" required>
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
          <Field label="Nome completo" required>
            <input
              className={inputClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="CPF">
              <input
                className={inputClass}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </Field>
            <Field label="RG">
              <input
                className={inputClass}
                value={rg}
                onChange={(e) => setRg(e.target.value)}
              />
            </Field>
            <Field label="Nascimento">
              <input
                type="date"
                className={inputClass}
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="E-mail">
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Telefone">
              <input
                className={inputClass}
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </Field>
          </div>
        </Bloco>

        <Bloco titulo="Sociedade e remuneração">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Entrada na sociedade" required>
              <input
                type="date"
                className={inputClass}
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                required
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusSocio)}
              >
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            {status === "INATIVO" && (
              <Field label="Saída">
                <input
                  type="date"
                  className={inputClass}
                  value={saida}
                  onChange={(e) => setSaida(e.target.value)}
                />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Participação (%)" hint="No capital social">
              <input
                className={inputClass}
                value={participacao}
                onChange={(e) => setParticipacao(e.target.value)}
                placeholder="50.00"
                inputMode="decimal"
              />
            </Field>
            <Field label="Pró-labore mensal (R$)" required>
              <input
                className={inputClass}
                value={proLabore}
                onChange={(e) => setProLabore(e.target.value)}
                placeholder="3000.00"
                inputMode="decimal"
              />
            </Field>
            <Field label="Dependentes IRRF">
              <input
                className={inputClass}
                value={dependentes}
                onChange={(e) => setDependentes(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
        </Bloco>

        <Bloco titulo="Pagamento (informativo)">
          <Field label="Chave PIX">
            <input
              className={inputClass}
              value={pix}
              onChange={(e) => setPix(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Banco">
              <input
                className={inputClass}
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
              />
            </Field>
            <Field label="Agência">
              <input
                className={inputClass}
                value={agencia}
                onChange={(e) => setAgencia(e.target.value)}
              />
            </Field>
            <Field label="Conta">
              <input
                className={inputClass}
                value={conta}
                onChange={(e) => setConta(e.target.value)}
              />
            </Field>
          </div>
        </Bloco>

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

function Bloco({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-card-border rounded-lg p-4 bg-app-bg/40 space-y-4">
      <h3 className="font-serif text-sm font-semibold text-verde-dark border-b border-card-border pb-2">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

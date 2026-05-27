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
  Funcionario,
  StatusFuncionario,
  TipoFuncionario,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  funcionario: Funcionario | null;
  clientes: Cliente[];
  idClienteDefault?: string;
};

const TIPOS: { value: TipoFuncionario; label: string }[] = [
  { value: "CLT", label: "CLT" },
  { value: "ESTAGIARIO", label: "Estagiário" },
  { value: "JOVEM_APRENDIZ", label: "Jovem Aprendiz" },
  { value: "AUTONOMO", label: "Autônomo" },
];

const STATUS: StatusFuncionario[] = ["ATIVO", "AFASTADO", "DEMITIDO"];

export function FuncionarioFormModal({
  open,
  onClose,
  funcionario,
  clientes,
  idClienteDefault,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!funcionario;

  const [idCliente, setIdCliente] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [admissao, setAdmissao] = useState("");
  const [demissao, setDemissao] = useState("");
  const [cargo, setCargo] = useState("");
  const [tipo, setTipo] = useState<TipoFuncionario>("CLT");
  const [salario, setSalario] = useState("");
  const [dependentes, setDependentes] = useState("0");
  const [temVt, setTemVt] = useState(false);
  const [valorVt, setValorVt] = useState("");
  const [valorVa, setValorVa] = useState("");
  const [planoSaude, setPlanoSaude] = useState("");
  const [status, setStatus] = useState<StatusFuncionario>("ATIVO");
  const [pix, setPix] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(funcionario?.id_cliente ?? idClienteDefault ?? "");
    setNome(funcionario?.nome ?? "");
    setCpf(funcionario?.cpf ?? "");
    setRg(funcionario?.rg ?? "");
    setNascimento(funcionario?.data_nascimento ?? "");
    setAdmissao(funcionario?.data_admissao ?? "");
    setDemissao(funcionario?.data_demissao ?? "");
    setCargo(funcionario?.cargo ?? "");
    setTipo(funcionario?.tipo ?? "CLT");
    setSalario(
      funcionario?.salario_base != null ? String(funcionario.salario_base) : ""
    );
    setDependentes(String(funcionario?.dependentes ?? 0));
    setTemVt(funcionario?.vale_transporte ?? false);
    setValorVt(funcionario?.valor_vt != null ? String(funcionario.valor_vt) : "");
    setValorVa(funcionario?.valor_va != null ? String(funcionario.valor_va) : "");
    setPlanoSaude(
      funcionario?.plano_saude_desc != null
        ? String(funcionario.plano_saude_desc)
        : ""
    );
    setStatus(funcionario?.status ?? "ATIVO");
    setPix(funcionario?.pix ?? "");
    setBanco(funcionario?.banco ?? "");
    setAgencia(funcionario?.agencia ?? "");
    setConta(funcionario?.conta ?? "");
    setObs(funcionario?.observacoes ?? "");
  }, [open, funcionario, idClienteDefault]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione o cliente");
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      if (!admissao) throw new Error("Data de admissão é obrigatória");
      const sal = Number(salario.replace(",", "."));
      if (!isFinite(sal) || sal < 0) throw new Error("Salário inválido");
      const dep = Number(dependentes) || 0;
      const vt = valorVt ? Number(valorVt.replace(",", ".")) : null;
      const va = valorVa ? Number(valorVa.replace(",", ".")) : null;
      const ps = planoSaude ? Number(planoSaude.replace(",", ".")) : null;
      const onlyDigits = (s: string) => s.replace(/\D/g, "");

      const payload = {
        id_cliente: idCliente,
        nome: nome.trim(),
        cpf: cpf ? onlyDigits(cpf) : null,
        rg: rg.trim() || null,
        data_nascimento: nascimento || null,
        data_admissao: admissao,
        data_demissao: demissao || null,
        cargo: cargo.trim() || null,
        tipo,
        salario_base: sal,
        dependentes: dep,
        vale_transporte: temVt,
        valor_vt: temVt ? vt : null,
        valor_va: va,
        plano_saude_desc: ps,
        status,
        pix: pix.trim() || null,
        banco: banco.trim() || null,
        agencia: agencia.trim() || null,
        conta: conta.trim() || null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("funcionarios")
          .update(payload as never)
          .eq("id_funcionario", funcionario!.id_funcionario);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("funcionarios")
          .insert({ id_funcionario: gerarId("FUN"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      toast.success(isEdit ? "Funcionário atualizado" : "Funcionário cadastrado");
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
      title={isEdit ? "Editar funcionário" : "Novo funcionário"}
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
        </Bloco>

        <Bloco titulo="Contrato">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Tipo" required>
              <select
                className={inputClass}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoFuncionario)}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Admissão" required>
              <input
                type="date"
                className={inputClass}
                value={admissao}
                onChange={(e) => setAdmissao(e.target.value)}
                required
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFuncionario)}
              >
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {status === "DEMITIDO" && (
            <Field label="Data demissão">
              <input
                type="date"
                className={inputClass}
                value={demissao}
                onChange={(e) => setDemissao(e.target.value)}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cargo">
              <input
                className={inputClass}
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
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
          <Field label="Salário base (R$)" required>
            <input
              className={inputClass}
              value={salario}
              onChange={(e) => setSalario(e.target.value)}
              placeholder="1500.00"
              inputMode="decimal"
            />
          </Field>
        </Bloco>

        <Bloco titulo="Benefícios">
          <label className="flex items-center gap-2 text-sm pt-1">
            <input
              type="checkbox"
              checked={temVt}
              onChange={(e) => setTemVt(e.target.checked)}
            />
            <span>Recebe Vale-Transporte (desconto até 6%)</span>
          </label>
          {temVt && (
            <Field label="Custo mensal do VT (R$)" hint="Desconta o menor entre custo e 6% do salário">
              <input
                className={inputClass}
                value={valorVt}
                onChange={(e) => setValorVt(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Vale-alimentação (R$)" hint="Informativo — não desconta automaticamente">
              <input
                className={inputClass}
                value={valorVa}
                onChange={(e) => setValorVa(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Plano de saúde — desconto (R$)">
              <input
                className={inputClass}
                value={planoSaude}
                onChange={(e) => setPlanoSaude(e.target.value)}
                inputMode="decimal"
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

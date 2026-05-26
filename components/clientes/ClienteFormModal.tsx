"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type {
  Cliente,
  RegimeTributario,
  StatusCliente,
  TipoCadastro,
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

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG",
  "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR",
  "RS", "SC", "SE", "SP", "TO",
];

export function ClienteFormModal({ open, onClose, cliente }: Props) {
  const qc = useQueryClient();
  const isEdit = !!cliente;

  // Identificação
  const [tipo, setTipo] = useState<TipoCadastro>("PJ");
  const [razao, setRazao] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");

  // Tributação / contrato
  const [regime, setRegime] = useState<RegimeTributario>("SIMPLES_NACIONAL");
  const [atividade, setAtividade] = useState("");
  const [inicioContrato, setInicioContrato] = useState("");
  const [status, setStatus] = useState<StatusCliente>("Ativo");
  const [honorario, setHonorario] = useState("");
  const [diaVenc, setDiaVenc] = useState("");

  // Endereço
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estado, setEstado] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  // Responsável
  const [respNome, setRespNome] = useState("");
  const [respCpf, setRespCpf] = useState("");
  const [respEmail, setRespEmail] = useState("");
  const [respTel, setRespTel] = useState("");

  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setTipo((cliente?.tipo_cadastro as TipoCadastro) ?? "PJ");
    setRazao(cliente?.razao_social ?? "");
    setFantasia(cliente?.nome_fantasia ?? "");
    setCnpj(cliente?.cnpj ?? "");
    setCpf(cliente?.cpf ?? "");
    setEmail(cliente?.email ?? "");
    setRegime((cliente?.regime as RegimeTributario) ?? "SIMPLES_NACIONAL");
    setAtividade(cliente?.atividade_principal ?? "");
    setInicioContrato(cliente?.inicio_contrato ?? "");
    setStatus((cliente?.status as StatusCliente) ?? "Ativo");
    setHonorario(
      cliente?.honorario_mensal != null ? String(cliente.honorario_mensal) : ""
    );
    setDiaVenc(cliente?.dia_vencimento ? String(cliente.dia_vencimento) : "");
    setCep(cliente?.cep ?? "");
    setLogradouro(cliente?.logradouro ?? "");
    setNumero(cliente?.numero ?? "");
    setComplemento(cliente?.complemento ?? "");
    setBairro(cliente?.bairro ?? "");
    setMunicipio(cliente?.municipio ?? "");
    setEstado(cliente?.estado ?? "");
    setRespNome(cliente?.responsavel_nome ?? "");
    setRespCpf(cliente?.responsavel_cpf ?? "");
    setRespEmail(cliente?.responsavel_email ?? "");
    setRespTel(cliente?.responsavel_telefone ?? "");
    setObs(cliente?.observacoes ?? "");
  }, [open, cliente]);

  async function buscarCep() {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) {
      toast.error("CEP deve ter 8 dígitos");
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (data?.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setLogradouro(data.logradouro ?? "");
      setBairro(data.bairro ?? "");
      setMunicipio(data.localidade ?? "");
      setEstado(data.uf ?? "");
      toast.success("Endereço preenchido");
    } catch {
      toast.error("Falha ao consultar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  const [cnpjLoading, setCnpjLoading] = useState(false);

  async function buscarCnpj() {
    const raw = cnpj.replace(/\D/g, "");
    if (raw.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    setCnpjLoading(true);
    try {
      const res = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${raw}`
      );
      if (!res.ok) {
        if (res.status === 404) toast.error("CNPJ não encontrado");
        else toast.error(`Falha na consulta (HTTP ${res.status})`);
        return;
      }
      const d = await res.json();

      // Identificação
      if (!razao && d.razao_social) setRazao(d.razao_social);
      if (!fantasia && d.nome_fantasia) setFantasia(d.nome_fantasia);
      if (!email && d.email) setEmail(String(d.email).toLowerCase());
      if (!atividade && d.cnae_fiscal_descricao)
        setAtividade(d.cnae_fiscal_descricao);

      // Endereço
      if (!cep && d.cep) setCep(String(d.cep));
      if (!logradouro && d.logradouro) setLogradouro(d.logradouro);
      if (!numero && d.numero) setNumero(String(d.numero));
      if (!complemento && d.complemento) setComplemento(d.complemento);
      if (!bairro && d.bairro) setBairro(d.bairro);
      if (!municipio && d.municipio) setMunicipio(d.municipio);
      if (!estado && d.uf) setEstado(d.uf);

      // Responsável: primeiro sócio do QSA (nome apenas; CPF não vem)
      const qsa = Array.isArray(d.qsa) ? d.qsa : [];
      const primeiroSocio = qsa[0];
      if (primeiroSocio?.nome_socio && !respNome) {
        setRespNome(primeiroSocio.nome_socio);
      }

      // Telefone agregado pra contato (DDD + número se vier)
      if (!respTel && d.ddd_telefone_1) {
        setRespTel(String(d.ddd_telefone_1));
      }

      toast.success("Dados preenchidos pela Receita");
    } catch {
      toast.error("Falha ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }

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
        tipo_cadastro: tipo,
        razao_social: razao.trim(),
        nome_fantasia: fantasia.trim() || null,
        cnpj: tipo === "PJ" && cnpj ? onlyDigits(cnpj) : null,
        cpf: tipo === "PF" && cpf ? onlyDigits(cpf) : null,
        email: email.trim().toLowerCase() || null,
        regime,
        atividade_principal: atividade.trim() || null,
        inicio_contrato: inicioContrato || null,
        status,
        honorario_mensal: valor,
        dia_vencimento: dia,
        cep: cep.replace(/\D/g, "") || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        municipio: municipio.trim() || null,
        estado: (estado || "").toUpperCase() || null,
        responsavel_nome: respNome.trim() || null,
        responsavel_cpf: respCpf ? onlyDigits(respCpf) : null,
        responsavel_email: respEmail.trim().toLowerCase() || null,
        responsavel_telefone: respTel.trim() || null,
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
        {/* ─── Identificação ─── */}
        <Bloco titulo="Identificação">
          <Field label="Tipo de cadastro" required>
            <div className="flex gap-3">
              <ToggleTipo
                value="PJ"
                current={tipo}
                onChange={setTipo}
                label="Pessoa Jurídica"
              />
              <ToggleTipo
                value="PF"
                current={tipo}
                onChange={setTipo}
                label="Pessoa Física"
              />
            </div>
          </Field>

          <Field label={tipo === "PJ" ? "Razão social" : "Nome completo"} required>
            <input
              className={inputClass}
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
              required
            />
          </Field>

          {tipo === "PJ" && (
            <Field label="Nome fantasia">
              <input
                className={inputClass}
                value={fantasia}
                onChange={(e) => setFantasia(e.target.value)}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            {tipo === "PJ" ? (
              <Field label="CNPJ" hint="Sai do campo pra buscar dados na Receita">
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    onBlur={() => {
                      if (cnpj.replace(/\D/g, "").length === 14 && !isEdit) {
                        buscarCnpj();
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={buscarCnpj}
                    disabled={cnpjLoading}
                    className="flex items-center gap-1 px-3"
                  >
                    <Search size={14} />
                    {cnpjLoading ? "..." : "Buscar"}
                  </Button>
                </div>
              </Field>
            ) : (
              <Field label="CPF">
                <input
                  className={inputClass}
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </Field>
            )}
            <Field label="E-mail principal">
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
        </Bloco>

        {/* ─── Tributação / Contrato ─── */}
        <Bloco titulo="Tributação e contrato">
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
        </Bloco>

        {/* ─── Endereço ─── */}
        <Bloco titulo="Endereço">
          <div className="grid grid-cols-4 gap-4 items-end">
            <Field label="CEP">
              <input
                className={inputClass}
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={() => {
                  if (cep.replace(/\D/g, "").length === 8) buscarCep();
                }}
                placeholder="00000-000"
                inputMode="numeric"
              />
            </Field>
            <div className="col-span-3 flex items-end">
              <Button
                type="button"
                variant="secondary"
                onClick={buscarCep}
                disabled={cepLoading}
                className="flex items-center gap-2"
              >
                <Search size={14} />
                {cepLoading ? "Buscando..." : "Buscar CEP"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <Field label="Logradouro">
                <input
                  className={inputClass}
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Número">
              <input
                className={inputClass}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Complemento">
              <input
                className={inputClass}
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Sala, andar, etc."
              />
            </Field>
            <Field label="Bairro">
              <input
                className={inputClass}
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Município">
                <input
                  className={inputClass}
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                />
              </Field>
            </div>
            <Field label="UF">
              <select
                className={inputClass}
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Bloco>

        {/* ─── Responsável ─── */}
        <Bloco titulo="Responsável legal">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome completo">
              <input
                className={inputClass}
                value={respNome}
                onChange={(e) => setRespNome(e.target.value)}
              />
            </Field>
            <Field label="CPF">
              <input
                className={inputClass}
                value={respCpf}
                onChange={(e) => setRespCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="E-mail">
              <input
                type="email"
                className={inputClass}
                value={respEmail}
                onChange={(e) => setRespEmail(e.target.value)}
              />
            </Field>
            <Field label="Telefone">
              <input
                className={inputClass}
                value={respTel}
                onChange={(e) => setRespTel(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </Field>
          </div>
        </Bloco>

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

function ToggleTipo({
  value,
  current,
  onChange,
  label,
}: {
  value: TipoCadastro;
  current: TipoCadastro;
  onChange: (v: TipoCadastro) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        active
          ? "px-4 py-2 rounded-lg text-sm font-medium bg-verde-primary text-white border border-verde-primary"
          : "px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:border-verde-primary"
      }
    >
      {label}
    </button>
  );
}

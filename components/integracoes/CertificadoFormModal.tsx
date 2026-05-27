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
  CertificadoDigital,
  Cliente,
  TipoCertificado,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  certificado: CertificadoDigital | null;
  clientes: Cliente[];
};

const TIPOS: { value: TipoCertificado; label: string }[] = [
  { value: "A1", label: "A1 (arquivo .pfx)" },
  { value: "A3", label: "A3 (token/cartão)" },
  { value: "PROCURACAO_ECAC", label: "Procuração e-CAC" },
  { value: "CONECTIVIDADE_SOCIAL", label: "Conectividade Social ICP" },
  { value: "OUTRO", label: "Outro" },
];

const SERVICOS_PROCURACAO = [
  "DCTFWeb",
  "PER/DCOMP",
  "Situação Fiscal",
  "Caixa Postal e-CAC",
  "PGDAS-D",
  "EFD-Reinf",
  "Parcelamentos",
  "Outros",
];

export function CertificadoFormModal({
  open,
  onClose,
  certificado,
  clientes,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!certificado;

  const [idCliente, setIdCliente] = useState("");
  const [tipo, setTipo] = useState<TipoCertificado>("A1");
  const [titularNome, setTitularNome] = useState("");
  const [titularDoc, setTitularDoc] = useState("");
  const [emissor, setEmissor] = useState("");
  const [validadeInicio, setValidadeInicio] = useState("");
  const [validadeFim, setValidadeFim] = useState("");
  const [outorgante, setOutorgante] = useState("");
  const [outorgado, setOutorgado] = useState("");
  const [servicos, setServicos] = useState<string[]>([]);
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdCliente(certificado?.id_cliente ?? "");
    setTipo(certificado?.tipo ?? "A1");
    setTitularNome(certificado?.titular_nome ?? "");
    setTitularDoc(certificado?.titular_documento ?? "");
    setEmissor(certificado?.emissor ?? "");
    setValidadeInicio(certificado?.validade_inicio ?? "");
    setValidadeFim(certificado?.validade_fim ?? "");
    setOutorgante(certificado?.procuracao_outorgante ?? "");
    setOutorgado(certificado?.procuracao_outorgado ?? "");
    setServicos(certificado?.procuracao_servicos ?? []);
    setObs(certificado?.observacoes ?? "");
  }, [open, certificado]);

  function toggleServico(s: string) {
    setServicos((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!titularNome.trim())
        throw new Error("Nome do titular é obrigatório");
      if (!titularDoc.trim())
        throw new Error("Documento do titular é obrigatório");

      const ehProcuracao = tipo === "PROCURACAO_ECAC";
      const payload = {
        id_cliente: idCliente || null,
        tipo,
        titular_nome: titularNome.trim(),
        titular_documento: titularDoc.replace(/\D/g, ""),
        emissor: emissor.trim() || null,
        validade_inicio: validadeInicio || null,
        validade_fim: validadeFim || null,
        procuracao_outorgante: ehProcuracao ? outorgante.trim() || null : null,
        procuracao_outorgado: ehProcuracao ? outorgado.trim() || null : null,
        procuracao_servicos:
          ehProcuracao && servicos.length > 0 ? servicos : null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("certificados_digitais")
          .update(payload as never)
          .eq("id_certificado", certificado!.id_certificado);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("certificados_digitais")
          .insert({ id_certificado: gerarId("CRT"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificados-digitais"] });
      toast.success(isEdit ? "Certificado atualizado" : "Certificado cadastrado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  const ehProcuracao = tipo === "PROCURACAO_ECAC";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar certificado" : "Novo certificado / procuração"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900">
          Cadastro de <strong>metadata apenas</strong>. O arquivo .pfx e a
          senha NÃO ficam no banco. Quando partir para modo real, o arquivo
          irá pra bucket privado e a senha pra Edge Function Secret.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Empresa (cliente)" hint="Vazio = certificado do escritório">
            <select
              className={inputClass}
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
            >
              <option value="">— Escritório —</option>
              {clientes.map((c) => (
                <option key={c.id_cliente} value={c.id_cliente}>
                  {c.razao_social}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo" required>
            <select
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCertificado)}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Titular (nome ou razão social)" required>
            <input
              className={inputClass}
              value={titularNome}
              onChange={(e) => setTitularNome(e.target.value)}
              required
            />
          </Field>
          <Field label="CNPJ ou CPF do titular" required>
            <input
              className={inputClass}
              value={titularDoc}
              onChange={(e) => setTitularDoc(e.target.value)}
              placeholder="00.000.000/0000-00"
              required
            />
          </Field>
        </div>

        <Field label="Emissor (AC)">
          <input
            className={inputClass}
            value={emissor}
            onChange={(e) => setEmissor(e.target.value)}
            placeholder="Ex.: AC SAFEWEB v5, Serasa, Certisign…"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Validade — início">
            <input
              type="date"
              className={inputClass}
              value={validadeInicio}
              onChange={(e) => setValidadeInicio(e.target.value)}
            />
          </Field>
          <Field label="Validade — fim" hint="Usado pra alerta de vencimento">
            <input
              type="date"
              className={inputClass}
              value={validadeFim}
              onChange={(e) => setValidadeFim(e.target.value)}
            />
          </Field>
        </div>

        {ehProcuracao && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Outorgante">
                <input
                  className={inputClass}
                  value={outorgante}
                  onChange={(e) => setOutorgante(e.target.value)}
                  placeholder="Quem outorgou (cliente)"
                />
              </Field>
              <Field label="Outorgado">
                <input
                  className={inputClass}
                  value={outorgado}
                  onChange={(e) => setOutorgado(e.target.value)}
                  placeholder="Quem recebeu (escritório)"
                />
              </Field>
            </div>
            <Field label="Serviços incluídos na procuração">
              <div className="flex flex-wrap gap-1.5">
                {SERVICOS_PROCURACAO.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleServico(s)}
                    className={
                      servicos.includes(s)
                        ? "px-2 py-1 rounded-md text-xs bg-verde-primary text-white border border-verde-primary"
                        : "px-2 py-1 rounded-md text-xs bg-white text-gray-700 border border-gray-300 hover:border-verde-primary"
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

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

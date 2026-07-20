"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, FileLock2, Loader2, Upload } from "lucide-react";
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

  // ─── Upload do .pfx ──────────────────────────────────────
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [senhaPfx, setSenhaPfx] = useState("");
  const [validando, setValidando] = useState(false);
  const [arquivoPath, setArquivoPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setPfxFile(null);
    setSenhaPfx("");
    setArquivoPath(certificado?.arquivo_path ?? null);
  }, [open, certificado]);

  // Valida o .pfx + senha contra a API. Preenche os campos automaticamente.
  async function validarPfx() {
    if (!pfxFile) {
      toast.error("Selecione o arquivo .pfx primeiro");
      return;
    }
    if (!senhaPfx) {
      toast.error("Digite a senha do certificado");
      return;
    }
    setValidando(true);
    try {
      const fd = new FormData();
      fd.append("pfx", pfxFile);
      fd.append("senha", senhaPfx);
      const res = await fetch("/api/certificado/validar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.erro ?? "Falha ao validar certificado");
        return;
      }
      // Auto-preenche os campos com os dados extraídos
      setTitularNome(data.titular_nome);
      setTitularDoc(data.titular_documento);
      setEmissor(data.emissor);
      setValidadeInicio(data.validade_inicio);
      setValidadeFim(data.validade_fim);
      toast.success(
        `Certificado válido. Vence em ${data.dias_para_vencer} dias.`
      );
      // B) alerta se CNPJ do cert não bate com o do cliente selecionado
      if (idCliente) {
        const cli = clientes.find((c) => c.id_cliente === idCliente);
        const cnpjCli = (cli?.cnpj ?? "").replace(/\D/g, "");
        const cnpjCert = (data.titular_documento ?? "").replace(/\D/g, "");
        if (cnpjCli && cnpjCert && cnpjCli !== cnpjCert) {
          toast(
            `⚠ CNPJ do certificado (${cnpjCert}) não bate com o do cliente (${cnpjCli}).\nConfira se está vinculando ao cliente correto.`,
            { duration: 10000, icon: "⚠️" }
          );
        }
      }
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setValidando(false);
    }
  }

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
      const ehA1 = tipo === "A1";
      const idCert = isEdit ? certificado!.id_certificado : gerarId("CRT");
      const docLimpo = titularDoc.replace(/\D/g, "");

      // B) Validação forte: CNPJ do cert precisa bater com o do cliente
      // vinculado (só bloqueia CNPJ vs CNPJ; CPF/e-CPF passa).
      if (ehA1 && idCliente && docLimpo.length === 14) {
        const cli = clientes.find((c) => c.id_cliente === idCliente);
        const cnpjCli = (cli?.cnpj ?? "").replace(/\D/g, "");
        if (cnpjCli && cnpjCli !== docLimpo) {
          const ok = window.confirm(
            `Atenção: o CNPJ do certificado (${docLimpo}) NÃO bate com o do cliente ${cli?.razao_social} (${cnpjCli}).\n\n` +
              `Isso normalmente indica vínculo incorreto. Deseja salvar mesmo assim?`
          );
          if (!ok) throw new Error("Cadastro cancelado — CNPJ divergente");
        }
      }

      // 1) Faz upload do .pfx se houver arquivo selecionado (só A1)
      let novoArquivoPath = arquivoPath;
      if (ehA1 && pfxFile) {
        const fd = new FormData();
        fd.append("pfx", pfxFile);
        fd.append("id_certificado", idCert);
        const res = await fetch("/api/certificado/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.erro ?? "Falha no upload do .pfx");
        }
        novoArquivoPath = data.path as string;
      }

      const payload = {
        id_cliente: idCliente || null,
        tipo,
        titular_nome: titularNome.trim(),
        titular_documento: docLimpo,
        emissor: emissor.trim() || null,
        validade_inicio: validadeInicio || null,
        validade_fim: validadeFim || null,
        procuracao_outorgante: ehProcuracao ? outorgante.trim() || null : null,
        procuracao_outorgado: ehProcuracao ? outorgado.trim() || null : null,
        procuracao_servicos:
          ehProcuracao && servicos.length > 0 ? servicos : null,
        arquivo_path: ehA1 ? novoArquivoPath : null,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("certificados_digitais")
          .update(payload as never)
          .eq("id_certificado", idCert);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("certificados_digitais")
          .insert({ id_certificado: idCert, ...payload } as never);
        if (error) throw error;
      }

      // A) Se A1 + senha digitada, encripta e salva. Rota nunca retorna a
      // senha; falha aqui não invalida o cadastro (arquivo já subiu),
      // então mostra warning em vez de throw.
      if (ehA1 && senhaPfx) {
        try {
          const r = await fetch("/api/certificado/salvar-senha", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_certificado: idCert, senha: senhaPfx }),
          });
          const j = await r.json();
          if (!r.ok || !j.ok) {
            toast.error(`Cert salvo, MAS senha não foi encriptada: ${j.erro ?? "erro"}. Reeditar cadastro pra retentar.`);
          }
        } catch (e) {
          toast.error(`Cert salvo, MAS senha não foi encriptada: ${(e as Error).message}. Reeditar cadastro pra retentar.`);
        }
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
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900">
          Para certificados <strong>A1</strong>, faça upload do arquivo .pfx
          e digite a senha. Os campos (titular, CNPJ, emissor, validade)
          preenchem automaticamente ao validar. Arquivo vai pra bucket
          privado; senha é <strong>encriptada AES-256-GCM</strong> e
          guardada pra automações (cron NFSe scrape, etc.).
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

        {tipo === "A1" && (
          <div className="border border-card-border rounded-lg p-3 bg-app-bg/40 space-y-3">
            <div className="flex items-center gap-2">
              <FileLock2 size={16} className="text-gold" />
              <div className="text-xs font-semibold text-verde-dark">
                Arquivo .pfx (A1)
              </div>
              {arquivoPath && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  ✓ Arquivo no bucket
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Arquivo .pfx">
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pfx,.p12,application/x-pkcs12"
                    className="hidden"
                    onChange={(e) => setPfxFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-3 py-1.5 border border-dashed border-gray-300 rounded text-xs text-gray-700 hover:border-verde-primary truncate text-left"
                  >
                    {pfxFile ? (
                      <span className="flex items-center gap-1.5">
                        <Upload size={11} />
                        {pfxFile.name} ({(pfxFile.size / 1024).toFixed(1)} KB)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Upload size={11} />
                        Selecionar .pfx…
                      </span>
                    )}
                  </button>
                </div>
              </Field>
              <Field label="Senha do certificado" hint="Encriptada AES-256-GCM">
                <input
                  type="password"
                  className={inputClass}
                  value={senhaPfx}
                  onChange={(e) => setSenhaPfx(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="off"
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={validarPfx}
              disabled={validando || !pfxFile || !senhaPfx}
              className="w-full px-3 py-2 bg-verde-primary text-white text-sm font-medium rounded hover:bg-verde-accent disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {validando ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Validando…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Validar e preencher campos
                </>
              )}
            </button>
          </div>
        )}

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

"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Search,
  XCircle,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  idCliente: string;
  nomeCliente?: string;
};

type MetadataNfse = {
  numero?: string;
  serie?: string;
  dhEmissao?: string;
  prestadorCnpj?: string;
  prestadorNome?: string;
  tomadorCnpj?: string;
  tomadorNome?: string;
  valorServicos?: number;
  valorIss?: number;
  aliquotaIss?: number;
  valorLiquido?: number;
  codigoServico?: string;
  discriminacao?: string;
  status?: string;
};

type RespostaOk = {
  ok: true;
  encontrada: true;
  chave: string;
  duracao_ms: number;
  salvou_xml: boolean;
  metadata: MetadataNfse;
  xml_preview: string;
  xml_size: number;
};

type RespostaNaoEncontrada = {
  ok: false;
  encontrada: false;
  status?: number;
  erro?: string;
  duracao_ms?: number;
  diagnostico?: string;
};

export function NfseConsultarChaveModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(1);
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [chave, setChave] = useState("");
  const [salvar, setSalvar] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaOk | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState<RespostaNaoEncontrada | null>(
    null
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      toast.error("Digite a senha do certificado");
      return;
    }
    if (!chave.trim()) {
      toast.error("Informe a chave de acesso");
      return;
    }
    setCarregando(true);
    setResposta(null);
    setNaoEncontrada(null);
    try {
      const res = await fetch("/api/integracoes/nfse-consultar-chave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          chave: chave.trim(),
          salvar,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResposta(data);
        toast.success("NFSe encontrada no ADN");
        setSenha("");
      } else {
        setNaoEncontrada(data);
        if (!data.diagnostico) toast.error(data.erro ?? "Falha na consulta");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setSenha("");
    setChave("");
    setResposta(null);
    setNaoEncontrada(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="NFSe — Consultar por chave (diagnóstico)"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={fechar} disabled={carregando}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900 flex items-start gap-2">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Ferramenta de diagnóstico. Se a distribuição por NSU retornou vazio,
            informe aqui a chave de acesso (~50 dígitos) de uma NFSe que você{" "}
            <strong>sabe que existe</strong> pra confirmar se está no
            repositório nacional (ADN). Se não estiver, a emissão foi via
            portal municipal próprio ou ainda está em delay.
          </div>
        </div>

        {!resposta && !naoEncontrada && (
          <form onSubmit={onSubmit} className="space-y-3">
            {nomeCliente && (
              <div className="text-xs text-gray-600">
                Empresa: <strong className="text-gray-800">{nomeCliente}</strong>
              </div>
            )}

            <Field
              label="Chave de acesso da NFSe"
              required
              hint="Sequência de dígitos gerada pelo Emissor Nacional (~50 chars). Pega no portal do cliente."
            >
              <input
                type="text"
                className={inputClass + " font-mono text-xs"}
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder="Ex: 33206.0001.1E9B.C7D2..."
                disabled={carregando}
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Ambiente" required>
                <select
                  className={inputClass}
                  value={ambiente}
                  onChange={(e) => setAmbiente(Number(e.target.value) as 1 | 2)}
                  disabled={carregando}
                >
                  <option value={1}>Produção</option>
                  <option value={2}>Produção Restrita</option>
                </select>
              </Field>

              <Field label="Senha do certificado A1" required>
                <div className="relative">
                  <Lock
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type={senhaVisivel ? "text" : "password"}
                    className={inputClass + " pl-9 pr-10"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="off"
                    disabled={carregando}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setSenhaVisivel((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800"
                    disabled={carregando}
                  >
                    {senhaVisivel ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={salvar}
                onChange={(e) => setSalvar(e.target.checked)}
                disabled={carregando}
              />
              Salvar XML no bucket e registrar em <code>nfse_recebidas</code>{" "}
              (se encontrada)
            </label>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={carregando}
                className="flex items-center gap-2"
              >
                {carregando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Search size={14} />
                )}
                {carregando ? "Consultando…" : "Consultar"}
              </Button>
            </div>
          </form>
        )}

        {naoEncontrada && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <XCircle size={14} /> NFSe não encontrada no ADN
              </div>
              {naoEncontrada.diagnostico ? (
                <div className="text-gray-700">{naoEncontrada.diagnostico}</div>
              ) : (
                <div className="text-gray-700">
                  HTTP {naoEncontrada.status ?? "?"}: {naoEncontrada.erro}
                </div>
              )}
              <div className="text-[10px] text-gray-500 pt-2 border-t border-amber-300/40">
                Se você confirma a emissão desta chave: 1) aguarde 24h e teste
                de novo (delay ADN); 2) confirme se foi realmente via Emissor
                Nacional (nfse.gov.br) e não portal municipal (Nota Carioca,
                NFSe SP, etc); 3) confira se o CNPJ raiz do cert bate com o da
                NFSe.
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setNaoEncontrada(null)}
                type="button"
              >
                Testar outra chave
              </Button>
            </div>
          </div>
        )}

        {resposta && (
          <div className="space-y-3">
            <div className="bg-verde-light border border-verde-primary/30 rounded p-3 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-verde-dark">
                <CheckCircle2 size={14} /> NFSe encontrada no ADN
              </div>
              <div className="text-[10px] text-gray-600">
                Duração: {(resposta.duracao_ms / 1000).toFixed(2)}s · XML:{" "}
                {resposta.xml_size} bytes ·{" "}
                {resposta.salvou_xml
                  ? "salvo no bucket + registro"
                  : "não salvo"}
              </div>
            </div>

            <div className="border border-card-border rounded p-3 space-y-2 text-xs">
              <div className="font-semibold text-gray-800">Metadata extraída</div>
              <div className="grid grid-cols-2 gap-2 text-gray-700">
                <div>
                  <span className="text-gray-500">Nº:</span>{" "}
                  {resposta.metadata.numero ?? "—"}
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>{" "}
                  {resposta.metadata.status ?? "—"}
                </div>
                <div>
                  <span className="text-gray-500">Emissão:</span>{" "}
                  {resposta.metadata.dhEmissao
                    ? formatDate(resposta.metadata.dhEmissao)
                    : "—"}
                </div>
                <div>
                  <span className="text-gray-500">Valor:</span>{" "}
                  {resposta.metadata.valorServicos != null
                    ? formatBRL(resposta.metadata.valorServicos)
                    : "—"}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Prestador:</span>{" "}
                  {resposta.metadata.prestadorNome ?? "—"}{" "}
                  {resposta.metadata.prestadorCnpj &&
                    `(${formatCNPJ(resposta.metadata.prestadorCnpj)})`}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Tomador:</span>{" "}
                  {resposta.metadata.tomadorNome ?? "—"}{" "}
                  {resposta.metadata.tomadorCnpj &&
                    `(${formatCNPJ(resposta.metadata.tomadorCnpj)})`}
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Serviço:</span>{" "}
                  {resposta.metadata.discriminacao ?? "—"}
                </div>
              </div>
            </div>

            <details className="border border-card-border rounded p-2 text-xs">
              <summary className="cursor-pointer text-gray-600 font-medium">
                Ver preview do XML ({resposta.xml_size} bytes)
              </summary>
              <pre className="mt-2 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                {resposta.xml_preview}
                {resposta.xml_size > 500 && "\n…"}
              </pre>
            </details>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setResposta(null);
                  setChave("");
                }}
                type="button"
              >
                Testar outra chave
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

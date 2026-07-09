"use client";

import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileCode,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
};

type ArquivoLocal = {
  nome: string;
  xml: string;
  tamanho: number;
};

type ResultadoArquivo = {
  nome: string;
  status: "OK" | "DUPLICADA" | "ERRO";
  chave?: string;
  erro?: string;
  metadata?: {
    numero?: string;
    prestador?: string;
    tomador?: string;
    valor?: number;
  };
};

type Resposta = {
  ok: boolean;
  total: number;
  salvos: number;
  duplicadas: number;
  erros: number;
  duracao_ms: number;
  resultados: ResultadoArquivo[];
};

export function NfseImportarManualModal({ open, onClose, onImported }: Props) {
  const { data: clientes = [] } = useClientes();
  const [idCliente, setIdCliente] = useState("");
  const [ambiente, setAmbiente] = useState<1 | 2>(1);
  const [arquivos, setArquivos] = useState<ArquivoLocal[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<Resposta | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(
    () => arquivos.reduce((acc, a) => acc + a.tamanho, 0),
    [arquivos]
  );

  async function handleFiles(list: FileList | null) {
    if (!list) return;
    const novos: ArquivoLocal[] = [];
    for (const file of Array.from(list)) {
      if (!/\.xml$/i.test(file.name)) {
        toast.error(`Ignorado: ${file.name} não é .xml`);
        continue;
      }
      try {
        const xml = await file.text();
        novos.push({ nome: file.name, xml, tamanho: file.size });
      } catch {
        toast.error(`Falha ao ler ${file.name}`);
      }
    }
    setArquivos((prev) => [...prev, ...novos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function enviar() {
    if (!idCliente) {
      toast.error("Selecione a empresa");
      return;
    }
    if (arquivos.length === 0) {
      toast.error("Adicione ao menos 1 XML");
      return;
    }
    setCarregando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/integracoes/nfse-importar-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          arquivos: arquivos.map((a) => ({ nome: a.nome, xml: a.xml })),
        }),
      });
      const data = (await res.json()) as Resposta & { erro?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.erro ?? "Falha na importação");
        return;
      }
      setResultado(data);
      if (data.salvos > 0) {
        toast.success(`${data.salvos} NFSe importada(s)`);
        onImported?.();
      } else if (data.duplicadas > 0 && data.erros === 0) {
        toast(`${data.duplicadas} já existiam`);
      } else {
        toast.error(`${data.erros} erro(s)`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setArquivos([]);
    setResultado(null);
    setIdCliente("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="NFSe — Importar XMLs manualmente"
      size="xl"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="text-[11px] text-gray-500">
            {arquivos.length > 0 &&
              `${arquivos.length} arquivo(s) • ${(totalBytes / 1024).toFixed(1)}KB`}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fechar} disabled={carregando}>
              Fechar
            </Button>
            {!resultado && (
              <Button
                onClick={enviar}
                disabled={carregando || arquivos.length === 0 || !idCliente}
                className="flex items-center gap-2"
              >
                {carregando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {carregando ? "Enviando…" : `Importar ${arquivos.length}`}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900 flex items-start gap-2">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Use pra clientes que emitem em portais municipais próprios
            (<strong>Nota Carioca</strong>, NFSe SP, BH, etc) — que não replicam
            para o Emissor Nacional. Exporte os XMLs no portal do cliente e
            solte aqui. Duplicadas (mesma chave) são ignoradas automaticamente.
          </div>
        </div>

        {!resultado && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1">
                  Empresa
                </label>
                <select
                  className={inputClass}
                  value={idCliente}
                  onChange={(e) => setIdCliente(e.target.value)}
                  disabled={carregando}
                >
                  <option value="">Selecione…</option>
                  {clientes.map((c) => (
                    <option key={c.id_cliente} value={c.id_cliente}>
                      {c.razao_social}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1">
                  Ambiente
                </label>
                <select
                  className={inputClass}
                  value={ambiente}
                  onChange={(e) => setAmbiente(Number(e.target.value) as 1 | 2)}
                  disabled={carregando}
                >
                  <option value={1}>Produção</option>
                  <option value={2}>Homologação</option>
                </select>
              </div>
            </div>

            <div
              className="bg-white border-2 border-dashed border-card-border rounded-xl p-6 text-center hover:border-verde-primary transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-verde-primary");
              }}
              onDragLeave={(e) =>
                e.currentTarget.classList.remove("border-verde-primary")
              }
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-verde-primary");
                handleFiles(e.dataTransfer.files);
              }}
            >
              <Upload size={28} className="mx-auto text-gray-300 mb-2" />
              <div className="text-sm text-gray-700 font-medium">
                Arraste XMLs de NFSe ou clique pra selecionar
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Múltiplos arquivos suportados. Máx 100 por lote, 500KB cada.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,application/xml,text/xml"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {arquivos.length > 0 && (
              <div className="bg-white border border-card-border rounded-xl">
                <div className="px-3 py-2 border-b border-card-border flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-700">
                    Selecionados ({arquivos.length})
                  </div>
                  <button
                    onClick={() => setArquivos([])}
                    className="text-[11px] text-gray-500 hover:text-red-alert"
                  >
                    Limpar
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-card-border">
                  {arquivos.map((a, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode
                          size={12}
                          className="text-verde-primary flex-shrink-0"
                        />
                        <span className="truncate">{a.nome}</span>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">
                          {(a.tamanho / 1024).toFixed(1)}KB
                        </span>
                      </div>
                      <button
                        onClick={() => removerArquivo(idx)}
                        className="p-0.5 text-gray-400 hover:text-red-alert flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {resultado && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <StatMini
                label="Importadas"
                value={resultado.salvos}
                tone="verde"
              />
              <StatMini
                label="Duplicadas"
                value={resultado.duplicadas}
                tone="neutro"
              />
              <StatMini
                label="Erros"
                value={resultado.erros}
                tone={resultado.erros > 0 ? "red" : "neutro"}
              />
              <StatMini
                label="Duração"
                value={`${(resultado.duracao_ms / 1000).toFixed(1)}s`}
                tone="neutro"
                raw
              />
            </div>

            <div className="bg-white border border-card-border rounded-xl max-h-64 overflow-y-auto divide-y divide-card-border">
              {resultado.resultados.map((r, idx) => (
                <ItemResultado key={idx} r={r} />
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setResultado(null);
                  setArquivos([]);
                }}
                type="button"
              >
                Importar mais
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ItemResultado({ r }: { r: ResultadoArquivo }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarChave() {
    if (!r.chave) return;
    await navigator.clipboard.writeText(r.chave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1200);
  }

  if (r.status === "OK") {
    return (
      <div className="px-3 py-2 flex items-start gap-2 text-xs bg-verde-light/40">
        <CheckCircle2
          size={14}
          className="text-verde-primary flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-800 truncate">{r.nome}</div>
          {r.metadata && (
            <div className="text-[11px] text-gray-600 truncate">
              {r.metadata.numero && `Nº ${r.metadata.numero} · `}
              {r.metadata.prestador} → {r.metadata.tomador ?? "—"}
              {r.metadata.valor != null &&
                ` · R$ ${r.metadata.valor.toFixed(2)}`}
            </div>
          )}
          {r.chave && (
            <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
              {r.chave.slice(0, 12)}…{r.chave.slice(-6)}
              <button
                onClick={copiarChave}
                className="ml-1 p-0.5 hover:text-gray-800"
                title="Copiar chave completa"
              >
                {copiado ? "✓" : <Copy size={9} />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (r.status === "DUPLICADA") {
    return (
      <div className="px-3 py-2 flex items-start gap-2 text-xs bg-amber-50">
        <AlertCircle
          size={14}
          className="text-amber-700 flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-800 truncate">{r.nome}</div>
          <div className="text-[11px] text-amber-700">Já importada</div>
        </div>
      </div>
    );
  }
  return (
    <div className="px-3 py-2 flex items-start gap-2 text-xs bg-red-50">
      <AlertCircle size={14} className="text-red-alert flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-red-alert truncate">{r.nome}</div>
        <div className="text-[11px] text-gray-700">{r.erro}</div>
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  tone,
  raw,
}: {
  label: string;
  value: number | string;
  tone: "verde" | "red" | "neutro";
  raw?: boolean;
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "verde"
        ? "text-verde-dark"
        : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded p-2 text-center">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`text-lg ${raw ? "font-semibold" : "font-bold"} ${cls}`}>
        {value}
      </div>
    </div>
  );
}

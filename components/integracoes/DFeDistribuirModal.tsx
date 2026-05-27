"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, FileCode, Loader2, Lock, Play } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { formatBRL, formatDate } from "@/lib/utils";

type DocBaixado = {
  schema: string;
  nsu: string;
  xml: string;
  // campos extraídos do XML (preenchido após parse leve)
  numero?: string;
  serie?: string;
  emitente?: string;
  valor?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  idCliente: string;
  nomeCliente?: string;
};

type RespostaOk = {
  ok: true;
  cStat: string;
  xMotivo: string;
  ambiente: 1 | 2;
  ultimoNsu: string;
  maxNsu: string;
  documentos: DocBaixado[];
};

// Extrai dados básicos do XML de NF-e
function extrairResumoNfe(xml: string): {
  numero?: string;
  serie?: string;
  emitente?: string;
  valor?: number;
} {
  const get = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1] : undefined;
  };
  return {
    numero: get("nNF"),
    serie: get("serie"),
    emitente: get("xNome"),
    valor: get("vNF") ? Number(get("vNF")) : undefined,
  };
}

export function DFeDistribuirModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2); // padrão homologação
  const [senha, setSenha] = useState("");
  const [resetNsu, setResetNsu] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaOk | null>(null);
  const [erro, setErro] = useState<{ erro: string; cStat?: string; raw?: string } | null>(
    null
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      toast.error("Digite a senha do certificado");
      return;
    }
    setCarregando(true);
    setResposta(null);
    setErro(null);
    try {
      const res = await fetch("/api/integracoes/dfe-distribuir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          reset_nsu: resetNsu,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data);
        toast.error(data.erro ?? "Erro na consulta");
      } else {
        // Enriquece com dados extraídos do XML
        const docs: DocBaixado[] = (data.documentos as DocBaixado[]).map(
          (d) => ({ ...d, ...extrairResumoNfe(d.xml) })
        );
        setResposta({ ...data, documentos: docs });
        toast.success(`${docs.length} documento(s) baixado(s)`);
        setSenha(""); // limpa imediatamente após uso
      }
    } catch (err) {
      const msg = (err as Error).message;
      setErro({ erro: msg });
      toast.error(msg);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setSenha("");
    setResetNsu(false);
    setResposta(null);
    setErro(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Distribuição DFe SEFAZ (REAL)"
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
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Vai conectar com o webservice oficial da SEFAZ usando o
            certificado A1 cadastrado. A senha NÃO é armazenada (transita
            uma vez por HTTPS). Comece em <strong>Homologação</strong> pra
            testar; depois troque pra Produção se o resultado fizer sentido.
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {nomeCliente && (
            <div className="text-xs text-gray-600">
              Cliente: <strong className="text-gray-800">{nomeCliente}</strong>
            </div>
          )}

          <Field label="Ambiente" required>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAmbiente(2)}
                disabled={carregando}
                className={
                  ambiente === 2
                    ? "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-900 border-2 border-amber-400"
                    : "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:border-amber-400"
                }
              >
                Homologação (teste)
              </button>
              <button
                type="button"
                onClick={() => setAmbiente(1)}
                disabled={carregando}
                className={
                  ambiente === 1
                    ? "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-alert border-2 border-red-400"
                    : "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:border-red-400"
                }
              >
                Produção (dados reais)
              </button>
            </div>
          </Field>

          <Field label="Senha do certificado A1" required hint="Não fica armazenada">
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="password"
                className={`${inputClass} pl-9`}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
                autoFocus
                disabled={carregando}
              />
            </div>
          </Field>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={resetNsu}
              onChange={(e) => setResetNsu(e.target.checked)}
              disabled={carregando}
            />
            <span>
              Reiniciar do NSU 0 (baixa o histórico — use só na primeira vez)
            </span>
          </label>

          <Button
            type="submit"
            disabled={carregando || !senha}
            className="w-full flex items-center justify-center gap-2"
          >
            {carregando ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Conectando à SEFAZ…
              </>
            ) : (
              <>
                <Play size={14} />
                Consultar SEFAZ ({ambiente === 2 ? "Homol" : "PROD"})
              </>
            )}
          </Button>
        </form>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-red-alert">
              {erro.cStat ? `cStat ${erro.cStat}` : "Erro"}
            </div>
            <div className="text-xs text-gray-700 mt-1">{erro.erro}</div>
            {erro.raw && (
              <details className="mt-2">
                <summary className="text-[10px] text-gray-500 cursor-pointer">
                  Resposta crua (debug)
                </summary>
                <pre className="text-[10px] font-mono bg-white border border-card-border rounded p-2 mt-1 overflow-x-auto max-h-40">
                  {erro.raw}
                </pre>
              </details>
            )}
          </div>
        )}

        {resposta && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-green-900 text-sm">
                  cStat {resposta.cStat} — {resposta.xMotivo}
                </div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-verde-dark text-white">
                  REAL · {resposta.ambiente === 2 ? "Homol" : "PROD"}
                </span>
              </div>
              <div className="text-xs text-gray-700">
                NSU atual: <strong>{resposta.ultimoNsu}</strong> ·{" "}
                NSU máximo SEFAZ: <strong>{resposta.maxNsu}</strong>
              </div>
            </div>

            {resposta.documentos.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-4">
                Nenhum documento novo retornado.
              </div>
            ) : (
              <div className="bg-white border border-card-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2">NSU</th>
                      <th className="px-3 py-2">Emitente</th>
                      <th className="px-3 py-2 w-24">Nº/Série</th>
                      <th className="px-3 py-2 text-right w-28">Valor</th>
                      <th className="px-3 py-2 w-16">Schema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {resposta.documentos.map((d, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono text-[10px] text-gray-500">
                          {d.nsu}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {d.emitente ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {d.numero ? `${d.numero}/${d.serie ?? "1"}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                          {d.valor != null ? formatBRL(d.valor) : "—"}
                        </td>
                        <td className="px-3 py-2 text-[9px] font-mono text-gray-500 truncate max-w-[80px]">
                          {d.schema.replace(".xsd", "").replace("proc", "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

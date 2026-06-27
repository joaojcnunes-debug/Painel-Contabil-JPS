"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Play,
  Radio,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";

type Props = {
  open: boolean;
  onClose: () => void;
  idCliente: string;
  nomeCliente?: string;
};

type RespostaOk = {
  ok: true;
  uf: string;
  ambiente: 1 | 2;
  cStat: string;
  xMotivo: string;
  verAplic: string;
  dhRecbto: string;
  tMed: string;
  endpoint: string;
};

export function SefazStatusModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2);
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaOk | null>(null);
  const [erro, setErro] = useState<{ erro: string; raw?: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) return;
    setCarregando(true);
    setResposta(null);
    setErro(null);
    try {
      const res = await fetch("/api/integracoes/sefaz-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: idCliente, ambiente, senha }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data);
        toast.error(data.erro ?? "Erro");
      } else {
        setResposta(data);
        toast.success(`SEFAZ ${data.uf}: ${data.xMotivo}`);
        setSenha("");
      }
    } catch (err) {
      setErro({ erro: (err as Error).message });
      toast.error((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setSenha("");
    setResposta(null);
    setErro(null);
    onClose();
  }

  // 107 = OK, 108 = paralisado momentaneamente, 109 = paralisado sem previsão
  const cStat = resposta?.cStat ?? "";
  const ehOk = cStat === "107";
  const ehPausaCurta = cStat === "108";

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Status SEFAZ (REAL)"
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={fechar} disabled={carregando}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900">
          Consulta se o webservice SEFAZ da UF do cliente está no ar. Útil
          antes de transmitir NF/eventos. Usa o certificado A1 cadastrado.
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {nomeCliente && (
            <div className="text-xs text-gray-600">
              Cliente: <strong className="text-gray-800">{nomeCliente}</strong>
            </div>
          )}

          <Field label="Ambiente">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAmbiente(2)}
                disabled={carregando}
                className={
                  ambiente === 2
                    ? "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-900 border-2 border-amber-400"
                    : "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300"
                }
              >
                Homologação
              </button>
              <button
                type="button"
                onClick={() => setAmbiente(1)}
                disabled={carregando}
                className={
                  ambiente === 1
                    ? "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-alert border-2 border-red-400"
                    : "flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300"
                }
              >
                Produção
              </button>
            </div>
          </Field>

          <Field label="Senha do certificado A1" required>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type={senhaVisivel ? "text" : "password"}
                className={`${inputClass} pl-9 pr-10`}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={senhaVisivel ? "" : "••••••••"}
                autoComplete="off"
                autoFocus
                disabled={carregando}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setSenhaVisivel((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800"
                title={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                disabled={carregando}
              >
                {senhaVisivel ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          <Button
            type="submit"
            disabled={carregando || !senha}
            className="w-full flex items-center justify-center gap-2"
          >
            {carregando ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Consultando…
              </>
            ) : (
              <>
                <Play size={14} /> Verificar status
              </>
            )}
          </Button>
        </form>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-red-alert">Erro</div>
            <div className="text-xs text-gray-700 mt-1">{erro.erro}</div>
            {erro.raw && (
              <details className="mt-2">
                <summary className="text-[10px] text-gray-500 cursor-pointer">
                  Resposta crua
                </summary>
                <pre className="text-[10px] font-mono bg-white border border-card-border rounded p-2 mt-1 overflow-x-auto max-h-40">
                  {erro.raw}
                </pre>
              </details>
            )}
          </div>
        )}

        {resposta && (
          <div
            className={`p-4 rounded-lg border-2 ${
              ehOk
                ? "bg-green-50 border-green-300"
                : ehPausaCurta
                ? "bg-amber-50 border-amber-300"
                : "bg-red-50 border-red-300"
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              {ehOk ? (
                <CheckCircle2 size={32} className="text-green-700" />
              ) : ehPausaCurta ? (
                <AlertTriangle size={32} className="text-amber-700" />
              ) : (
                <AlertCircle size={32} className="text-red-alert" />
              )}
              <div>
                <div className="font-serif text-lg font-bold text-verde-dark">
                  SEFAZ {resposta.uf} — cStat {resposta.cStat}
                </div>
                <div className="text-sm text-gray-700">{resposta.xMotivo}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-card-border rounded p-2 bg-white">
                <div className="text-[10px] uppercase text-gray-500">
                  Versão aplicação
                </div>
                <div className="font-mono">{resposta.verAplic}</div>
              </div>
              <div className="border border-card-border rounded p-2 bg-white">
                <div className="text-[10px] uppercase text-gray-500">
                  Tempo médio
                </div>
                <div className="font-mono flex items-center gap-1">
                  <Radio size={11} className="text-gold" />
                  {resposta.tMed}s
                </div>
              </div>
              <div className="border border-card-border rounded p-2 bg-white col-span-2">
                <div className="text-[10px] uppercase text-gray-500">
                  Recebido em
                </div>
                <div className="font-mono">{resposta.dhRecbto}</div>
              </div>
              <div className="border border-card-border rounded p-2 bg-white col-span-2">
                <div className="text-[10px] uppercase text-gray-500">
                  Endpoint
                </div>
                <div className="font-mono text-[10px] break-all">
                  {resposta.endpoint}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

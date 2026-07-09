"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  Eye,
  EyeOff,
  Loader2,
  Lock,
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
  status_final: string;
  paginas: number;
  total_baixado: number;
  total_salvos: number;
  total_erros: number;
  ultimo_nsu: string;
  max_nsu?: string;
  duracao_ms: number;
};

type RespostaErro = {
  ok: false;
  erro?: string;
  status_final?: string;
  total_baixado?: number;
  total_salvos?: number;
  ultimo_nsu?: string;
};

export function NfseDistribuirModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2);
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [resetNsu, setResetNsu] = useState(false);
  const [maxPaginas, setMaxPaginas] = useState(10);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaOk | null>(null);
  const [erro, setErro] = useState<RespostaErro | null>(null);

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
      const res = await fetch("/api/integracoes/nfse-distribuir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          reset_nsu: resetNsu,
          max_paginas: maxPaginas,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data);
        toast.error(data.erro ?? "Erro no download");
      } else {
        setResposta(data);
        toast.success(
          `${data.total_salvos} NFSe(s) baixadas em ${data.paginas} página(s)`
        );
        setSenha("");
      }
    } catch (e) {
      const msg = (e as Error).message;
      setErro({ ok: false, erro: msg });
      toast.error(msg);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setSenha("");
    setResposta(null);
    setErro(null);
    setResetNsu(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="NFSe — Baixar via API do Emissor Nacional (REAL)"
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
            Conecta na API oficial do Emissor Nacional NFSe via mTLS com o
            certificado A1. Baixa NFSe onde o CNPJ do cert aparece como
            <strong> prestador, tomador ou intermediário</strong>. Usa cursor
            NSU incremental — chamadas subsequentes só trazem novidades.
            Comece em <strong>Produção Restrita</strong>.
          </div>
        </div>

        {!resposta && (
          <form onSubmit={onSubmit} className="space-y-3">
            {nomeCliente && (
              <div className="text-xs text-gray-600">
                Empresa: <strong className="text-gray-800">{nomeCliente}</strong>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Ambiente" required>
                <select
                  className={inputClass}
                  value={ambiente}
                  onChange={(e) => setAmbiente(Number(e.target.value) as 1 | 2)}
                  disabled={carregando}
                >
                  <option value={2}>Produção Restrita</option>
                  <option value={1}>Produção</option>
                </select>
              </Field>

              <Field
                label="Máx. páginas por chamada"
                hint="Cada página traz até 50 documentos. Vercel timeout 60s → recomendo 10."
              >
                <input
                  type="number"
                  className={inputClass}
                  min={1}
                  max={50}
                  value={maxPaginas}
                  onChange={(e) => setMaxPaginas(Number(e.target.value))}
                  disabled={carregando}
                />
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

              <Field label="Opções">
                <label className="flex items-center gap-2 text-xs text-gray-700 mt-1">
                  <input
                    type="checkbox"
                    checked={resetNsu}
                    onChange={(e) => setResetNsu(e.target.checked)}
                    disabled={carregando}
                  />
                  Reiniciar do NSU 0 (baixa TUDO desde o início — use com cuidado)
                </label>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={carregando}
                className="flex items-center gap-2"
              >
                {carregando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CloudDownload size={14} />
                )}
                {carregando ? "Baixando…" : "Baixar NFSe"}
              </Button>
            </div>
          </form>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-alert space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={14} /> Erro no download
            </div>
            {erro.total_baixado != null && erro.total_baixado > 0 && (
              <div className="text-gray-700">
                Parcial antes do erro: {erro.total_baixado} baixadas,{" "}
                {erro.total_salvos ?? 0} salvas
              </div>
            )}
            <div>{erro.erro ?? erro.status_final ?? "erro desconhecido"}</div>
          </div>
        )}

        {resposta && (
          <div className="bg-verde-light border border-verde-primary/30 rounded p-3 text-xs text-verde-dark space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={14} /> Download concluído
            </div>
            <div className="grid grid-cols-2 gap-2 text-gray-700">
              <div>
                <strong>{resposta.total_salvos}</strong> NFSe(s) salvas
              </div>
              <div>
                <strong>{resposta.paginas}</strong> página(s) processada(s)
              </div>
              <div>
                <strong>{resposta.total_baixado}</strong> total baixado
              </div>
              <div>
                {resposta.total_erros > 0 && (
                  <span className="text-amber-800">
                    {resposta.total_erros} erro(s) de salvamento
                  </span>
                )}
              </div>
              <div className="col-span-2 font-mono text-[10px] text-gray-500">
                NSU atual: {resposta.ultimo_nsu}
                {resposta.max_nsu && ` · Max: ${resposta.max_nsu}`}
              </div>
              <div className="col-span-2 text-[10px] text-gray-500">
                Duração: {(resposta.duracao_ms / 1000).toFixed(1)}s ·{" "}
                {resposta.status_final === "TIMEOUT_INTERROMPIDO"
                  ? "⚠️ Interrompido por timeout — chame de novo pra continuar"
                  : "✓ Finalizado"}
              </div>
            </div>
            <div className="text-[10px] text-gray-600 pt-2 border-t border-verde-primary/20">
              XMLs salvos no bucket <code>nfse-xmls</code>. Metadata em{" "}
              <code>nfse_recebidas</code>. Veja a listagem em{" "}
              <a
                href="/integracoes/nfse/recebidas"
                className="text-verde-dark underline"
              >
                /integracoes/nfse/recebidas
              </a>
              .
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

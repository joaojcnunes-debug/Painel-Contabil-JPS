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
  Send,
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
  ambiente: 1 | 2;
  cdResposta: string;
  descResposta: string;
  total: number;
  eventos: Array<{ id: string; tpEvt: string; nrRecArqBase?: string }>;
};

type RespostaErro = {
  ok: false;
  cdResposta?: string;
  descResposta?: string;
  erro: string;
};

// Operação atual: ConsultaIdentificadoresEventosEmpregador.
// Schema exige perApur (YYYY-MM) e aceita apenas eventos PERIÓDICOS do
// empregador. Servidor real confirmou: S-1298, S-1299 funcionam.
// Eventos não-periódicos (S-2200, S-2300), tabela (S-1010, S-1020) e
// trabalhador (S-1200) precisam de outras operações em versões futuras.
const TIPOS_EVENTO = [
  { id: "S-1299", label: "S-1299 — Fechamento eventos periódicos" },
  { id: "S-1298", label: "S-1298 — Reabertura eventos periódicos" },
];

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function EsocialConsultarModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2);
  const [senha, setSenha] = useState("");
  const [tpEvt, setTpEvt] = useState("S-1299");
  const [perApur, setPerApur] = useState(competenciaAtual());
  const [senhaVisivel, setSenhaVisivel] = useState(false);
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
      const res = await fetch("/api/integracoes/esocial-consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          tpEvt,
          perApur,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data);
        toast.error(data.erro ?? "Erro");
      } else {
        setResposta(data as RespostaOk);
        toast.success(`${data.total} evento(s) encontrado(s)`);
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
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="eSocial — Consultar Identificadores (REAL)"
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
            Conecta no webservice oficial do eSocial via mTLS com o certificado
            A1. Esta operação (<code>ConsultaIdentificadoresEventosEmpregador</code>)
            lista eventos <strong>periódicos do empregador</strong> (S-1298
            reabertura, S-1299 fechamento) por competência. Eventos
            não-periódicos (S-2200), por trabalhador (S-1200, S-2299) ou
            tabela (S-1010, S-1020) precisarão de outras operações em versões
            futuras. Comece em <strong>Produção Restrita</strong>.
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {nomeCliente && (
            <div className="text-xs text-gray-600">
              Empregador: <strong className="text-gray-800">{nomeCliente}</strong>
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
                <option value={2}>Produção Restrita (homologação)</option>
                <option value={1}>Produção</option>
              </select>
            </Field>
            <Field label="Tipo de evento" required>
              <select
                className={inputClass}
                value={tpEvt}
                onChange={(e) => setTpEvt(e.target.value)}
                disabled={carregando}
              >
                {TIPOS_EVENTO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Período de apuração (YYYY-MM)" required>
              <input
                type="month"
                className={inputClass}
                value={perApur}
                onChange={(e) => setPerApur(e.target.value)}
                disabled={carregando}
              />
            </Field>
            <Field label="Senha do certificado A1" required>
              <div className="relative">
                <input
                  type={senhaVisivel ? "text" : "password"}
                  className={inputClass + " pr-10"}
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
                  title={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                  disabled={carregando}
                >
                  {senhaVisivel ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={carregando} className="flex items-center gap-2">
              {carregando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {carregando ? "Consultando…" : "Consultar"}
            </Button>
          </div>
        </form>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-alert space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={14} /> Erro na consulta
            </div>
            {erro.cdResposta && (
              <div>
                <strong>{erro.cdResposta}</strong> {erro.descResposta}
              </div>
            )}
            <div>{erro.erro}</div>
          </div>
        )}

        {resposta && (
          <div className="space-y-3">
            <div className="bg-verde-light border border-verde-primary/30 rounded p-3 text-xs text-verde-dark flex items-start gap-2">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  Webservice no ar · {resposta.cdResposta}{" "}
                  {resposta.descResposta}
                </div>
                <div className="text-gray-700 mt-1">
                  {resposta.total} evento(s) encontrado(s) pra{" "}
                  <strong>{tpEvt}</strong> em <strong>{perApur}</strong> (
                  {resposta.ambiente === 1 ? "Produção" : "Produção Restrita"}).
                </div>
              </div>
            </div>

            {resposta.eventos.length > 0 && (
              <div className="border border-card-border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">ID do evento</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Recibo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {resposta.eventos.slice(0, 50).map((e, i) => (
                      <tr key={`${e.id}-${i}`}>
                        <td className="px-3 py-2 font-mono text-[10px] truncate max-w-xs">
                          {e.id}
                        </td>
                        <td className="px-3 py-2">{e.tpEvt}</td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {e.nrRecArqBase ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {resposta.eventos.length > 50 && (
                  <div className="px-3 py-2 text-[10px] text-gray-500 bg-gray-50 border-t">
                    Mostrando 50 de {resposta.eventos.length} eventos.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

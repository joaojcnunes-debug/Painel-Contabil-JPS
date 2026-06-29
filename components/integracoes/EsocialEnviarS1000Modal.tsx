"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
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
  razaoSocialPadrao?: string;
};

type RespostaEnvio = {
  ok: boolean;
  cdResposta?: string;
  descResposta?: string;
  protocolo?: string;
  id_lote?: string;
  id_evento?: string;
  erro?: string;
};

// Tabelas de domínio frequentes (não exaustivas)
const CLASS_TRIB = [
  { id: "00", label: "00 — Empresa em geral" },
  { id: "01", label: "01 — Empresa Simples Nacional anexo I,II,III,V" },
  { id: "02", label: "02 — Empresa Simples Nacional anexo IV" },
  { id: "03", label: "03 — Empresa receita bruta excedida" },
  { id: "04", label: "04 — MEI" },
  { id: "06", label: "06 — Sociedade cooperativa" },
  { id: "07", label: "07 — Entidades sindicais" },
  { id: "08", label: "08 — Empresas autônomas (massa falida)" },
  { id: "09", label: "09 — Produtor rural PJ" },
  { id: "11", label: "11 — Entidades sem fins lucrativos isentas" },
  { id: "21", label: "21 — Órgão público" },
];

const NAT_JURID = [
  { id: "2062", label: "2062 — Sociedade Empresária Limitada (Ltda)" },
  { id: "2046", label: "2046 — Sociedade Anônima Aberta" },
  { id: "2054", label: "2054 — Sociedade Anônima Fechada" },
  { id: "2135", label: "2135 — Empresário Individual" },
  { id: "2305", label: "2305 — EIRELI" },
  { id: "2240", label: "2240 — Cooperativa" },
  { id: "3220", label: "3220 — Associação Privada" },
  { id: "1244", label: "1244 — Município" },
];

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function EsocialEnviarS1000Modal({
  open,
  onClose,
  idCliente,
  nomeCliente,
  razaoSocialPadrao,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2);
  const [grupo, setGrupo] = useState<1 | 2 | 3>(2);
  const [iniValid, setIniValid] = useState(competenciaAtual());
  const [nmRazao, setNmRazao] = useState(razaoSocialPadrao ?? "");
  const [classTrib, setClassTrib] = useState("00");
  const [natJurid, setNatJurid] = useState("2062");
  const [nmCtt, setNmCtt] = useState("");
  const [cpfCtt, setCpfCtt] = useState("");
  const [foneFixo, setFoneFixo] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaEnvio | null>(null);
  const [erro, setErro] = useState<RespostaEnvio | null>(null);

  // Polling state
  const [polling, setPolling] = useState(false);
  const [resultadoPoll, setResultadoPoll] = useState<{
    cdResposta: string;
    descResposta: string;
    emProcessamento: boolean;
    eventos: Array<{
      id: string;
      cdResposta: string;
      descResposta: string;
      protocoloEvento?: string;
      ocorrencias: Array<{ tipo: string; codigo: string; descricao: string }>;
    }>;
  } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      toast.error("Digite a senha do certificado");
      return;
    }
    if (cpfCtt.replace(/\D/g, "").length !== 11) {
      toast.error("CPF do contato inválido");
      return;
    }
    setCarregando(true);
    setResposta(null);
    setErro(null);
    setResultadoPoll(null);
    try {
      const res = await fetch("/api/integracoes/esocial-enviar-s1000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          grupo,
          iniValid,
          nmRazao,
          classTrib,
          natJurid,
          contato: {
            nmCtt,
            cpfCtt: cpfCtt.replace(/\D/g, ""),
            foneFixo: foneFixo.replace(/\D/g, "") || undefined,
            email: email || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data);
        toast.error(data.erro ?? "Erro");
      } else {
        setResposta(data);
        toast.success(`Lote enviado · protocolo ${data.protocolo}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setErro({ ok: false, erro: msg });
      toast.error(msg);
    } finally {
      setCarregando(false);
    }
  }

  async function consultarPolling() {
    if (!resposta?.id_lote || !senha) {
      toast.error("Sem protocolo ou senha");
      return;
    }
    setPolling(true);
    try {
      const res = await fetch("/api/integracoes/esocial-consultar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          id_lote: resposta.id_lote,
          ambiente,
          senha,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.erro ?? "Erro na consulta");
      } else {
        setResultadoPoll({
          cdResposta: data.cdResposta,
          descResposta: data.descResposta,
          emProcessamento: data.emProcessamento,
          eventos: data.eventos ?? [],
        });
        if (data.emProcessamento) {
          toast("Ainda em processamento — aguarde ~30s e tente de novo", {
            icon: "⏳",
          });
        } else {
          toast.success(`Lote processado · ${data.eventos.length} evento(s)`);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPolling(false);
    }
  }

  function fechar() {
    setSenha("");
    setResposta(null);
    setErro(null);
    setResultadoPoll(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="eSocial — Enviar S-1000 (Cadastro Empregador)"
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
            Envia evento <strong>S-1000 (inclusão)</strong> ao eSocial via mTLS
            + XMLDSig SHA-256. Comece em <strong>Produção Restrita</strong> pra
            validar — em Produção, S-1000 já enviado anteriormente vai
            retornar erro 207 (chave duplicada).
          </div>
        </div>

        {!resposta && (
          <form onSubmit={onSubmit} className="space-y-3">
            {nomeCliente && (
              <div className="text-xs text-gray-600">
                Empregador:{" "}
                <strong className="text-gray-800">{nomeCliente}</strong>
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
              <Field label="Grupo" required>
                <select
                  className={inputClass}
                  value={grupo}
                  onChange={(e) => setGrupo(Number(e.target.value) as 1 | 2 | 3)}
                  disabled={carregando}
                >
                  <option value={2}>2 — Demais entidades privadas</option>
                  <option value={1}>1 — Faturamento &gt; 78M</option>
                  <option value={3}>3 — Órgãos públicos</option>
                </select>
              </Field>
              <Field label="Início validade (YYYY-MM)" required>
                <input
                  type="month"
                  className={inputClass}
                  value={iniValid}
                  onChange={(e) => setIniValid(e.target.value)}
                  disabled={carregando}
                />
              </Field>
              <Field label="Classificação tributária" required>
                <select
                  className={inputClass}
                  value={classTrib}
                  onChange={(e) => setClassTrib(e.target.value)}
                  disabled={carregando}
                >
                  {CLASS_TRIB.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Natureza jurídica (CONCLA)" required>
                <select
                  className={inputClass}
                  value={natJurid}
                  onChange={(e) => setNatJurid(e.target.value)}
                  disabled={carregando}
                >
                  {NAT_JURID.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Razão social" required>
                <input
                  type="text"
                  className={inputClass}
                  value={nmRazao}
                  onChange={(e) => setNmRazao(e.target.value)}
                  maxLength={70}
                  disabled={carregando}
                />
              </Field>
            </div>

            <div className="border-t border-card-border pt-3">
              <div className="text-xs font-semibold text-verde-dark mb-2">
                Contato responsável
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nome do contato" required>
                  <input
                    type="text"
                    className={inputClass}
                    value={nmCtt}
                    onChange={(e) => setNmCtt(e.target.value)}
                    maxLength={70}
                    disabled={carregando}
                  />
                </Field>
                <Field label="CPF do contato" required>
                  <input
                    type="text"
                    className={inputClass}
                    value={cpfCtt}
                    onChange={(e) => setCpfCtt(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    disabled={carregando}
                  />
                </Field>
                <Field label="Telefone fixo">
                  <input
                    type="text"
                    className={inputClass}
                    value={foneFixo}
                    onChange={(e) => setFoneFixo(e.target.value)}
                    placeholder="(00) 0000-0000"
                    disabled={carregando}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={carregando}
                  />
                </Field>
              </div>
            </div>

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
                  disabled={carregando}
                >
                  {senhaVisivel ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={carregando}
                className="flex items-center gap-2"
              >
                {carregando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {carregando ? "Enviando…" : "Enviar S-1000"}
              </Button>
            </div>
          </form>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-alert space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={14} /> Erro no envio
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
              <div className="flex-1">
                <div className="font-semibold">
                  Lote enviado · {resposta.cdResposta} {resposta.descResposta}
                </div>
                <div className="text-gray-700 mt-1 font-mono text-[10px]">
                  Protocolo: {resposta.protocolo}
                  <br />
                  ID Lote: {resposta.id_lote}
                  <br />
                  ID Evento: {resposta.id_evento}
                </div>
                <div className="text-gray-700 mt-2">
                  Aguarde ~30s e consulte o processamento abaixo. O eSocial
                  processa em background — o protocolo dura pra você consultar
                  depois também (vide tela de lotes).
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={consultarPolling}
                disabled={polling || !senha}
                className="flex items-center gap-2"
              >
                {polling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {polling ? "Consultando…" : "Consultar processamento"}
              </Button>
              {!senha && (
                <span className="text-[10px] text-gray-500">
                  Digite a senha do cert acima pra habilitar
                </span>
              )}
            </div>

            {resultadoPoll && (
              <div
                className={
                  resultadoPoll.emProcessamento
                    ? "bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900"
                    : "bg-gray-50 border border-card-border rounded p-3 text-xs space-y-2"
                }
              >
                <div className="font-semibold">
                  {resultadoPoll.cdResposta} {resultadoPoll.descResposta}
                </div>
                {resultadoPoll.emProcessamento && (
                  <div>Ainda processando — tente novamente em ~30 segundos.</div>
                )}
                {!resultadoPoll.emProcessamento &&
                  resultadoPoll.eventos.length > 0 && (
                    <div className="space-y-2">
                      {resultadoPoll.eventos.map((ev, i) => {
                        const ok = ev.cdResposta === "201";
                        const adv = ev.cdResposta === "202";
                        const corBox = ok
                          ? "border-verde-primary/30 bg-verde-light text-verde-dark"
                          : adv
                          ? "border-amber-300 bg-amber-50 text-amber-900"
                          : "border-red-300 bg-red-50 text-red-alert";
                        return (
                          <div
                            key={`${ev.id}-${i}`}
                            className={`rounded border p-2 ${corBox}`}
                          >
                            <div className="font-semibold">
                              {ev.cdResposta} {ev.descResposta}
                            </div>
                            {ev.protocoloEvento && (
                              <div className="font-mono text-[10px] mt-1">
                                Recibo: {ev.protocoloEvento}
                              </div>
                            )}
                            {ev.ocorrencias.length > 0 && (
                              <ul className="mt-1 list-disc list-inside text-[10px]">
                                {ev.ocorrencias.map((o, j) => (
                                  <li key={j}>
                                    [{o.codigo}] {o.descricao}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
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

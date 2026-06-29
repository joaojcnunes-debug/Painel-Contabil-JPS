"use client";

import { useState, useMemo, type FormEvent } from "react";
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

type Operacao = "Empregador" | "NaoPeriodicos" | "Trabalhador" | "Tabela";

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

// Configuração de cada operação: tipos aceitos + campos exigidos
const OPERACOES: Record<
  Operacao,
  {
    label: string;
    descricao: string;
    tipos: Array<{ id: string; label: string }>;
    filtroData: "perApur" | "dtIniDtFim";
    requerCpf: boolean;
  }
> = {
  Empregador: {
    label: "Empregador (periódicos)",
    descricao: "Eventos periódicos do empregador, por competência",
    tipos: [
      { id: "S-1299", label: "S-1299 — Fechamento eventos periódicos" },
      { id: "S-1298", label: "S-1298 — Reabertura eventos periódicos" },
    ],
    filtroData: "perApur",
    requerCpf: false,
  },
  NaoPeriodicos: {
    label: "Não-periódicos",
    descricao: "Eventos não-periódicos do empregador, por intervalo de datas",
    tipos: [
      { id: "S-2190", label: "S-2190 — Admissão preliminar" },
      { id: "S-2200", label: "S-2200 — Admissão" },
      { id: "S-2205", label: "S-2205 — Alteração cadastral" },
      { id: "S-2206", label: "S-2206 — Alteração contrato" },
      { id: "S-2210", label: "S-2210 — CAT (acidente)" },
      { id: "S-2220", label: "S-2220 — ASO" },
      { id: "S-2230", label: "S-2230 — Afastamento" },
      { id: "S-2240", label: "S-2240 — Riscos" },
      { id: "S-2250", label: "S-2250 — Aviso prévio" },
      { id: "S-2298", label: "S-2298 — Reintegração" },
      { id: "S-2299", label: "S-2299 — Desligamento" },
      { id: "S-2300", label: "S-2300 — TSV início" },
      { id: "S-2306", label: "S-2306 — TSV alteração" },
      { id: "S-2399", label: "S-2399 — TSV término" },
    ],
    filtroData: "dtIniDtFim",
    requerCpf: false,
  },
  Trabalhador: {
    label: "Trabalhador (precisa CPF)",
    descricao: "Eventos periódicos de um trabalhador específico (precisa CPF)",
    tipos: [
      { id: "S-1200", label: "S-1200 — Remunerações" },
      { id: "S-1202", label: "S-1202 — RPPS" },
      { id: "S-1207", label: "S-1207 — Benefícios RPPS" },
      { id: "S-1210", label: "S-1210 — Pagamentos" },
      { id: "S-1260", label: "S-1260 — Aquisição produção rural PF" },
      { id: "S-1270", label: "S-1270 — Avulsos não portuários" },
      { id: "S-1280", label: "S-1280 — Contribuições conv. coletivas" },
      { id: "S-1295", label: "S-1295 — Totalização recolhimento" },
      { id: "S-2299", label: "S-2299 — Desligamento" },
      { id: "S-2399", label: "S-2399 — TSV término" },
    ],
    filtroData: "perApur",
    requerCpf: true,
  },
  Tabela: {
    label: "Tabela",
    descricao: "Tabelas (rubricas, lotações, cargos, etc) por intervalo",
    tipos: [
      { id: "S-1005", label: "S-1005 — Estabelecimentos / obras" },
      { id: "S-1010", label: "S-1010 — Rubricas" },
      { id: "S-1020", label: "S-1020 — Lotações tributárias" },
      { id: "S-1030", label: "S-1030 — Cargos" },
      { id: "S-1035", label: "S-1035 — Carreiras públicas" },
      { id: "S-1040", label: "S-1040 — Funções / cargos em comissão" },
      { id: "S-1050", label: "S-1050 — Horários e turnos" },
      { id: "S-1060", label: "S-1060 — Ambientes de trabalho" },
      { id: "S-1070", label: "S-1070 — Processos adm/judiciais" },
      { id: "S-1080", label: "S-1080 — Operadores portuários" },
    ],
    filtroData: "dtIniDtFim",
    requerCpf: false,
  },
};

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function primeiroDiaMesCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function ultimoDiaMesCorrente(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

export function EsocialConsultarModal({
  open,
  onClose,
  idCliente,
  nomeCliente,
}: Props) {
  const [ambiente, setAmbiente] = useState<1 | 2>(2);
  const [operacao, setOperacao] = useState<Operacao>("Empregador");
  const [tpEvt, setTpEvt] = useState("S-1299");
  const [perApur, setPerApur] = useState(competenciaAtual());
  const [dtIni, setDtIni] = useState(primeiroDiaMesCorrente());
  const [dtFim, setDtFim] = useState(ultimoDiaMesCorrente());
  const [cpfTrab, setCpfTrab] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaOk | null>(null);
  const [erro, setErro] = useState<RespostaErro | null>(null);

  const cfg = OPERACOES[operacao];
  const tiposDisponiveis = useMemo(() => cfg.tipos, [cfg.tipos]);

  // Quando troca operação, ajusta tpEvt pro primeiro tipo da nova lista
  function trocarOperacao(nova: Operacao) {
    setOperacao(nova);
    setTpEvt(OPERACOES[nova].tipos[0]?.id ?? "");
    setResposta(null);
    setErro(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      toast.error("Digite a senha do certificado");
      return;
    }
    if (cfg.requerCpf && cpfTrab.replace(/\D/g, "").length !== 11) {
      toast.error("CPF do trabalhador inválido (precisa 11 dígitos)");
      return;
    }
    setCarregando(true);
    setResposta(null);
    setErro(null);
    try {
      const body: Record<string, unknown> = {
        id_cliente: idCliente,
        ambiente,
        senha,
        operacao,
        tpEvt,
      };
      if (cfg.filtroData === "perApur") body.perApur = perApur;
      else {
        body.dtIni = dtIni;
        body.dtFim = dtFim;
      }
      if (cfg.requerCpf) body.cpfTrab = cpfTrab.replace(/\D/g, "");

      const res = await fetch("/api/integracoes/esocial-consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
            A1. Esta consulta <strong>não envia</strong> nada — só lista IDs de
            eventos já enviados. Comece em <strong>Produção Restrita</strong>{" "}
            pra validar.
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
            <Field label="Operação" required hint={cfg.descricao}>
              <select
                className={inputClass}
                value={operacao}
                onChange={(e) => trocarOperacao(e.target.value as Operacao)}
                disabled={carregando}
              >
                {(Object.keys(OPERACOES) as Operacao[]).map((op) => (
                  <option key={op} value={op}>
                    {OPERACOES[op].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de evento" required>
              <select
                className={inputClass}
                value={tpEvt}
                onChange={(e) => setTpEvt(e.target.value)}
                disabled={carregando}
              >
                {tiposDisponiveis.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {cfg.requerCpf && (
              <Field label="CPF do trabalhador" required>
                <input
                  type="text"
                  className={inputClass}
                  value={cpfTrab}
                  onChange={(e) => setCpfTrab(e.target.value)}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  disabled={carregando}
                />
              </Field>
            )}

            {cfg.filtroData === "perApur" ? (
              <Field label="Período de apuração" required>
                <input
                  type="month"
                  className={inputClass}
                  value={perApur}
                  onChange={(e) => setPerApur(e.target.value)}
                  disabled={carregando}
                />
              </Field>
            ) : (
              <>
                <Field label="Data inicial" required>
                  <input
                    type="date"
                    className={inputClass}
                    value={dtIni}
                    onChange={(e) => setDtIni(e.target.value)}
                    disabled={carregando}
                  />
                </Field>
                <Field label="Data final" required>
                  <input
                    type="date"
                    className={inputClass}
                    value={dtFim}
                    onChange={(e) => setDtFim(e.target.value)}
                    disabled={carregando}
                  />
                </Field>
              </>
            )}

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
                  <strong>{tpEvt}</strong> (
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

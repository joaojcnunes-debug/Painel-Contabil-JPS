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
  MapPin,
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

type Resposta = {
  ok: boolean;
  total_baixado?: number;
  total_salvos?: number;
  total_erros?: number;
  duracao_ms?: number;
  erros?: string[];
  erro?: string;
  codigo?: string;
};

export function NfseCariocaModal({ open, onClose, idCliente, nomeCliente }: Props) {
  const hoje = new Date().toISOString().slice(0, 10);
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);
  const trintaIso = trintaDias.toISOString().slice(0, 10);

  const [ambiente, setAmbiente] = useState<1 | 2>(1);
  const [dataIni, setDataIni] = useState(trintaIso);
  const [dataFim, setDataFim] = useState(hoje);
  const [inscricao, setInscricao] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resp, setResp] = useState<Resposta | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      toast.error("Digite a senha do certificado");
      return;
    }
    setCarregando(true);
    setResp(null);
    try {
      const r = await fetch("/api/integracoes/nfse-carioca-consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: idCliente,
          ambiente,
          senha,
          data_inicial: dataIni,
          data_final: dataFim,
          inscricao_municipal: inscricao || undefined,
        }),
      });
      const data = (await r.json()) as Resposta;
      setResp(data);
      if (data.ok) {
        toast.success(
          `${data.total_salvos ?? 0} NFSe salva(s) do Nota Carioca`
        );
        setSenha("");
      } else {
        toast.error(data.erro ?? "Erro na consulta");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setSenha("");
    setResp(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="NFSe — Nota Carioca (REAL, legado RJ)"
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
            Webservice legado <code>notacarioca.rio.gov.br/WSNacional</code>{" "}
            (ABRASF). Só emitentes do RJ. Desde 01/01/2026 <strong>não emite
            notas novas</strong> — só serve pra <strong>consultar histórico</strong>.
            Se o cliente já migrou pro Emissor Nacional, use o botão &quot;Baixar
            NFSe (REAL)&quot; em vez desse.
          </div>
        </div>

        {!resp && (
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
                  <option value={1}>Produção</option>
                  <option value={2}>Homologação</option>
                </select>
              </Field>

              <Field label="Inscrição Municipal (opcional)" hint="Se souber, aumenta a precisão">
                <div className="relative">
                  <MapPin
                    size={12}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    className={`${inputClass} pl-8`}
                    value={inscricao}
                    onChange={(e) => setInscricao(e.target.value.replace(/\D/g, ""))}
                    placeholder="Só dígitos"
                    disabled={carregando}
                  />
                </div>
              </Field>

              <Field label="Data inicial" required>
                <input
                  type="date"
                  className={inputClass}
                  value={dataIni}
                  onChange={(e) => setDataIni(e.target.value)}
                  disabled={carregando}
                />
              </Field>

              <Field label="Data final" required>
                <input
                  type="date"
                  className={inputClass}
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
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
                    type={verSenha ? "text" : "password"}
                    className={inputClass + " pl-9 pr-10"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="off"
                    disabled={carregando}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setVerSenha((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800"
                    disabled={carregando}
                  >
                    {verSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={carregando} className="flex items-center gap-2">
                {carregando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {carregando ? "Consultando…" : "Consultar Nota Carioca"}
              </Button>
            </div>
          </form>
        )}

        {resp && !resp.ok && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs">
            <div className="font-semibold text-red-alert mb-1">
              Erro na consulta
              {resp.codigo && <span className="ml-2 text-[10px]">código {resp.codigo}</span>}
            </div>
            <div className="text-gray-700 whitespace-pre-wrap">{resp.erro}</div>
          </div>
        )}

        {resp?.ok && (
          <div className="bg-verde-light border border-verde-primary/30 rounded p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-verde-dark">
              <CheckCircle2 size={14} /> Consulta concluída
            </div>
            <div className="grid grid-cols-3 gap-2 text-gray-700">
              <div>
                <strong>{resp.total_baixado}</strong> NFSe(s) encontradas
              </div>
              <div>
                <strong>{resp.total_salvos}</strong> salvas
              </div>
              <div>
                {resp.total_erros != null && resp.total_erros > 0 ? (
                  <span className="text-amber-800">
                    {resp.total_erros} erro(s)
                  </span>
                ) : (
                  "sem erros"
                )}
              </div>
              <div className="col-span-3 text-[10px] text-gray-500">
                Duração: {((resp.duracao_ms ?? 0) / 1000).toFixed(1)}s
              </div>
            </div>
            <div className="text-[10px] text-gray-600 pt-2 border-t border-verde-primary/20">
              Veja as notas em{" "}
              <a
                href="/integracoes/nfse/recebidas"
                className="text-verde-dark underline"
              >
                Notas Fiscais Emitidas
              </a>
              . Aparecem com origem <code>nota_carioca</code>.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

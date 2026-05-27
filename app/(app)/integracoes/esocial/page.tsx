"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  History,
  HeartPulse,
  Loader2,
  Play,
  Send,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { BadgeModo } from "@/components/integracoes/BadgeStatus";
import { useClientes } from "@/lib/hooks/useClientes";
import { useIntegracoes } from "@/lib/hooks/useIntegracoes";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { executarIntegracao } from "@/lib/integracoes/core/client";
import { formatDate, gerarId } from "@/lib/utils";
import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "@/lib/integracoes/core/types";

type Aba = "pendentes" | "enviar" | "historico" | "sst";

const ACAO_POR_ABA: Record<Aba, string> = {
  pendentes: "listar_pendentes",
  enviar: "enviar_eventos",
  historico: "listar_enviados",
  sst: "gerar_xml_sst",
};

const COR_CODIGO: Record<string, string> = {
  "S-1200": "bg-blue-100 text-blue-700",
  "S-1210": "bg-cyan-100 text-cyan-700",
  "S-2200": "bg-green-100 text-green-700",
  "S-2299": "bg-amber-100 text-amber-800",
  "S-2210": "bg-red-100 text-red-alert",
  "S-2220": "bg-purple-100 text-purple-700",
  "S-2240": "bg-rose-100 text-rose-700",
};

export default function ESocialPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("pendentes");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "ESOCIAL") ?? null,
    [configs]
  );

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id_cliente === idCliente) ?? null,
    [clientes, idCliente]
  );

  async function executar() {
    if (!idCliente) {
      toast.error("Selecione uma empresa");
      return;
    }
    setExecutando(true);
    setResposta(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const acao = ACAO_POR_ABA[aba];
      const resp = await executarIntegracao({
        supabase,
        modulo: "ESOCIAL",
        acao,
        modo: (config?.modo ?? "SIMULADO") as ModoIntegracao,
        idConfig: config?.id_config ?? null,
        idCliente,
        cnpjCliente: clienteSel?.cnpj ?? null,
        usuario: { email: user?.email, nome: user?.nome },
      });
      setResposta(resp);

      const status: StatusIntegracao = resp.ok
        ? (resp.pendencias?.length ?? 0) > 0
          ? "PENDENTE"
          : "OK"
        : "ERRO";
      if (config) {
        await supabase
          .from("integracoes_config")
          .update({
            ultima_sync: new Date().toISOString(),
            ultimo_status: status,
            ultimo_retorno: resp as unknown as Record<string, unknown>,
            pendencias_count: resp.pendencias?.length ?? 0,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id_config", config.id_config);
      } else {
        await supabase.from("integracoes_config").insert({
          id_config: gerarId("INT"),
          id_cliente: idCliente,
          modulo: "ESOCIAL",
          ativo: true,
          modo: "SIMULADO",
          ultima_sync: new Date().toISOString(),
          ultimo_status: status,
          ultimo_retorno: resp as unknown as Record<string, unknown>,
          pendencias_count: resp.pendencias?.length ?? 0,
        } as never);
      }
      qc.invalidateQueries({ queryKey: ["integracoes-config"] });
      qc.invalidateQueries({ queryKey: ["integracoes-logs"] });

      if (!resp.ok) toast.error(resp.erro?.mensagem ?? "Erro");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExecutando(false);
    }
  }

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="eSocial" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar integrações.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/integracoes"
          className="text-sm text-gray-600 hover:text-verde-dark flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>

      <PageHeader
        title="eSocial"
        subtitle="Eventos trabalhistas, folha e SST (S-2210 CAT / S-2220 ASO / S-2240 riscos)"
        actions={
          <Link
            href="/integracoes/logs?modulo=ESOCIAL"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <History size={14} /> Logs
          </Link>
        }
      />

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[280px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => {
              setIdCliente(e.target.value);
              setResposta(null);
            }}
          >
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        {config && (
          <div className="ml-auto flex items-center gap-2">
            <BadgeModo modo={config.modo} />
            {config.ultima_sync && (
              <div className="text-[11px] text-gray-500">
                Última sync: {formatDate(config.ultima_sync)}{" "}
                {new Date(config.ultima_sync).toLocaleTimeString("pt-BR")}
              </div>
            )}
          </div>
        )}
      </div>

      {!idCliente ? (
        <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
          Selecione uma empresa pra trabalhar com eventos eSocial.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "pendentes"}
              onClick={() => {
                setAba("pendentes");
                setResposta(null);
              }}
              icon={AlertCircle}
            >
              Pendentes
            </TabBtn>
            <TabBtn
              ativo={aba === "enviar"}
              onClick={() => {
                setAba("enviar");
                setResposta(null);
              }}
              icon={Send}
            >
              Enviar lote
            </TabBtn>
            <TabBtn
              ativo={aba === "historico"}
              onClick={() => {
                setAba("historico");
                setResposta(null);
              }}
              icon={History}
            >
              Histórico
            </TabBtn>
            <TabBtn
              ativo={aba === "sst"}
              onClick={() => {
                setAba("sst");
                setResposta(null);
              }}
              icon={HeartPulse}
            >
              XMLs SST
            </TabBtn>
          </div>

          <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              <strong>Ação:</strong>{" "}
              <span className="font-mono text-xs text-gray-600">
                {ACAO_POR_ABA[aba]}
              </span>
            </div>
            <Button
              onClick={executar}
              disabled={executando}
              className="flex items-center gap-2"
            >
              {executando ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Executando…
                </>
              ) : (
                <>
                  <Play size={14} />
                  {aba === "enviar" ? "Enviar agora" : "Consultar"}
                </>
              )}
            </Button>
          </div>

          {resposta && !resposta.ok && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-alert flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>{resposta.erro?.codigo}</strong>
                <div className="text-xs mt-0.5">{resposta.erro?.mensagem}</div>
              </div>
            </div>
          )}

          {resposta?.ok && aba === "pendentes" && (
            <Pendentes resposta={resposta} />
          )}
          {resposta?.ok && aba === "enviar" && <EnvioOK resposta={resposta} />}
          {resposta?.ok && aba === "historico" && (
            <Historico resposta={resposta} />
          )}
          {resposta?.ok && aba === "sst" && <SST resposta={resposta} />}

          {!resposta && !executando && (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              {aba === "enviar"
                ? "Clique em &quot;Enviar agora&quot; pra processar o lote de eventos pendentes."
                : "Clique em &quot;Consultar&quot; pra buscar os dados."}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componentes por aba ────────────────────────────────────

function Pendentes({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    eventos?: Array<{
      codigo: string;
      nome: string;
      funcionario: string;
      competencia: string;
      criado_em: string;
      status: string;
    }>;
    total?: number;
  };
  const eventos = d.eventos ?? [];

  if (eventos.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhum evento pendente
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-900 flex items-center gap-2">
        <AlertTriangle size={16} />
        <strong>{eventos.length}</strong> evento(s) aguardando envio. Vá pra
        aba &quot;Enviar lote&quot; pra processar.
      </div>
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-24">Código</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Funcionário</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {eventos.map((ev, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded font-mono ${
                      COR_CODIGO[ev.codigo] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {ev.codigo}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{ev.nome}</td>
                <td className="px-4 py-3 text-gray-800 font-medium">
                  {ev.funcionario}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {ev.competencia}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {formatDate(ev.criado_em)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EnvioOK({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    recibo?: string;
    protocolo?: string;
    eventos_enviados?: number;
    data_envio?: string;
  };
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200 mb-4">
        <Upload size={28} className="text-green-700" />
        <div>
          <div className="font-serif text-lg font-bold text-verde-dark">
            Lote enviado com sucesso
          </div>
          <div className="text-xs text-gray-600">
            {d.eventos_enviados} evento(s) processado(s)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-card-border rounded-lg p-3 bg-app-bg/40">
          <div className="text-[10px] uppercase text-gray-500 tracking-wide">
            Recibo de entrega
          </div>
          <div className="font-mono text-sm text-gray-800 mt-1">
            {d.recibo}
          </div>
        </div>
        <div className="border border-card-border rounded-lg p-3 bg-app-bg/40">
          <div className="text-[10px] uppercase text-gray-500 tracking-wide">
            Protocolo
          </div>
          <div className="font-mono text-sm text-gray-800 mt-1">
            {d.protocolo}
          </div>
        </div>
      </div>

      {d.data_envio && (
        <div className="text-xs text-gray-500 mt-3">
          Enviado em {new Date(d.data_envio).toLocaleString("pt-BR")}
        </div>
      )}
    </div>
  );
}

function Historico({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    lotes?: Array<{
      recibo: string;
      data_envio: string;
      eventos_total: number;
      eventos_aceitos: number;
      eventos_rejeitados: number;
      status: string;
    }>;
  };
  const lotes = d.lotes ?? [];
  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Recibo</th>
            <th className="px-4 py-3">Data envio</th>
            <th className="px-4 py-3 text-center">Total</th>
            <th className="px-4 py-3 text-center">Aceitos</th>
            <th className="px-4 py-3 text-center">Rejeitados</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {lotes.map((l, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-[11px] text-gray-700">
                {l.recibo}
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                {formatDate(l.data_envio)}
              </td>
              <td className="px-4 py-3 text-center text-gray-700">
                {l.eventos_total}
              </td>
              <td className="px-4 py-3 text-center text-green-700 font-medium">
                {l.eventos_aceitos}
              </td>
              <td className="px-4 py-3 text-center text-red-alert">
                {l.eventos_rejeitados > 0 ? l.eventos_rejeitados : "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                    l.status === "PROCESSADO"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {l.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SST({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    gerados?: Array<{
      codigo: string;
      nome: string;
      xml_size_bytes: number;
      funcionario: string;
      data_acidente?: string;
      tipo_aso?: string;
      data_exame?: string;
      ambiente?: string;
      qtd_riscos?: number;
    }>;
  };
  const gerados = d.gerados ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {gerados.map((g, i) => (
        <div
          key={i}
          className="bg-white border border-card-border rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded font-mono ${
                COR_CODIGO[g.codigo] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {g.codigo}
            </span>
            <FileCheck2 size={18} className="text-gold" />
          </div>
          <div className="font-medium text-gray-800 mb-1">{g.nome}</div>
          <div className="text-xs text-gray-600 mb-3">{g.funcionario}</div>

          <div className="space-y-1 text-[11px] text-gray-600">
            {g.data_acidente && (
              <div>
                <strong>Data do acidente:</strong>{" "}
                {formatDate(g.data_acidente)}
              </div>
            )}
            {g.tipo_aso && (
              <div>
                <strong>Tipo:</strong> {g.tipo_aso} • Exame{" "}
                {formatDate(g.data_exame ?? null)}
              </div>
            )}
            {g.ambiente && (
              <div>
                <strong>Ambiente:</strong> {g.ambiente} • {g.qtd_riscos} risco(s)
              </div>
            )}
            <div className="text-[10px] text-gray-400 pt-1 border-t border-card-border">
              XML: {(g.xml_size_bytes / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabBtn({
  ativo,
  onClick,
  icon: Icon,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        ativo
          ? "px-3 py-1.5 rounded-md bg-verde-primary text-white text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"
          : "px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50 text-sm flex items-center gap-1.5 whitespace-nowrap"
      }
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

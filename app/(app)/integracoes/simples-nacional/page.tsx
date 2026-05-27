"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileText,
  History,
  Layers,
  Loader2,
  Play,
  Receipt,
  TrendingUp,
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
import { formatBRL, formatDate, gerarId } from "@/lib/utils";
import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "@/lib/integracoes/core/types";

type Aba = "pgdas" | "das" | "parcelamentos" | "sublimite";

const ACAO_POR_ABA: Record<Aba, string> = {
  pgdas: "consultar_pgdas",
  das: "gerar_das",
  parcelamentos: "consultar_parcelamentos",
  sublimite: "checar_sublimite",
};

export default function SimplesNacionalPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("pgdas");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "SIMPLES_NACIONAL") ?? null,
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
        modulo: "SIMPLES_NACIONAL",
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
          modulo: "SIMPLES_NACIONAL",
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
        <PageHeader title="Simples Nacional" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar integrações.
        </div>
      </div>
    );
  }

  const ehSimples = clienteSel?.regime === "SIMPLES_NACIONAL";

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
        title="Simples Nacional"
        subtitle="PGDAS-D, geração de DAS, parcelamentos e sublimite estadual"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/apuracao"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light"
            >
              <Calculator size={14} /> Módulo de Apuração
            </Link>
            <Link
              href="/integracoes/logs?modulo=SIMPLES_NACIONAL"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <History size={14} /> Logs
            </Link>
          </div>
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
                {c.regime !== "SIMPLES_NACIONAL" && ` (${c.regime})`}
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

      {idCliente && !ehSimples && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Esta empresa não está marcada como Simples Nacional no cadastro
            (regime atual: <strong>{clienteSel?.regime}</strong>). Os dados
            simulados ainda serão retornados, mas em produção esta consulta
            retornaria erro.
          </div>
        </div>
      )}

      {!idCliente ? (
        <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
          Selecione uma empresa pra consultar Simples Nacional.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "pgdas"}
              onClick={() => {
                setAba("pgdas");
                setResposta(null);
              }}
              icon={FileText}
            >
              PGDAS-D
            </TabBtn>
            <TabBtn
              ativo={aba === "das"}
              onClick={() => {
                setAba("das");
                setResposta(null);
              }}
              icon={Receipt}
            >
              Gerar DAS
            </TabBtn>
            <TabBtn
              ativo={aba === "parcelamentos"}
              onClick={() => {
                setAba("parcelamentos");
                setResposta(null);
              }}
              icon={Layers}
            >
              Parcelamentos
            </TabBtn>
            <TabBtn
              ativo={aba === "sublimite"}
              onClick={() => {
                setAba("sublimite");
                setResposta(null);
              }}
              icon={TrendingUp}
            >
              Sublimite
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
                  <Loader2 size={14} className="animate-spin" /> Consultando…
                </>
              ) : (
                <>
                  <Play size={14} /> Consultar agora
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

          {resposta?.ok && aba === "pgdas" && <PGDAS resposta={resposta} />}
          {resposta?.ok && aba === "das" && <GeradorDAS resposta={resposta} />}
          {resposta?.ok && aba === "parcelamentos" && (
            <Parcelamentos resposta={resposta} />
          )}
          {resposta?.ok && aba === "sublimite" && (
            <Sublimite resposta={resposta} />
          )}

          {!resposta && !executando && (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Clique em &quot;Consultar agora&quot; pra buscar os dados.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componentes por aba ─────────────────────────────────────

function PGDAS({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    declaracoes?: Array<{
      competencia: string;
      status: string;
      receita_declarada: number;
      valor_das: number;
      data_transmissao: string | null;
    }>;
  };
  const decls = d.declaracoes ?? [];
  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Competência</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Receita declarada</th>
            <th className="px-4 py-3 text-right">DAS</th>
            <th className="px-4 py-3">Transmissão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {decls.map((d, i) => {
            const cls =
              d.status === "DECLARADA"
                ? "bg-green-100 text-green-700"
                : d.status === "RETIFICADA"
                ? "bg-blue-100 text-blue-700"
                : "bg-red-100 text-red-alert";
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{d.competencia}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${cls}`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                  {formatBRL(d.receita_declarada)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                  {formatBRL(d.valor_das)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {d.data_transmissao ? formatDate(d.data_transmissao) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GeradorDAS({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    das_gerado?: {
      competencia: string;
      numero: string;
      codigo_barras: string;
      vencimento: string;
      valor: number;
      receita_apurada: number;
    };
  };
  const das = d.das_gerado;
  if (!das) {
    return (
      <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
        DAS não gerado.
      </div>
    );
  }
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <Receipt size={28} className="text-gold" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
            DAS gerado
          </div>
          <div className="font-serif text-xl font-bold text-verde-dark">
            Competência {das.competencia}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Receita apurada" value={formatBRL(das.receita_apurada)} />
        <Stat label="Valor DAS" value={formatBRL(das.valor)} highlight />
        <Stat label="Vencimento" value={formatDate(das.vencimento)} />
      </div>

      <div className="border border-card-border rounded-lg p-3 bg-app-bg/40 mb-3">
        <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
          Nº do DAS
        </div>
        <div className="font-mono text-sm text-gray-800">{das.numero}</div>
      </div>
      <div className="border border-card-border rounded-lg p-3 bg-app-bg/40">
        <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
          Código de barras
        </div>
        <div className="font-mono text-xs text-gray-700 break-all">
          {das.codigo_barras}
        </div>
      </div>

      <div className="text-[11px] text-gray-500 mt-4">
        Em modo real, este endpoint geraria o PDF do DAS pra download.
      </div>
    </div>
  );
}

function Parcelamentos({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    parcelamentos?: Array<{
      numero: string;
      tipo: string;
      data_adesao: string;
      parcelas_total: number;
      parcelas_pagas: number;
      valor_original: number;
      saldo_devedor: number;
      proxima_parcela_valor: number;
      proxima_parcela_vencimento: string;
      status: string;
    }>;
  };
  const parcs = d.parcelamentos ?? [];

  if (parcs.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhum parcelamento ativo
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {parcs.map((p, i) => {
        const pct = (p.parcelas_pagas / p.parcelas_total) * 100;
        return (
          <div
            key={i}
            className="bg-white border border-card-border rounded-xl p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-xs font-mono text-gray-500">{p.numero}</div>
                <div className="font-medium text-gray-800">{p.tipo}</div>
                <div className="text-[11px] text-gray-500">
                  Adesão em {formatDate(p.data_adesao)}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-green-100 text-green-700">
                {p.status === "EM_DIA" ? "Em dia" : p.status}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>
                  Parcelas: {p.parcelas_pagas} / {p.parcelas_total}
                </span>
                <span>{pct.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-verde-primary h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Stat label="Valor original" value={formatBRL(p.valor_original)} />
              <Stat label="Saldo devedor" value={formatBRL(p.saldo_devedor)} />
              <Stat
                label="Próxima parcela"
                value={formatBRL(p.proxima_parcela_valor)}
              />
              <Stat
                label="Vencimento"
                value={formatDate(p.proxima_parcela_vencimento)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sublimite({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    rbt12?: number;
    sublimite_estadual?: number;
    ultrapassado?: boolean;
    margem?: number;
    ano_atual_aproximado?: number;
  };
  const rbt12 = d.rbt12 ?? 0;
  const sublimite = d.sublimite_estadual ?? 3600000;
  const pct = (rbt12 / sublimite) * 100;

  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          d.ultrapassado
            ? "bg-red-50 border border-red-200"
            : pct > 80
            ? "bg-amber-50 border border-amber-200"
            : "bg-green-50 border border-green-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {d.ultrapassado ? (
            <AlertTriangle size={28} className="text-red-alert" />
          ) : pct > 80 ? (
            <AlertTriangle size={28} className="text-amber-700" />
          ) : (
            <CheckCircle2 size={28} className="text-green-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              {d.ultrapassado
                ? "Sublimite ULTRAPASSADO"
                : pct > 80
                ? "Próximo do sublimite"
                : "Dentro do sublimite estadual"}
            </div>
            <div className="text-xs text-gray-600">
              Sublimite: {formatBRL(sublimite)} (ICMS/ISS)
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="RBT12 atual" value={formatBRL(rbt12)} highlight />
        <Stat
          label="Margem"
          value={formatBRL(Math.max(0, d.margem ?? 0))}
          tone={d.ultrapassado ? "red" : undefined}
        />
        <Stat
          label="Projeção ano-base"
          value={formatBRL(d.ano_atual_aproximado ?? 0)}
        />
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>0</span>
          <span>{formatBRL(sublimite)}</span>
        </div>
        <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              d.ultrapassado
                ? "bg-red-alert"
                : pct > 80
                ? "bg-amber-500"
                : "bg-verde-primary"
            }`}
            style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
          />
        </div>
        <div className="text-center text-xs text-gray-500 mt-1">
          {pct.toFixed(1)}% do sublimite usado
        </div>
      </div>

      {resposta.mensagens?.map((m, i) => (
        <div
          key={i}
          className={`mt-4 text-xs rounded p-2 ${
            d.ultrapassado
              ? "bg-red-50 text-red-alert"
              : "bg-gray-50 text-gray-700"
          }`}
        >
          {m}
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "red";
}) {
  return (
    <div
      className={
        highlight
          ? "border border-gold/40 rounded-lg p-3 bg-gold/5"
          : "border border-card-border rounded-lg p-3 bg-white"
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold mt-0.5 ${
          highlight
            ? "text-verde-dark"
            : tone === "red"
            ? "text-red-alert"
            : "text-gray-800"
        }`}
      >
        {value}
      </div>
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  History,
  Link2,
  Loader2,
  Percent,
  Play,
  Send,
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
import { formatBRL, formatCNPJ, formatDate, gerarId } from "@/lib/utils";
import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "@/lib/integracoes/core/types";

type Aba = "pendentes" | "servicos" | "retencoes" | "dctfweb";

const ACAO_POR_ABA: Record<Aba, string> = {
  pendentes: "listar_pendentes_r4000",
  servicos: "listar_servicos_tomados",
  retencoes: "consultar_retencoes",
  dctfweb: "consultar_vinculo_dctfweb",
};

const COR_CODIGO: Record<string, string> = {
  "R-4010": "bg-blue-100 text-blue-700",
  "R-4020": "bg-purple-100 text-purple-700",
  "R-4040": "bg-amber-100 text-amber-800",
  "R-4080": "bg-rose-100 text-rose-700",
};

export default function EFDReinfPage() {
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
    () => configs.find((c) => c.modulo === "EFD_REINF") ?? null,
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
        modulo: "EFD_REINF",
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
          modulo: "EFD_REINF",
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
        <PageHeader title="EFD-Reinf" />
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
        title="EFD-Reinf"
        subtitle="Série R-4000 (serviços tomados/prestados), retenções e DCTFWeb"
        actions={
          <Link
            href="/integracoes/logs?modulo=EFD_REINF"
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
          Selecione uma empresa pra consultar EFD-Reinf.
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
              icon={Send}
            >
              Pendentes R-4000
            </TabBtn>
            <TabBtn
              ativo={aba === "servicos"}
              onClick={() => {
                setAba("servicos");
                setResposta(null);
              }}
              icon={Briefcase}
            >
              Serviços tomados
            </TabBtn>
            <TabBtn
              ativo={aba === "retencoes"}
              onClick={() => {
                setAba("retencoes");
                setResposta(null);
              }}
              icon={Percent}
            >
              Retenções
            </TabBtn>
            <TabBtn
              ativo={aba === "dctfweb"}
              onClick={() => {
                setAba("dctfweb");
                setResposta(null);
              }}
              icon={Link2}
            >
              Vínculo DCTFWeb
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

          {resposta?.ok && aba === "pendentes" && (
            <Pendentes resposta={resposta} />
          )}
          {resposta?.ok && aba === "servicos" && (
            <ServicosTomados resposta={resposta} />
          )}
          {resposta?.ok && aba === "retencoes" && (
            <Retencoes resposta={resposta} />
          )}
          {resposta?.ok && aba === "dctfweb" && (
            <VinculoDCTFWeb resposta={resposta} />
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

function Pendentes({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    pendentes?: Array<{
      codigo: string;
      nome: string;
      competencia: string;
      qtd_beneficiarios: number;
      valor_total: number;
    }>;
  };
  const pendentes = d.pendentes ?? [];

  if (pendentes.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhum evento R-4000 pendente
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {pendentes.map((p, i) => (
        <div
          key={i}
          className="bg-white border border-card-border rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-2">
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded font-mono ${
                COR_CODIGO[p.codigo] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {p.codigo}
            </span>
            <AlertCircle size={16} className="text-amber-700" />
          </div>
          <div className="font-medium text-gray-800">{p.nome}</div>
          <div className="text-xs text-gray-600 mt-0.5">
            Competência {p.competencia}
          </div>
          <div className="mt-3 pt-3 border-t border-card-border text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Beneficiários</span>
              <strong>{p.qtd_beneficiarios}</strong>
            </div>
            <div className="flex justify-between text-verde-dark font-semibold mt-1">
              <span>Valor total</span>
              <span>{formatBRL(p.valor_total)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServicosTomados({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    servicos?: Array<{
      beneficiario: string;
      cnpj: string;
      natureza_servico: string;
      data_pagamento: string;
      valor_bruto: number;
      base_calculo: number;
      aliquota: number;
      valor_ir: number;
      pis_cofins_csll: {
        pis: number;
        cofins: number;
        csll: number;
      } | null;
    }>;
    total_retido?: number;
  };
  const servicos = d.servicos ?? [];

  return (
    <div>
      {d.total_retido != null && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm text-purple-900">
          <strong>Total retido no período:</strong>{" "}
          {formatBRL(d.total_retido)} ({servicos.length} fornecedores)
        </div>
      )}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Beneficiário</th>
              <th className="px-4 py-3">Natureza</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor bruto</th>
              <th className="px-4 py-3 text-center">Alíq. IR</th>
              <th className="px-4 py-3 text-right">IR retido</th>
              <th className="px-4 py-3 text-right">PIS/COFINS/CSLL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {servicos.map((s, i) => {
              const pisCofinsCsll = s.pis_cofins_csll
                ? s.pis_cofins_csll.pis +
                  s.pis_cofins_csll.cofins +
                  s.pis_cofins_csll.csll
                : 0;
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {s.beneficiario}
                    </div>
                    <div className="text-[11px] font-mono text-gray-500">
                      {formatCNPJ(s.cnpj)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {s.natureza_servico}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {formatDate(s.data_pagamento)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatBRL(s.valor_bruto)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-700">
                    {s.aliquota.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right text-red-alert whitespace-nowrap">
                    {formatBRL(s.valor_ir)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-600 whitespace-nowrap">
                    {pisCofinsCsll > 0 ? formatBRL(pisCofinsCsll) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Retencoes({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    retencoes?: Array<{ tipo: string; valor: number; codigo: string }>;
    total?: number;
    competencia?: string;
  };
  const retencoes = d.retencoes ?? [];

  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
            Retenções consolidadas
          </div>
          <div className="font-serif text-xl font-bold text-verde-dark">
            Competência {d.competencia}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-gray-500">Total</div>
          <div className="text-2xl font-bold text-verde-dark">
            {formatBRL(d.total ?? 0)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {retencoes.map((r, i) => (
          <div
            key={i}
            className="border border-card-border rounded-lg p-3 bg-app-bg/40"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-gray-500">
                  Código {r.codigo}
                </div>
                <div className="font-medium text-gray-800 mt-0.5">{r.tipo}</div>
              </div>
              <Percent size={16} className="text-gold" />
            </div>
            <div className="text-lg font-bold text-verde-dark mt-2">
              {formatBRL(r.valor)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VinculoDCTFWeb({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    competencia?: string;
    valor_apurado_reinf?: number;
    valor_dctfweb?: number;
    diferenca?: number;
    status?: string;
    eventos_origem?: string[];
  };
  const ok = d.status === "OK";

  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          ok
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {ok ? (
            <CheckCircle2 size={28} className="text-green-700" />
          ) : (
            <AlertTriangle size={28} className="text-amber-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              {ok ? "Vínculo OK" : "Divergência detectada"}
            </div>
            <div className="text-xs text-gray-600">
              Competência {d.competencia}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Stat
          label="Apurado EFD-Reinf"
          value={formatBRL(d.valor_apurado_reinf ?? 0)}
        />
        <Stat label="DCTFWeb" value={formatBRL(d.valor_dctfweb ?? 0)} />
        <Stat
          label="Diferença"
          value={formatBRL(d.diferenca ?? 0)}
          highlight={!ok}
          tone={(d.diferenca ?? 0) !== 0 ? "red" : undefined}
        />
      </div>

      {d.eventos_origem && d.eventos_origem.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-2">
            Eventos de origem
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {d.eventos_origem.map((e) => (
              <span
                key={e}
                className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded font-mono ${
                  COR_CODIGO[e] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {resposta.mensagens?.map((m, i) => (
        <div
          key={i}
          className={`mt-4 text-xs rounded p-2 ${
            ok ? "bg-gray-50 text-gray-700" : "bg-amber-50 text-amber-900"
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
          tone === "red" ? "text-red-alert" : "text-gray-800"
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  History,
  Landmark,
  Loader2,
  Play,
  Receipt,
  ShieldCheck,
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

type Aba = "nfse" | "iss" | "cnd" | "municipios";

const ACAO_POR_ABA: Record<Aba, string> = {
  nfse: "consultar_nfse_emitidas",
  iss: "consultar_iss",
  cnd: "consultar_cnd_municipal",
  municipios: "listar_municipios_configurados",
};

export default function PrefeiturasPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("nfse");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "PREFEITURAS") ?? null,
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
      const resp = await executarIntegracao({
        supabase,
        modulo: "PREFEITURAS",
        acao: ACAO_POR_ABA[aba],
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
          modulo: "PREFEITURAS",
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
        <PageHeader title="Prefeituras / ISS" />
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
        title="Prefeituras / ISS"
        subtitle="NFS-e, ISS e CND municipal — multi-município"
        actions={
          <Link
            href="/integracoes/logs?modulo=PREFEITURAS"
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
                Última sync: {formatDate(config.ultima_sync)}
              </div>
            )}
          </div>
        )}
      </div>

      {!idCliente ? (
        <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
          Selecione uma empresa pra consultar a prefeitura.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "nfse"}
              onClick={() => {
                setAba("nfse");
                setResposta(null);
              }}
              icon={Receipt}
            >
              NFS-e emitidas
            </TabBtn>
            <TabBtn
              ativo={aba === "iss"}
              onClick={() => {
                setAba("iss");
                setResposta(null);
              }}
              icon={Landmark}
            >
              ISS devido
            </TabBtn>
            <TabBtn
              ativo={aba === "cnd"}
              onClick={() => {
                setAba("cnd");
                setResposta(null);
              }}
              icon={ShieldCheck}
            >
              CND municipal
            </TabBtn>
            <TabBtn
              ativo={aba === "municipios"}
              onClick={() => {
                setAba("municipios");
                setResposta(null);
              }}
              icon={Building2}
            >
              Municípios
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
                  <Play size={14} /> Consultar
                </>
              )}
            </Button>
          </div>

          {resposta && !resposta.ok && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-alert flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>{resposta.erro?.mensagem}</div>
            </div>
          )}

          {resposta?.ok && aba === "nfse" && <NFSe resposta={resposta} />}
          {resposta?.ok && aba === "iss" && <ISS resposta={resposta} />}
          {resposta?.ok && aba === "cnd" && <CND resposta={resposta} />}
          {resposta?.ok && aba === "municipios" && (
            <Municipios resposta={resposta} />
          )}

          {!resposta && !executando && (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Clique em &quot;Consultar&quot; pra buscar os dados.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NFSe({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    emitidas?: Array<{
      numero: string;
      codigo_verificacao: string;
      tomador: string;
      cnpj_tomador: string;
      servico: string;
      data_emissao: string;
      valor_servico: number;
      valor_iss: number;
      aliquota: number;
    }>;
    municipio?: string;
  };
  const emitidas = d.emitidas ?? [];
  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">
        Município: <strong className="text-gray-700">{d.municipio}</strong>
      </div>
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-20">Nº</th>
              <th className="px-4 py-3">Tomador</th>
              <th className="px-4 py-3">Serviço</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">ISS ({emitidas[0]?.aliquota ?? 5}%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {emitidas.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{e.numero}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{e.tomador}</div>
                  <div className="text-[11px] font-mono text-gray-500">
                    {formatCNPJ(e.cnpj_tomador)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">{e.servico}</td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(e.data_emissao)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                  {formatBRL(e.valor_servico)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-alert">
                  {formatBRL(e.valor_iss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ISS({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    competencias?: Array<{
      competencia: string;
      valor_iss: number;
      status: string;
      vencimento: string;
      data_pagamento: string | null;
    }>;
    total_em_aberto?: number;
  };
  const comps = d.competencias ?? [];
  return (
    <div>
      {(d.total_em_aberto ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-900">
          <strong>Total em aberto:</strong> {formatBRL(d.total_em_aberto ?? 0)}
        </div>
      )}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Valor ISS</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Pagamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {comps.map((c, i) => {
              const cls =
                c.status === "PAGO"
                  ? "bg-green-100 text-green-700"
                  : c.status === "EM_ABERTO"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-red-100 text-red-alert";
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.competencia}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${cls}`}
                    >
                      {c.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                    {formatBRL(c.valor_iss)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {formatDate(c.vencimento)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {c.data_pagamento ? formatDate(c.data_pagamento) : "—"}
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

function CND({ resposta }: { resposta: RespostaIntegracao }) {
  const cert = resposta.certidoes?.[0];
  const d = resposta.dados as { municipio?: string; codigo_validacao?: string | null };
  if (!cert) return null;
  const regular = cert.situacao === "REGULAR";
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          regular
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {regular ? (
            <CheckCircle2 size={28} className="text-green-700" />
          ) : (
            <AlertCircle size={28} className="text-amber-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              CND Municipal — {d.municipio}
            </div>
            <div className="text-xs text-gray-600">
              {regular ? "NEGATIVA de débitos" : "POSITIVA COM EFEITOS"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-card-border rounded-lg p-3">
          <div className="text-[10px] uppercase text-gray-500">Emissão</div>
          <div className="font-medium">{formatDate(cert.emissao ?? null)}</div>
        </div>
        <div className="border border-card-border rounded-lg p-3">
          <div className="text-[10px] uppercase text-gray-500">Validade</div>
          <div className="font-medium">{formatDate(cert.validade ?? null)}</div>
        </div>
        {d.codigo_validacao && (
          <div className="col-span-2 border border-card-border rounded-lg p-3 bg-app-bg/40">
            <div className="text-[10px] uppercase text-gray-500">
              Código de validação
            </div>
            <div className="font-mono text-sm">{d.codigo_validacao}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Municipios({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    municipios?: Array<{
      nome: string;
      codigo_ibge: string;
      endpoint_nfse: string;
      configurado: boolean;
      ultima_consulta: string | null;
    }>;
  };
  const muns = d.municipios ?? [];
  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-900">
        Cada município tem sua própria API NFS-e. A maioria segue o padrão
        Abrasf, mas há variações (São Paulo, Rio, BH têm leiautes próprios).
      </div>
      <div className="space-y-2">
        {muns.map((m, i) => (
          <div
            key={i}
            className={`border rounded-xl p-4 ${
              m.configurado
                ? "bg-white border-card-border"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-gold" />
                  <div className="font-medium text-gray-800">{m.nome}</div>
                  {m.configurado ? (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-green-100 text-green-700">
                      Configurado
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-gray-200 text-gray-600">
                      Não configurado
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  IBGE {m.codigo_ibge} • endpoint:{" "}
                  <span className="font-mono">{m.endpoint_nfse}</span>
                </div>
              </div>
              {m.ultima_consulta && (
                <div className="text-[11px] text-gray-500">
                  Última consulta: {formatDate(m.ultima_consulta)}
                </div>
              )}
            </div>
          </div>
        ))}
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

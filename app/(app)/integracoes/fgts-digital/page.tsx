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
  History,
  Link2,
  Loader2,
  Play,
  Receipt,
  Shield,
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

type Aba = "guias" | "debitos" | "conciliacao" | "crf";

const ACAO_POR_ABA: Record<Aba, string> = {
  guias: "consultar_guias_fgts",
  debitos: "consultar_debitos",
  conciliacao: "conciliar_esocial",
  crf: "emitir_crf",
};

export default function FGTSPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("guias");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "FGTS_DIGITAL") ?? null,
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
        modulo: "FGTS_DIGITAL",
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
          modulo: "FGTS_DIGITAL",
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
        <PageHeader title="FGTS Digital / Caixa" />
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
        title="FGTS Digital / Caixa"
        subtitle="Guias, débitos, conciliação com eSocial e CRF"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/folha"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light"
            >
              Módulo Folha
            </Link>
            <Link
              href="/integracoes/logs?modulo=FGTS_DIGITAL"
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
          Selecione uma empresa pra consultar FGTS.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "guias"}
              onClick={() => {
                setAba("guias");
                setResposta(null);
              }}
              icon={Receipt}
            >
              Guias
            </TabBtn>
            <TabBtn
              ativo={aba === "debitos"}
              onClick={() => {
                setAba("debitos");
                setResposta(null);
              }}
              icon={AlertCircle}
            >
              Débitos
            </TabBtn>
            <TabBtn
              ativo={aba === "conciliacao"}
              onClick={() => {
                setAba("conciliacao");
                setResposta(null);
              }}
              icon={Link2}
            >
              Conciliação eSocial
            </TabBtn>
            <TabBtn
              ativo={aba === "crf"}
              onClick={() => {
                setAba("crf");
                setResposta(null);
              }}
              icon={Shield}
            >
              Emitir CRF
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

          {resposta?.ok && aba === "guias" && <Guias resposta={resposta} />}
          {resposta?.ok && aba === "debitos" && <Debitos resposta={resposta} />}
          {resposta?.ok && aba === "conciliacao" && (
            <Conciliacao resposta={resposta} />
          )}
          {resposta?.ok && aba === "crf" && <CRF resposta={resposta} />}

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

// ─── Componentes por aba ────────────────────────────────────

function Guias({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    guias?: Array<{
      competencia: string;
      valor: number;
      status: string;
      vencimento: string;
      data_pagamento: string | null;
      codigo_barras: string | null;
    }>;
  };
  const guias = d.guias ?? [];
  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Competência</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Vencimento</th>
            <th className="px-4 py-3">Pago em</th>
            <th className="px-4 py-3">Código de barras</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {guias.map((g, i) => {
            const cls =
              g.status === "PAGA"
                ? "bg-green-100 text-green-700"
                : g.status === "ABERTA"
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-alert";
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{g.competencia}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${cls}`}
                  >
                    {g.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                  {formatBRL(g.valor)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(g.vencimento)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {g.data_pagamento ? formatDate(g.data_pagamento) : "—"}
                </td>
                <td className="px-4 py-3 text-[10px] font-mono text-gray-500 max-w-xs truncate">
                  {g.codigo_barras ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Debitos({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    debitos?: Array<{
      tipo: string;
      competencia: string;
      valor_original: number;
      juros_multa: number;
      valor_atualizado: number;
      dias_atraso: number;
    }>;
    total_atualizado?: number;
  };
  const debitos = d.debitos ?? [];

  if (debitos.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Sem débitos FGTS em aberto
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-alert">
        <strong>{debitos.length} débito(s)</strong> totalizando{" "}
        <strong>{formatBRL(d.total_atualizado ?? 0)}</strong>.
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3 text-right">Original</th>
              <th className="px-4 py-3 text-right">Juros/Multa</th>
              <th className="px-4 py-3 text-right">Atualizado</th>
              <th className="px-4 py-3 text-center">Dias atraso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {debitos.map((deb, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{deb.tipo}</td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {deb.competencia}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                  {formatBRL(deb.valor_original)}
                </td>
                <td className="px-4 py-3 text-right text-red-alert whitespace-nowrap">
                  {formatBRL(deb.juros_multa)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                  {formatBRL(deb.valor_atualizado)}
                </td>
                <td className="px-4 py-3 text-center text-xs text-amber-800">
                  {deb.dias_atraso}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Conciliacao({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    itens?: Array<{
      competencia: string;
      valor_esocial: number;
      valor_fgts: number;
      diferenca: number;
      status: string;
    }>;
    divergentes?: number;
  };
  const itens = d.itens ?? [];
  return (
    <div>
      {(d.divergentes ?? 0) === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-900 flex items-center gap-2">
          <CheckCircle2 size={16} />
          <strong>Conciliação OK</strong> em todas as competências.
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-900 flex items-center gap-2">
          <AlertTriangle size={16} />
          <strong>{d.divergentes}</strong> competência(s) com divergência.
        </div>
      )}

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3 text-right">FGTS apurado (eSocial)</th>
              <th className="px-4 py-3 text-right">FGTS recolhido</th>
              <th className="px-4 py-3 text-right">Diferença</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {itens.map((it, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{it.competencia}</td>
                <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                  {formatBRL(it.valor_esocial)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                  {formatBRL(it.valor_fgts)}
                </td>
                <td
                  className={`px-4 py-3 text-right whitespace-nowrap font-medium ${
                    it.diferenca === 0
                      ? "text-gray-400"
                      : it.diferenca > 0
                      ? "text-red-alert"
                      : "text-amber-700"
                  }`}
                >
                  {it.diferenca === 0 ? "—" : formatBRL(it.diferenca)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                      it.status === "OK"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {it.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CRF({ resposta }: { resposta: RespostaIntegracao }) {
  const cert = resposta.certidoes?.[0];
  const d = resposta.dados as { codigo_validacao?: string | null };
  if (!cert) return null;
  const regular = cert.situacao === "REGULAR";

  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg ${
          regular
            ? "bg-green-50 border border-green-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {regular ? (
            <CheckCircle2 size={32} className="text-green-700" />
          ) : (
            <AlertTriangle size={32} className="text-red-alert" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              {regular
                ? "Certificado de Regularidade do FGTS emitido"
                : "CRF não emitido"}
            </div>
            <div className="text-xs text-gray-600">
              {regular
                ? "Empregador REGULAR perante o FGTS"
                : "Empregador IRREGULAR — regularize débitos antes"}
            </div>
          </div>
        </div>
      </div>

      {regular && (
        <div className="grid grid-cols-2 gap-3 mt-4">
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
      )}

      {resposta.mensagens?.map((m, i) => (
        <div key={i} className="mt-3 text-xs text-gray-600">
          {m}
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

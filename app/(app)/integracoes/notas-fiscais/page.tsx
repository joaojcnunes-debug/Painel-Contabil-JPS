"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  FileCode,
  History,
  Loader2,
  Play,
  ShieldCheck,
  Truck,
} from "lucide-react";

const DFeDistribuirModal = dynamic(
  () =>
    import("@/components/integracoes/DFeDistribuirModal").then((m) => ({
      default: m.DFeDistribuirModal,
    })),
  { ssr: false }
);
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

type Aba = "baixar" | "pendentes" | "historico" | "outros";

const ACAO_POR_ABA: Record<Aba, string> = {
  baixar: "baixar_xmls_sefaz",
  pendentes: "listar_pendentes_manifestacao",
  historico: "consultar_historico_manifestadas",
  outros: "consultar_outros_documentos",
};

const EVENTOS_MANIFESTACAO = [
  { codigo: "210210", nome: "Ciência da Operação", cls: "bg-blue-100 text-blue-700" },
  { codigo: "210200", nome: "Confirmação da Operação", cls: "bg-green-100 text-green-700" },
  { codigo: "210220", nome: "Desconhecimento", cls: "bg-red-100 text-red-alert" },
  { codigo: "210240", nome: "Operação não Realizada", cls: "bg-amber-100 text-amber-800" },
];

export default function NotasFiscaisPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("baixar");
  const [dfeRealOpen, setDfeRealOpen] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "NOTAS_FISCAIS") ?? null,
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
        modulo: "NOTAS_FISCAIS",
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
          modulo: "NOTAS_FISCAIS",
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

  // Manifestar NF individual (chamada extra além da action principal)
  const manifestar = useMutation({
    mutationFn: async ({
      chave,
      evento,
    }: {
      chave: string;
      evento: string;
    }) => {
      if (!idCliente) throw new Error("Selecione cliente");
      const supabase = createSupabaseBrowserClient();
      const resp = await executarIntegracao({
        supabase,
        modulo: "NOTAS_FISCAIS",
        acao: "manifestar_nfe",
        modo: (config?.modo ?? "SIMULADO") as ModoIntegracao,
        idConfig: config?.id_config ?? null,
        idCliente,
        cnpjCliente: clienteSel?.cnpj ?? null,
        usuario: { email: user?.email, nome: user?.nome },
        params: { chave, evento },
      });
      qc.invalidateQueries({ queryKey: ["integracoes-logs"] });
      return resp;
    },
    onSuccess: (resp) => {
      if (resp.ok) toast.success("Manifestação registrada");
      else toast.error(resp.erro?.mensagem ?? "Erro");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Notas Fiscais" />
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
        title="Notas Fiscais"
        subtitle="Baixa de XMLs da SEFAZ, manifestação do destinatário, NFC-e/CT-e/MDF-e"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!idCliente) {
                  toast.error("Selecione a empresa primeiro");
                  return;
                }
                setDfeRealOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 bg-verde-primary text-white rounded-lg text-xs font-medium hover:bg-verde-accent"
            >
              <ShieldCheck size={14} /> Baixar SEFAZ (REAL)
            </button>
            <Link
              href="/nfe"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light"
            >
              <FileCode size={14} /> Importar XML manual
            </Link>
            <Link
              href="/integracoes/logs?modulo=NOTAS_FISCAIS"
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
          Selecione uma empresa pra trabalhar com NFs.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "baixar"}
              onClick={() => {
                setAba("baixar");
                setResposta(null);
              }}
              icon={CloudDownload}
            >
              Baixar SEFAZ
            </TabBtn>
            <TabBtn
              ativo={aba === "pendentes"}
              onClick={() => {
                setAba("pendentes");
                setResposta(null);
              }}
              icon={AlertCircle}
            >
              Pendentes manifestação
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
              ativo={aba === "outros"}
              onClick={() => {
                setAba("outros");
                setResposta(null);
              }}
              icon={Truck}
            >
              NFC-e / CT-e / MDF-e
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

          {resposta?.ok && aba === "baixar" && (
            <BaixarXMLs resposta={resposta} />
          )}
          {resposta?.ok && aba === "pendentes" && (
            <Pendentes
              resposta={resposta}
              onManifestar={(chave, evento) =>
                manifestar.mutate({ chave, evento })
              }
              manifestando={manifestar.isPending}
            />
          )}
          {resposta?.ok && aba === "historico" && (
            <HistoricoManifestacoes resposta={resposta} />
          )}
          {resposta?.ok && aba === "outros" && (
            <OutrosDocumentos resposta={resposta} />
          )}

          {!resposta && !executando && (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Clique em &quot;Consultar agora&quot; pra buscar os dados.
            </div>
          )}
        </>
      )}

      <DFeDistribuirModal
        open={dfeRealOpen}
        onClose={() => setDfeRealOpen(false)}
        idCliente={idCliente}
        nomeCliente={clienteSel?.razao_social}
      />
    </div>
  );
}

function BaixarXMLs({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    xmls?: Array<{
      chave: string;
      emitente: string;
      cnpj_emitente: string;
      numero: string;
      serie: string;
      data_emissao: string;
      valor_total: number;
      natureza: string;
    }>;
    total_baixadas?: number;
  };
  const xmls = d.xmls ?? [];

  if (xmls.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhuma NF-e nova na SEFAZ
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-900 flex items-center gap-2">
        <CloudDownload size={16} />
        <strong>{xmls.length}</strong> XML(s) baixados. Já podem ser
        manifestados na aba &quot;Pendentes manifestação&quot;.
      </div>
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Emitente</th>
              <th className="px-4 py-3 w-28">Nº/Série</th>
              <th className="px-4 py-3 w-28">Emissão</th>
              <th className="px-4 py-3">Natureza</th>
              <th className="px-4 py-3 text-right w-28">Valor</th>
              <th className="px-4 py-3 w-44">Chave (8 últ.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {xmls.map((x, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{x.emitente}</div>
                  <div className="text-[11px] font-mono text-gray-500">
                    {formatCNPJ(x.cnpj_emitente)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                  {x.numero}/{x.serie}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(x.data_emissao)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  {x.natureza}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                  {formatBRL(x.valor_total)}
                </td>
                <td className="px-4 py-3 text-[10px] font-mono text-gray-500">
                  …{x.chave.slice(-8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Pendentes({
  resposta,
  onManifestar,
  manifestando,
}: {
  resposta: RespostaIntegracao;
  onManifestar: (chave: string, evento: string) => void;
  manifestando: boolean;
}) {
  const d = resposta.dados as {
    pendentes?: Array<{
      chave: string;
      emitente: string;
      numero: string;
      data_emissao: string;
      valor_total: number;
      dias_restantes: number;
    }>;
  };
  const pendentes = d.pendentes ?? [];

  if (pendentes.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Sem pendências de manifestação
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendentes.map((p, i) => {
        const urgente = p.dias_restantes < 30;
        return (
          <div
            key={i}
            className="bg-white border border-card-border rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-800">{p.emitente}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  NF {p.numero} • emitida em {formatDate(p.data_emissao)} •{" "}
                  <strong className="text-gray-700">
                    {formatBRL(p.valor_total)}
                  </strong>
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-1 truncate">
                  Chave: {p.chave}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-xs font-medium ${
                    urgente ? "text-red-alert" : "text-gray-600"
                  }`}
                >
                  {p.dias_restantes > 0
                    ? `${p.dias_restantes} dias restantes`
                    : "PRAZO EXPIRADO"}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-card-border flex flex-wrap gap-1.5">
              {EVENTOS_MANIFESTACAO.map((ev) => (
                <button
                  key={ev.codigo}
                  onClick={() => onManifestar(p.chave, ev.codigo)}
                  disabled={manifestando}
                  className={`text-xs px-2.5 py-1 rounded border border-transparent hover:border-current ${ev.cls} disabled:opacity-60`}
                  title={`Manifestar: ${ev.nome}`}
                >
                  {ev.nome}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoricoManifestacoes({
  resposta,
}: {
  resposta: RespostaIntegracao;
}) {
  const d = resposta.dados as {
    hist?: Array<{
      chave: string;
      emitente: string;
      numero: string;
      valor_total: number;
      evento_codigo: string;
      evento_nome: string;
      data_manifestacao: string;
      protocolo: string;
    }>;
  };
  const hist = d.hist ?? [];

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Emitente / NF</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Evento</th>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Protocolo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {hist.map((h, i) => {
            const ev = EVENTOS_MANIFESTACAO.find(
              (e) => e.codigo === h.evento_codigo
            );
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{h.emitente}</div>
                  <div className="text-[11px] text-gray-500">
                    NF {h.numero} • …{h.chave.slice(-8)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatBRL(h.valor_total)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                      ev?.cls ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {h.evento_nome}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(h.data_manifestacao)}
                </td>
                <td className="px-4 py-3 text-[10px] font-mono text-gray-500">
                  {h.protocolo}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OutrosDocumentos({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    nfce?: { emitidas: number; valor_total: number };
    cte?: { emitidos: number; valor_total: number };
    mdfe?: { emitidos: number; em_aberto: number };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <DocCard
        icone="NFC-e"
        titulo="NFC-e (Consumidor)"
        descricao="Notas ao consumidor final"
        kpis={[
          { label: "Emitidas", value: String(d.nfce?.emitidas ?? 0) },
          { label: "Total", value: formatBRL(d.nfce?.valor_total ?? 0) },
        ]}
      />
      <DocCard
        icone="CT-e"
        titulo="CT-e (Transporte)"
        descricao="Conhecimentos de transporte"
        kpis={[
          { label: "Emitidos", value: String(d.cte?.emitidos ?? 0) },
          { label: "Total", value: formatBRL(d.cte?.valor_total ?? 0) },
        ]}
      />
      <DocCard
        icone="MDF-e"
        titulo="MDF-e (Manifesto)"
        descricao="Manifestos eletrônicos"
        kpis={[
          { label: "Emitidos", value: String(d.mdfe?.emitidos ?? 0) },
          {
            label: "Em aberto",
            value: String(d.mdfe?.em_aberto ?? 0),
            tone: (d.mdfe?.em_aberto ?? 0) > 0 ? "alerta" : undefined,
          },
        ]}
      />
    </div>
  );
}

function DocCard({
  icone,
  titulo,
  descricao,
  kpis,
}: {
  icone: string;
  titulo: string;
  descricao: string;
  kpis: Array<{ label: string; value: string; tone?: "alerta" }>;
}) {
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded font-mono bg-teal-100 text-teal-700">
          {icone}
        </span>
        <Truck size={16} className="text-gold" />
      </div>
      <div className="font-medium text-gray-800">{titulo}</div>
      <div className="text-[11px] text-gray-500">{descricao}</div>
      <div className="mt-3 pt-3 border-t border-card-border space-y-1">
        {kpis.map((k, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-600">{k.label}</span>
            <span
              className={
                k.tone === "alerta"
                  ? "font-bold text-amber-700"
                  : "font-medium text-gray-800"
              }
            >
              {k.value}
            </span>
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

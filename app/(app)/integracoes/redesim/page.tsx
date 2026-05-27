"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  Loader2,
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
import { formatDate, gerarId } from "@/lib/utils";
import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "@/lib/integracoes/core/types";

type Aba = "protocolos" | "viabilidade" | "dbe";

const ACAO_POR_ABA: Record<Aba, string> = {
  protocolos: "consultar_protocolos",
  viabilidade: "consultar_viabilidade",
  dbe: "gerar_dbe",
};

export default function REDESIMPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("protocolos");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "REDESIM") ?? null,
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
        modulo: "REDESIM",
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
          modulo: "REDESIM",
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
        <PageHeader title="REDESIM" />
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
        title="REDESIM / Junta Comercial"
        subtitle="Protocolos, viabilidade, DBE — abertura/alteração/baixa"
        actions={
          <Link
            href="/integracoes/logs?modulo=REDESIM"
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
          Selecione uma empresa.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "protocolos"}
              onClick={() => {
                setAba("protocolos");
                setResposta(null);
              }}
              icon={ClipboardCheck}
            >
              Protocolos
            </TabBtn>
            <TabBtn
              ativo={aba === "viabilidade"}
              onClick={() => {
                setAba("viabilidade");
                setResposta(null);
              }}
              icon={CheckCircle2}
            >
              Viabilidade
            </TabBtn>
            <TabBtn
              ativo={aba === "dbe"}
              onClick={() => {
                setAba("dbe");
                setResposta(null);
              }}
              icon={FileText}
            >
              Gerar DBE
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
                  <Play size={14} />{" "}
                  {aba === "dbe" ? "Gerar agora" : "Consultar"}
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

          {resposta?.ok && aba === "protocolos" && (
            <Protocolos resposta={resposta} />
          )}
          {resposta?.ok && aba === "viabilidade" && (
            <Viabilidade resposta={resposta} />
          )}
          {resposta?.ok && aba === "dbe" && <DBE resposta={resposta} />}

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

function Protocolos({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    protocolos?: Array<{
      numero: string;
      tipo: string;
      orgao: string;
      data_protocolo: string;
      status: string;
      prazo_estimado: string;
      proxima_etapa: string;
    }>;
  };
  const protos = d.protocolos ?? [];

  if (protos.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhum protocolo em aberto
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {protos.map((p, i) => {
        const cls =
          p.status === "EM_ANALISE"
            ? "bg-blue-100 text-blue-700"
            : "bg-amber-100 text-amber-800";
        return (
          <div
            key={i}
            className="bg-white border border-card-border rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-700">
                    {p.numero}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${cls}`}
                  >
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                <div className="font-medium text-gray-800 mt-1">{p.tipo}</div>
                <div className="text-xs text-gray-500">{p.orgao}</div>
              </div>
              <div className="text-right text-xs">
                <div className="text-gray-500">Protocolado em</div>
                <div className="font-medium">
                  {formatDate(p.data_protocolo)}
                </div>
                <div className="text-amber-700 mt-1">
                  Prazo: {formatDate(p.prazo_estimado)}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-card-border text-sm">
              <strong className="text-gray-700">Próxima etapa:</strong>{" "}
              <span className="text-gray-600">{p.proxima_etapa}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Viabilidade({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    numero_pedido?: string;
    situacao?: string;
    atividades_consultadas?: Array<{ cnae: string; descricao: string }>;
    endereco_consultado?: string;
    zoneamento_ok?: boolean;
    observacoes?: string;
  };
  const aprovada = d.situacao === "APROVADA";

  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          aprovada
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {aprovada ? (
            <CheckCircle2 size={28} className="text-green-700" />
          ) : (
            <AlertCircle size={28} className="text-amber-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              Viabilidade {d.situacao}
            </div>
            <div className="text-xs text-gray-600 font-mono">
              {d.numero_pedido}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
            Endereço consultado
          </div>
          <div className="text-sm">{d.endereco_consultado}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-2">
            Atividades (CNAEs)
          </div>
          <div className="space-y-1">
            {d.atividades_consultadas?.map((a, i) => (
              <div
                key={i}
                className="text-sm border border-card-border rounded p-2 bg-app-bg/40"
              >
                <span className="font-mono text-xs text-gray-700 mr-2">
                  {a.cnae}
                </span>
                <span className="text-gray-600">{a.descricao}</span>
              </div>
            ))}
          </div>
        </div>

        {d.observacoes && (
          <div className="text-xs text-gray-600 border-t border-card-border pt-3">
            {d.observacoes}
          </div>
        )}
      </div>
    </div>
  );
}

function DBE({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    numero_dbe?: string;
    situacao?: string;
    data_emissao?: string;
    validade?: string;
    proximo_passo?: string;
  };
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200 mb-4">
        <Send size={28} className="text-green-700" />
        <div>
          <div className="font-serif text-lg font-bold text-verde-dark">
            DBE {d.situacao}
          </div>
          <div className="text-xs text-gray-600 font-mono">
            {d.numero_dbe}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-card-border rounded-lg p-3">
          <div className="text-[10px] uppercase text-gray-500">Emissão</div>
          <div className="font-medium">{formatDate(d.data_emissao ?? null)}</div>
        </div>
        <div className="border border-card-border rounded-lg p-3">
          <div className="text-[10px] uppercase text-gray-500">Validade</div>
          <div className="font-medium">{formatDate(d.validade ?? null)}</div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
        <strong>Próximo passo:</strong> {d.proximo_passo}
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

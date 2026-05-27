"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileCheck2,
  History,
  Loader2,
  Play,
  Receipt,
  ScrollText,
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

type Aba = "validar" | "ecd" | "ecf" | "efd_icms" | "efd_contrib";

const ACAO_POR_ABA: Record<Aba, string> = {
  validar: "validar_txt",
  ecd: "consultar_ecd",
  ecf: "consultar_ecf",
  efd_icms: "consultar_efd_icms",
  efd_contrib: "consultar_efd_contribuicoes",
};

export default function SPEDPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("validar");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "SPED") ?? null,
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
        modulo: "SPED",
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
          modulo: "SPED",
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
        <PageHeader title="SPED" />
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
        title="SPED"
        subtitle="ECD, ECF, EFD ICMS/IPI, EFD Contribuições"
        actions={
          <Link
            href="/integracoes/logs?modulo=SPED"
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
          Selecione uma empresa pra consultar SPED.
        </div>
      ) : (
        <>
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "validar"}
              onClick={() => {
                setAba("validar");
                setResposta(null);
              }}
              icon={FileCheck2}
            >
              Validar TXT
            </TabBtn>
            <TabBtn
              ativo={aba === "ecd"}
              onClick={() => {
                setAba("ecd");
                setResposta(null);
              }}
              icon={BookOpen}
            >
              ECD
            </TabBtn>
            <TabBtn
              ativo={aba === "ecf"}
              onClick={() => {
                setAba("ecf");
                setResposta(null);
              }}
              icon={ScrollText}
            >
              ECF
            </TabBtn>
            <TabBtn
              ativo={aba === "efd_icms"}
              onClick={() => {
                setAba("efd_icms");
                setResposta(null);
              }}
              icon={Receipt}
            >
              EFD ICMS/IPI
            </TabBtn>
            <TabBtn
              ativo={aba === "efd_contrib"}
              onClick={() => {
                setAba("efd_contrib");
                setResposta(null);
              }}
              icon={Receipt}
            >
              EFD Contribuições
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

          {resposta?.ok && aba === "validar" && (
            <ValidarTXT resposta={resposta} />
          )}
          {resposta?.ok && aba === "ecd" && (
            <ECD resposta={resposta} />
          )}
          {resposta?.ok && aba === "ecf" && (
            <ECF resposta={resposta} />
          )}
          {resposta?.ok && aba === "efd_icms" && (
            <EFD resposta={resposta} tipo="ICMS/IPI" />
          )}
          {resposta?.ok && aba === "efd_contrib" && (
            <EFD resposta={resposta} tipo="Contribuições" />
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

function ValidarTXT({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    registros?: number;
    blocos?: number;
    erros?: number;
    avisos?: number;
    problemas?: Array<{
      tipo: string;
      bloco: string;
      descricao: string;
      linha: number;
    }>;
  };
  const semErros = (d.erros ?? 0) === 0;

  return (
    <div>
      <div
        className={`rounded-xl p-4 mb-4 flex items-center gap-3 ${
          semErros
            ? "bg-green-50 border border-green-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        {semErros ? (
          <CheckCircle2 size={28} className="text-green-700" />
        ) : (
          <AlertTriangle size={28} className="text-red-alert" />
        )}
        <div>
          <div className="font-serif text-lg font-bold text-verde-dark">
            {semErros ? "Validação OK" : "Validação FALHOU"}
          </div>
          <div className="text-xs text-gray-600">
            {d.registros} registros • {d.blocos} blocos •{" "}
            <strong className={semErros ? "text-green-700" : "text-red-alert"}>
              {d.erros} erros
            </strong>{" "}
            • <strong className="text-amber-700">{d.avisos} avisos</strong>
          </div>
        </div>
      </div>

      {(d.problemas?.length ?? 0) > 0 && (
        <div className="bg-white border border-card-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-20">Tipo</th>
                <th className="px-4 py-3 w-20">Bloco</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 w-20 text-right">Linha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {d.problemas!.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                        p.tipo === "ERRO"
                          ? "bg-red-100 text-red-alert"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">
                    {p.bloco}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.descricao}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    L.{p.linha}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-gray-500 mt-3">
        Em modo real, suportaria upload de TXT pra validar contra o
        leiaute oficial do SPED (validador SEFAZ).
      </div>
    </div>
  );
}

function ECD({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    exercicio?: number;
    status?: string;
    prazo?: string;
    data_transmissao?: string | null;
    recibo?: string | null;
    livros?: string[];
    tamanho_kb?: number;
  };
  const transmitida = d.status === "TRANSMITIDA";
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          transmitida
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {transmitida ? (
            <CheckCircle2 size={28} className="text-green-700" />
          ) : (
            <AlertTriangle size={28} className="text-amber-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              ECD {d.exercicio} — {d.status}
            </div>
            <div className="text-xs text-gray-600">Prazo: {d.prazo}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {transmitida && (
          <>
            <Stat
              label="Transmitida em"
              value={formatDate(d.data_transmissao ?? null)}
            />
            <Stat
              label="Recibo"
              value={d.recibo ?? "—"}
              mono
            />
            <Stat label="Tamanho" value={`${d.tamanho_kb} KB`} />
          </>
        )}
      </div>

      {d.livros && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
            Livros incluídos
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.livros.map((l) => (
              <span
                key={l}
                className="text-xs px-2 py-1 rounded bg-app-bg text-gray-700 border border-card-border"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ECF({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    exercicio?: number;
    status?: string;
    prazo?: string;
    data_transmissao?: string | null;
    recibo?: string | null;
    lucro_real?: number;
    irpj_devido?: number;
    csll_devido?: number;
  };
  const transmitida = d.status === "TRANSMITIDA";
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg mb-4 ${
          transmitida
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {transmitida ? (
            <CheckCircle2 size={28} className="text-green-700" />
          ) : (
            <AlertTriangle size={28} className="text-amber-700" />
          )}
          <div>
            <div className="font-serif text-lg font-bold text-verde-dark">
              ECF {d.exercicio} — {d.status}
            </div>
            <div className="text-xs text-gray-600">Prazo: {d.prazo}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat
          label="Lucro real apurado"
          value={formatBRL(d.lucro_real ?? 0)}
          highlight
        />
        <Stat label="IRPJ devido" value={formatBRL(d.irpj_devido ?? 0)} />
        <Stat label="CSLL devido" value={formatBRL(d.csll_devido ?? 0)} />
        {transmitida && (
          <>
            <Stat
              label="Transmitida em"
              value={formatDate(d.data_transmissao ?? null)}
            />
            <Stat label="Recibo" value={d.recibo ?? "—"} mono />
          </>
        )}
      </div>
    </div>
  );
}

function EFD({
  resposta,
  tipo,
}: {
  resposta: RespostaIntegracao;
  tipo: string;
}) {
  const d = resposta.dados as {
    competencias?: Array<{
      competencia: string;
      status: string;
      data_transmissao: string | null;
      entradas?: number;
      saidas?: number;
      icms_devido?: number;
      receita_bruta?: number;
      pis_devido?: number;
      cofins_devido?: number;
    }>;
  };
  const comps = d.competencias ?? [];

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Competência</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Transmissão</th>
            {tipo === "ICMS/IPI" ? (
              <>
                <th className="px-4 py-3 text-right">Entradas</th>
                <th className="px-4 py-3 text-right">Saídas</th>
                <th className="px-4 py-3 text-right">ICMS devido</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-right">Receita bruta</th>
                <th className="px-4 py-3 text-right">PIS</th>
                <th className="px-4 py-3 text-right">COFINS</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {comps.map((c, i) => {
            const transmitida = c.status === "TRANSMITIDA";
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.competencia}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                      transmitida
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {c.data_transmissao ? formatDate(c.data_transmissao) : "—"}
                </td>
                {tipo === "ICMS/IPI" ? (
                  <>
                    <td className="px-4 py-3 text-right text-xs text-gray-700">
                      {c.entradas}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-700">
                      {c.saidas}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      {formatBRL(c.icms_devido ?? 0)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                      {formatBRL(c.receita_bruta ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                      {formatBRL(c.pis_devido ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                      {formatBRL(c.cofins_devido ?? 0)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
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
        className={`${mono ? "font-mono text-xs" : "text-base font-semibold"} ${
          highlight ? "text-verde-dark" : "text-gray-800"
        } mt-0.5`}
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

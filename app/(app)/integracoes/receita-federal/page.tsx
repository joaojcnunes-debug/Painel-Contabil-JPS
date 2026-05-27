"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  History,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  Play,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { BadgeModo } from "@/components/integracoes/BadgeStatus";
import { useClientes } from "@/lib/hooks/useClientes";
import { useIntegracoes } from "@/lib/hooks/useIntegracoes";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { executarIntegracao } from "@/lib/integracoes/core/client";
import { gerarId, formatBRL, formatDate } from "@/lib/utils";
import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";
import type { RespostaIntegracao } from "@/lib/integracoes/core/types";

type Aba =
  | "cnpj"
  | "situacao"
  | "pendencias"
  | "dctfweb"
  | "caixa_postal"
  | "certidao";

const ACAO_POR_ABA: Record<Aba, string> = {
  cnpj: "consultar_cnpj_brasilapi",
  situacao: "consultar_situacao_fiscal",
  pendencias: "consultar_pendencias",
  dctfweb: "consultar_dctfweb",
  caixa_postal: "consultar_caixa_postal",
  certidao: "emitir_certidao",
};

export default function ReceitaFederalPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [aba, setAba] = useState<Aba>("situacao");
  const [executando, setExecutando] = useState(false);
  const [resposta, setResposta] = useState<RespostaIntegracao | null>(null);

  const { data: configs = [] } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const config = useMemo(
    () => configs.find((c) => c.modulo === "RECEITA_FEDERAL") ?? null,
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
        modulo: "RECEITA_FEDERAL",
        acao,
        modo: (config?.modo ?? "SIMULADO") as ModoIntegracao,
        idConfig: config?.id_config ?? null,
        idCliente,
        cnpjCliente: clienteSel?.cnpj ?? null,
        usuario: { email: user?.email, nome: user?.nome },
      });
      setResposta(resp);

      // Atualiza config com último resultado (mesmo padrão do painel)
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
          modulo: "RECEITA_FEDERAL",
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

      if (!resp.ok) toast.error(resp.erro?.mensagem ?? "Erro na consulta");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExecutando(false);
    }
  }

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Receita Federal / e-CAC" />
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
        title="Receita Federal / e-CAC"
        subtitle="Situação fiscal, DCTFWeb, caixa postal, certidões"
        actions={
          <Link
            href={`/integracoes/logs?modulo=RECEITA_FEDERAL`}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <History size={14} /> Logs
          </Link>
        }
      />

      {/* Empresa */}
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
          Selecione uma empresa pra consultar e-CAC.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 overflow-x-auto">
            <TabBtn
              ativo={aba === "cnpj"}
              onClick={() => {
                setAba("cnpj");
                setResposta(null);
              }}
              icon={Building2}
              badge="REAL"
            >
              Cadastro CNPJ
            </TabBtn>
            <TabBtn
              ativo={aba === "situacao"}
              onClick={() => {
                setAba("situacao");
                setResposta(null);
              }}
              icon={ShieldCheck}
            >
              Situação fiscal
            </TabBtn>
            <TabBtn
              ativo={aba === "pendencias"}
              onClick={() => {
                setAba("pendencias");
                setResposta(null);
              }}
              icon={AlertCircle}
            >
              Pendências
            </TabBtn>
            <TabBtn
              ativo={aba === "dctfweb"}
              onClick={() => {
                setAba("dctfweb");
                setResposta(null);
              }}
              icon={FileText}
            >
              DCTFWeb
            </TabBtn>
            <TabBtn
              ativo={aba === "caixa_postal"}
              onClick={() => {
                setAba("caixa_postal");
                setResposta(null);
              }}
              icon={Inbox}
            >
              Caixa postal
            </TabBtn>
            <TabBtn
              ativo={aba === "certidao"}
              onClick={() => {
                setAba("certidao");
                setResposta(null);
              }}
              icon={CheckCircle2}
            >
              Emitir CND
            </TabBtn>
          </div>

          {/* Botão executar */}
          <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              <strong>Ação:</strong>{" "}
              <span className="font-mono text-xs text-gray-600">
                {ACAO_POR_ABA[aba]}
              </span>
            </div>
            <button
              onClick={executar}
              disabled={executando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-verde-primary text-white text-sm font-medium rounded-lg hover:bg-verde-accent disabled:opacity-60"
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
            </button>
          </div>

          {/* Renderização por aba */}
          {resposta && !resposta.ok && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-alert flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>{resposta.erro?.codigo}</strong>
                <div className="text-xs mt-0.5">{resposta.erro?.mensagem}</div>
              </div>
            </div>
          )}

          {resposta?.ok && aba === "cnpj" && (
            <CadastroCNPJ resposta={resposta} />
          )}
          {resposta?.ok && aba === "situacao" && (
            <SituacaoFiscal resposta={resposta} />
          )}
          {resposta?.ok && aba === "pendencias" && (
            <Pendencias resposta={resposta} />
          )}
          {resposta?.ok && aba === "dctfweb" && (
            <DCTFWeb resposta={resposta} />
          )}
          {resposta?.ok && aba === "caixa_postal" && (
            <CaixaPostal resposta={resposta} />
          )}
          {resposta?.ok && aba === "certidao" && (
            <EmitirCertidao resposta={resposta} />
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

type CnpjDados = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string | null;
  natureza_juridica?: string;
  porte?: string;
  situacao_cadastral?: string;
  data_situacao?: string;
  data_inicio_atividade?: string;
  optante_simples?: boolean | null;
  data_opcao_simples?: string | null;
  optante_mei?: boolean | null;
  data_opcao_mei?: string | null;
  cnae_principal?: { codigo: number; descricao: string };
  cnaes_secundarios?: Array<{ codigo: number; descricao: string }>;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string;
    uf?: string;
    cep?: string | null;
  };
  telefone?: string | null;
  email?: string | null;
  capital_social?: number;
  qsa?: Array<{
    nome_socio: string;
    qualificacao_socio: string;
    data_entrada_sociedade: string;
  }>;
  matriz_filial?: string;
  info?: string;
};

function CadastroCNPJ({ resposta }: { resposta: RespostaIntegracao }) {
  const d = (resposta.dados ?? {}) as CnpjDados;
  const simulado = resposta.modo === "SIMULADO";

  // Modo SIMULADO: orientar a trocar pra REAL
  if (simulado || !d.razao_social) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <div className="font-medium mb-1">Modo simulado ativo</div>
            <div className="text-xs mb-3">
              {d.info ??
                "Esta consulta tem implementação REAL gratuita disponível via BrasilAPI."}
            </div>
            <div className="text-xs">
              Para consultar dados verdadeiros da Receita Federal, troque
              o modo deste módulo de <strong>SIMULADO</strong> para{" "}
              <strong>REAL</strong> no painel{" "}
              <Link
                href="/integracoes"
                className="text-verde-primary underline"
              >
                /integracoes
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card identificação + situação */}
      <div className="bg-white border border-card-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold mb-1">
              Receita Federal · BrasilAPI
            </div>
            <h3 className="font-serif text-xl font-bold text-verde-dark">
              {d.razao_social}
            </h3>
            {d.nome_fantasia && (
              <div className="text-sm text-gray-600 mt-0.5">
                Fantasia: {d.nome_fantasia}
              </div>
            )}
            <div className="text-xs font-mono text-gray-500 mt-1">
              CNPJ {d.cnpj}
            </div>
          </div>
          <SituacaoBadge situacao={d.situacao_cadastral ?? ""} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <CnpjStat label="Natureza jurídica" value={d.natureza_juridica ?? "—"} />
          <CnpjStat label="Porte" value={d.porte ?? "—"} />
          <CnpjStat label="Matriz/Filial" value={d.matriz_filial ?? "—"} />
          <CnpjStat
            label="Início atividade"
            value={formatDate(d.data_inicio_atividade ?? null)}
          />
        </div>
      </div>

      {/* Regime tributário */}
      <div className="bg-white border border-card-border rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
          Regime tributário (registrado na Receita)
        </div>
        <div className="flex flex-wrap gap-2">
          {d.optante_simples ? (
            <div className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              ✓ Optante pelo Simples Nacional desde{" "}
              {formatDate(d.data_opcao_simples ?? null)}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs">
              Não optante pelo Simples
            </div>
          )}
          {d.optante_mei && (
            <div className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              ✓ MEI desde {formatDate(d.data_opcao_mei ?? null)}
            </div>
          )}
        </div>
      </div>

      {/* CNAE principal + secundários */}
      {d.cnae_principal && (
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
            Atividade econômica
          </div>
          <div className="border border-card-border rounded p-3 bg-app-bg/40 mb-2">
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-mono bg-verde-primary text-white px-1.5 py-0.5 rounded">
                Principal
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-gray-700">
                  {d.cnae_principal.codigo}
                </div>
                <div className="text-sm text-gray-800">
                  {d.cnae_principal.descricao}
                </div>
              </div>
            </div>
          </div>
          {d.cnaes_secundarios && d.cnaes_secundarios.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-gray-500">
                {d.cnaes_secundarios.length} CNAE(s) secundário(s)
              </div>
              {d.cnaes_secundarios.slice(0, 8).map((c) => (
                <div
                  key={c.codigo}
                  className="text-[11px] text-gray-600 flex gap-2"
                >
                  <span className="font-mono text-gray-500 w-20 flex-shrink-0">
                    {c.codigo}
                  </span>
                  <span className="flex-1">{c.descricao}</span>
                </div>
              ))}
              {d.cnaes_secundarios.length > 8 && (
                <div className="text-[10px] text-gray-400 italic pt-1">
                  +{d.cnaes_secundarios.length - 8} outros
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Endereço + contato + capital */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {d.endereco && (
          <div className="bg-white border border-card-border rounded-xl p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-gold" />
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Endereço
              </div>
            </div>
            <div className="text-sm text-gray-800">
              {d.endereco.logradouro ?? "—"}
              {d.endereco.numero ? `, ${d.endereco.numero}` : ""}
              {d.endereco.complemento ? ` — ${d.endereco.complemento}` : ""}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {d.endereco.bairro && `${d.endereco.bairro} · `}
              {d.endereco.municipio} / {d.endereco.uf}
              {d.endereco.cep && ` · CEP ${d.endereco.cep}`}
            </div>
            {(d.telefone || d.email) && (
              <div className="text-[11px] text-gray-500 mt-2 border-t border-card-border pt-2">
                {d.telefone && <div>Tel: {d.telefone}</div>}
                {d.email && <div>Email: {d.email}</div>}
              </div>
            )}
          </div>
        )}
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
            Capital social
          </div>
          <div className="text-xl font-bold text-verde-dark">
            {formatBRLValue(d.capital_social ?? 0)}
          </div>
          <div className="text-[10px] text-gray-500 mt-2 border-t border-card-border pt-2">
            Última atualização: {formatDate(d.data_situacao ?? null)}
          </div>
        </div>
      </div>

      {/* QSA — sócios */}
      {d.qsa && d.qsa.length > 0 && (
        <div className="bg-white border border-card-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-card-border bg-gray-50 flex items-center gap-2">
            <Users2 size={14} className="text-gold" />
            <h3 className="font-serif text-sm font-semibold text-verde-dark">
              QSA — Quadro de Sócios ({d.qsa.length})
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-gray-600 text-left text-xs uppercase border-b border-card-border">
              <tr>
                <th className="px-4 py-2">Nome do sócio</th>
                <th className="px-4 py-2">Qualificação</th>
                <th className="px-4 py-2">Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {d.qsa.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {s.nome_socio}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {s.qualificacao_socio}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(s.data_entrada_sociedade)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resposta.mensagens && resposta.mensagens.length > 0 && (
        <div className="text-[11px] text-gray-500 space-y-0.5">
          {resposta.mensagens.map((m, i) => (
            <div key={i}>• {m}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SituacaoBadge({ situacao }: { situacao: string }) {
  const s = situacao.toUpperCase();
  const ativa = s === "ATIVA";
  return (
    <div
      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${
        ativa
          ? "bg-green-100 text-green-800 border border-green-300"
          : "bg-red-100 text-red-alert border border-red-300"
      }`}
    >
      {ativa ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {situacao}
    </div>
  );
}

function CnpjStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-card-border rounded-lg p-2 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-sm text-gray-800 mt-0.5 truncate">{value}</div>
    </div>
  );
}

function formatBRLValue(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function SituacaoFiscal({ resposta }: { resposta: RespostaIntegracao }) {
  const d = (resposta.dados ?? {}) as {
    situacao_fiscal?: string;
    cnpj_situacao?: string;
    motivos_pendencia?: string[];
  };
  const regular = d.situacao_fiscal === "REGULAR";
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`flex items-center gap-3 p-4 rounded-lg ${
          regular ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
        }`}
      >
        {regular ? (
          <CheckCircle2 size={32} className="text-green-700" />
        ) : (
          <AlertTriangle size={32} className="text-amber-700" />
        )}
        <div>
          <div className="font-serif text-lg font-bold text-verde-dark">
            {regular ? "Situação fiscal REGULAR" : "Situação fiscal PENDENTE"}
          </div>
          <div className="text-xs text-gray-600">
            CNPJ {d.cnpj_situacao ?? "—"}
          </div>
        </div>
      </div>

      {(resposta.pendencias?.length ?? 0) > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-gray-500 mb-2">
            Motivos de pendência
          </div>
          <ul className="space-y-1">
            {resposta.pendencias!.map((p, i) => (
              <li
                key={i}
                className="text-sm text-gray-700 flex items-start gap-2"
              >
                <span className="text-amber-700">•</span> {p.tipo}
                {p.descricao && (
                  <span className="text-gray-500"> — {p.descricao}</span>
                )}
              </li>
            ))}
          </ul>
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

function Pendencias({ resposta }: { resposta: RespostaIntegracao }) {
  if (!resposta.pendencias || resposta.pendencias.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-700 mb-2" />
        <div className="font-medium text-green-900">
          Nenhuma pendência encontrada
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3">Competência</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Vencimento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {resposta.pendencias.map((p, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-amber-800">{p.tipo}</td>
              <td className="px-4 py-3 text-gray-700">{p.descricao ?? "—"}</td>
              <td className="px-4 py-3 text-xs text-gray-600">
                {p.competencia ?? "—"}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {p.valor != null ? formatBRL(p.valor) : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                {p.vencimento ? formatDate(p.vencimento) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DCTFWeb({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as { declaracoes?: Array<Record<string, unknown>> };
  const decls = d.declaracoes ?? [];
  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Competência</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Transmissão</th>
            <th className="px-4 py-3">Recibo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {decls.map((decl, i) => {
            const r = decl as {
              competencia: string;
              status: string;
              valor: number;
              data_transmissao: string | null;
              recibo: string | null;
            };
            const statusCls =
              r.status === "TRANSMITIDA"
                ? "bg-green-100 text-green-700"
                : r.status === "EM_EDICAO"
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-alert";
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.competencia}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${statusCls}`}
                  >
                    {r.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatBRL(Number(r.valor))}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {r.data_transmissao ? formatDate(r.data_transmissao) : "—"}
                </td>
                <td className="px-4 py-3 text-[11px] font-mono text-gray-500">
                  {r.recibo ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CaixaPostal({ resposta }: { resposta: RespostaIntegracao }) {
  const d = resposta.dados as {
    mensagens?: Array<{
      data: string;
      assunto: string;
      remetente: string;
      lida: boolean;
    }>;
    nao_lidas?: number;
  };
  const msgs = d.mensagens ?? [];
  return (
    <div>
      {(d.nao_lidas ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-900 flex items-center gap-2">
          <Mail size={16} />
          <div>
            <strong>{d.nao_lidas}</strong> mensagem(ns) não lida(s) na caixa
            postal e-CAC.
          </div>
        </div>
      )}
      <div className="bg-white border border-card-border rounded-xl divide-y divide-card-border">
        {msgs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Sem mensagens.
          </div>
        ) : (
          msgs.map((m, i) => (
            <div
              key={i}
              className={`p-4 flex items-start gap-3 ${
                !m.lida ? "bg-amber-50/40" : ""
              }`}
            >
              <Mail
                size={18}
                className={m.lida ? "text-gray-400" : "text-amber-700"}
              />
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm ${
                    !m.lida ? "font-semibold text-gray-900" : "text-gray-700"
                  }`}
                >
                  {m.assunto}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {m.remetente} • {formatDate(m.data)}
                </div>
              </div>
              {!m.lida && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  Nova
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmitirCertidao({ resposta }: { resposta: RespostaIntegracao }) {
  const cert = resposta.certidoes?.[0];
  if (!cert) {
    return (
      <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
        Nenhuma certidão retornada.
      </div>
    );
  }
  const d = resposta.dados as { codigo_controle?: string };
  const negativa =
    cert.situacao === "REGULAR" || cert.situacao === "NEGATIVA";
  return (
    <div className="bg-white border border-card-border rounded-xl p-6">
      <div
        className={`p-4 rounded-lg ${
          negativa
            ? "bg-green-50 border border-green-200"
            : "bg-amber-50 border border-amber-200"
        }`}
      >
        <div className="text-[10px] uppercase tracking-[0.2em] text-gold mb-1">
          Certidão emitida
        </div>
        <div className="font-serif text-xl font-bold text-verde-dark">
          {cert.tipo} —{" "}
          {cert.situacao === "REGULAR"
            ? "NEGATIVA de Débitos"
            : cert.situacao === "POSITIVA_COM_EFEITOS"
            ? "POSITIVA COM EFEITOS DE NEGATIVA"
            : cert.situacao}
        </div>
        {d.codigo_controle && (
          <div className="text-xs font-mono text-gray-600 mt-2">
            Código de controle: {d.codigo_controle}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-gray-700">
          <div>
            <strong>Emissão:</strong> {formatDate(cert.emissao ?? null)}
          </div>
          <div>
            <strong>Validade:</strong> {formatDate(cert.validade ?? null)}
          </div>
        </div>
      </div>
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
  badge,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ElementType;
  badge?: string;
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
      {badge && (
        <span
          className={
            ativo
              ? "ml-1 px-1 py-0.5 rounded text-[9px] tracking-wider bg-white/20 text-white"
              : "ml-1 px-1 py-0.5 rounded text-[9px] tracking-wider bg-verde-dark text-white"
          }
        >
          {badge}
        </span>
      )}
    </button>
  );
}

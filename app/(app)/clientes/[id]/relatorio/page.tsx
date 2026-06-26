import { notFound } from "next/navigation";
import {
  CalendarCheck,
  FileText,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getServerSupabase, getConfiguracoes } from "@/lib/supabase/server-cache";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  Configuracao,
} from "@/lib/supabase/types";
import { RelatorioActions } from "./RelatorioActions";

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rangeDoMes(comp: string) {
  const [y, m] = comp.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const ini = `${comp}-01`;
  const fim = `${comp}-${String(ultimo).padStart(2, "0")}`;
  const mesNome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return { ini, fim, mesNome };
}

type ObrigRow = {
  id_obrigacao: string;
  competencia: string;
  data_vencimento: string;
  data_entrega: string | null;
  status: string;
  obrigacoes_catalogo: { sigla: string; nome: string } | null;
};

type FaturaRow = {
  id_fatura: string;
  competencia: string;
  data_vencimento: string;
  data_pagamento: string | null;
  valor: number;
  status: string;
  descricao: string | null;
};

type DocRow = {
  id_documento: string;
  tipo: string;
  arquivo_nome: string;
  origem: string;
  created_at: string;
};

type LancRow = {
  id_lancamento: string;
  data_lancamento: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  descricao: string;
  plano_contas: { codigo: string; nome: string; grupo: string | null } | null;
};

export default async function RelatorioClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comp?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const competencia = sp.comp || competenciaAtual();
  const { ini, fim, mesNome } = rangeDoMes(competencia);

  const supabase = await getServerSupabase();

  const [{ data: clienteData }, cfgData] = await Promise.all([
    supabase.from("clientes").select("*").eq("id_cliente", id).single(),
    getConfiguracoes(),
  ]);
  if (!clienteData) notFound();
  const cliente = clienteData as Cliente;
  const cfg = cfgData as Configuracao | null;

  const [
    { data: obrigData },
    { data: fatData },
    { data: docData },
    { data: lancData },
  ] = await Promise.all([
    supabase
      .from("obrigacoes")
      .select(
        "id_obrigacao, competencia, data_vencimento, data_entrega, status, obrigacoes_catalogo(sigla, nome)"
      )
      .eq("id_cliente", id)
      .eq("competencia", competencia)
      .order("data_vencimento"),
    supabase
      .from("faturas")
      .select(
        "id_fatura, competencia, data_vencimento, data_pagamento, valor, status, descricao"
      )
      .eq("id_cliente", id)
      .eq("competencia", competencia)
      .order("data_vencimento"),
    supabase
      .from("documentos")
      .select("id_documento, tipo, arquivo_nome, origem, created_at")
      .eq("id_cliente", id)
      .gte("created_at", `${ini}T00:00:00`)
      .lte("created_at", `${fim}T23:59:59`)
      .order("created_at"),
    supabase
      .from("lancamentos")
      .select(
        "id_lancamento, data_lancamento, tipo, valor, descricao, plano_contas(codigo, nome, grupo)"
      )
      .eq("id_cliente", id)
      .gte("data_lancamento", ini)
      .lte("data_lancamento", fim)
      .order("data_lancamento"),
  ]);

  const obrigacoes = (obrigData ?? []) as unknown as ObrigRow[];
  const faturas = (fatData ?? []) as unknown as FaturaRow[];
  const documentos = (docData ?? []) as unknown as DocRow[];
  const lancamentos = (lancData ?? []) as unknown as LancRow[];

  // ─── Stats ─────────────────────────────────────────────────
  const obrigStats = obrigacoes.reduce(
    (acc, o) => {
      if (o.status === "ENTREGUE") acc.entregues++;
      else if (o.status === "ATRASADA") acc.atrasadas++;
      else acc.pendentes++;
      return acc;
    },
    { entregues: 0, pendentes: 0, atrasadas: 0 }
  );

  const fatPaga = faturas
    .filter((f) => f.status === "PAGA")
    .reduce((s, f) => s + Number(f.valor), 0);
  const fatAberta = faturas
    .filter((f) => f.status === "ABERTA" || f.status === "ATRASADA")
    .reduce((s, f) => s + Number(f.valor), 0);

  const lancStats = lancamentos.reduce(
    (acc, l) => {
      const v = Number(l.valor);
      if (l.tipo === "RECEITA") acc.receitas += v;
      else acc.despesas += v;
      return acc;
    },
    { receitas: 0, despesas: 0 }
  );
  const lancSaldo = lancStats.receitas - lancStats.despesas;

  // Lançamentos agrupados por grupo do plano (mini-DRE)
  type GrupoAgg = { grupo: string; total: number; tipo: "RECEITA" | "DESPESA" };
  const grupos = new Map<string, GrupoAgg>();
  for (const l of lancamentos) {
    const g = l.plano_contas?.grupo ?? "Sem grupo";
    const key = `${l.tipo}::${g}`;
    if (!grupos.has(key)) {
      grupos.set(key, { grupo: g, total: 0, tipo: l.tipo });
    }
    grupos.get(key)!.total += Number(l.valor);
  }
  const gruposReceita = Array.from(grupos.values())
    .filter((g) => g.tipo === "RECEITA")
    .sort((a, b) => b.total - a.total);
  const gruposDespesa = Array.from(grupos.values())
    .filter((g) => g.tipo === "DESPESA")
    .sort((a, b) => b.total - a.total);

  const docsCliente = documentos.filter((d) => d.origem === "CLIENTE").length;

  return (
    <div className="min-h-screen bg-app-bg py-6 print:bg-white print:py-0">
      <RelatorioActions idCliente={id} competencia={competencia} />

      <div className="max-w-4xl mx-auto bg-white p-8 print:p-0 print:max-w-none print:shadow-none border border-card-border print:border-0 rounded-xl print:rounded-none">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-verde-dark mb-6">
          <div className="flex items-center gap-4">
            {cfg?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cfg.logo_url}
                alt=""
                className="w-16 h-16 object-contain"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-verde-dark text-gold flex items-center justify-center font-serif font-bold text-2xl">
                JSP
              </div>
            )}
            <div>
              <h1 className="font-serif text-xl font-bold text-verde-dark">
                {cfg?.nome_escritorio ?? "JSP Contabilidade Personalizada"}
              </h1>
              {cfg?.cnpj && (
                <div className="text-xs text-gray-500 font-mono">
                  CNPJ {formatCNPJ(cfg.cnpj)}
                </div>
              )}
              {cfg?.telefone && (
                <div className="text-xs text-gray-500">{cfg.telefone}</div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Relatório mensal
            </div>
            <div className="font-serif text-lg font-bold text-verde-dark capitalize mt-1">
              {mesNome}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Emitido {new Date().toLocaleDateString("pt-BR")}
            </div>
          </div>
        </div>

        {/* Identificação do cliente */}
        <div className="bg-verde-light/40 border border-verde-border rounded-lg p-4 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-gold mb-1">
            Cliente
          </div>
          <h2 className="font-serif text-2xl font-bold text-verde-dark">
            {cliente.razao_social}
          </h2>
          {cliente.nome_fantasia && (
            <div className="text-sm text-gray-600">{cliente.nome_fantasia}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            {cliente.cnpj && (
              <span>CNPJ: <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span></span>
            )}
            {cliente.cpf && !cliente.cnpj && (
              <span>CPF: <span className="font-mono">{formatCPF(cliente.cpf)}</span></span>
            )}
            <span>Regime: {cliente.regime.replace("_", " ")}</span>
            {cliente.atividade_principal && (
              <span>Atividade: {cliente.atividade_principal}</span>
            )}
          </div>
        </div>

        {/* Cards principais */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MiniCard
            icon={CalendarCheck}
            label="Obrigações entregues"
            value={`${obrigStats.entregues}/${obrigacoes.length}`}
            sub={
              obrigStats.atrasadas > 0
                ? `${obrigStats.atrasadas} atrasada${obrigStats.atrasadas === 1 ? "" : "s"}`
                : undefined
            }
            tone={obrigStats.atrasadas > 0 ? "red" : "verde"}
          />
          <MiniCard
            icon={Receipt}
            label="Honorários pagos"
            value={formatBRL(fatPaga)}
            sub={fatAberta > 0 ? `${formatBRL(fatAberta)} em aberto` : undefined}
            tone="verde"
          />
          <MiniCard
            icon={FileText}
            label="Documentos enviados"
            value={String(documentos.length)}
            sub={docsCliente > 0 ? `${docsCliente} pelo portal` : undefined}
            tone="verde"
          />
          <MiniCard
            icon={lancSaldo >= 0 ? TrendingUp : TrendingDown}
            label="Resultado contábil"
            value={formatBRL(lancSaldo)}
            tone={lancSaldo >= 0 ? "verde" : "red"}
          />
        </div>

        {/* Obrigações */}
        <Section title="Obrigações fiscais">
          {obrigacoes.length === 0 ? (
            <Empty>Nenhuma obrigação na competência</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Obrigação</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Entrega</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {obrigacoes.map((o) => (
                  <tr key={o.id_obrigacao}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-verde-dark mr-2">
                        {o.obrigacoes_catalogo?.sigla ?? "—"}
                      </span>
                      {o.obrigacoes_catalogo?.nome ?? ""}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {formatDate(o.data_vencimento)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {formatDate(o.data_entrega) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Faturas */}
        <Section title="Honorários contábeis">
          {faturas.length === 0 ? (
            <Empty>Nenhuma fatura na competência</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Pagamento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {faturas.map((f) => (
                  <tr key={f.id_fatura}>
                    <td className="px-3 py-2">
                      {f.descricao ?? `Honorários ${f.competencia}`}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {formatDate(f.data_vencimento)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {formatDate(f.data_pagamento) || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatBRL(Number(f.valor))}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Mini-DRE dos lançamentos */}
        <Section title="Resumo contábil do mês">
          {lancamentos.length === 0 ? (
            <Empty>Nenhum lançamento na competência</Empty>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-verde-dark font-semibold mb-2">
                  ( + ) Receitas — {formatBRL(lancStats.receitas)}
                </div>
                <div className="space-y-1 text-xs">
                  {gruposReceita.length === 0 ? (
                    <div className="text-gray-400">Sem receitas no período</div>
                  ) : (
                    gruposReceita.map((g) => (
                      <div
                        key={g.grupo}
                        className="flex justify-between py-1 border-b border-card-border/50"
                      >
                        <span className="text-gray-700">{g.grupo}</span>
                        <span className="text-verde-dark font-medium">
                          {formatBRL(g.total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-red-alert font-semibold mb-2">
                  ( − ) Despesas — {formatBRL(lancStats.despesas)}
                </div>
                <div className="space-y-1 text-xs">
                  {gruposDespesa.length === 0 ? (
                    <div className="text-gray-400">Sem despesas no período</div>
                  ) : (
                    gruposDespesa.map((g) => (
                      <div
                        key={g.grupo}
                        className="flex justify-between py-1 border-b border-card-border/50"
                      >
                        <span className="text-gray-700">{g.grupo}</span>
                        <span className="text-red-alert font-medium">
                          {formatBRL(g.total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          {lancamentos.length > 0 && (
            <div
              className={`mt-4 pt-3 border-t-2 ${lancSaldo >= 0 ? "border-verde-dark" : "border-red-alert"} flex items-center justify-between`}
            >
              <span className="font-serif font-bold text-sm uppercase tracking-wider text-verde-dark">
                ( = ) Resultado do período
              </span>
              <span
                className={`font-serif text-xl font-bold ${lancSaldo >= 0 ? "text-verde-dark" : "text-red-alert"}`}
              >
                {formatBRL(lancSaldo)}
              </span>
            </div>
          )}
        </Section>

        {/* Documentos */}
        {documentos.length > 0 && (
          <Section title="Documentos recebidos no período">
            <ul className="space-y-1.5 text-xs">
              {documentos.map((d) => (
                <li
                  key={d.id_documento}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-gray-700">
                    <span className="text-gray-400 mr-2">
                      {formatDate(d.created_at)}
                    </span>
                    <strong>{d.tipo}</strong> — {d.arquivo_nome}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {d.origem === "CLIENTE" ? "do cliente" : "internalizado"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Rodapé */}
        <div className="mt-10 pt-6 border-t border-card-border text-[10px] text-gray-400 text-center">
          Relatório gerado por {cfg?.nome_escritorio ?? "JSP Contabilidade"}
          {cfg?.email && <> • {cfg.email}</>}
          {cfg?.telefone && <> • {cfg.telefone}</>}
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone: "verde" | "red";
}) {
  return (
    <div className="border border-card-border rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 leading-tight">
          {label}
        </div>
        <Icon size={14} className="text-gold flex-shrink-0" />
      </div>
      <div
        className={`mt-1 text-lg font-bold font-serif ${tone === "red" ? "text-red-alert" : "text-verde-dark"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 print:break-inside-avoid">
      <h3 className="font-serif text-sm font-semibold text-verde-dark uppercase tracking-wider border-b border-card-border pb-1 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-gray-400 italic px-3 py-2">{children}</div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const TONES: Record<string, string> = {
    PENDENTE: "bg-gray-100 text-gray-700",
    EM_ANDAMENTO: "bg-amber-100 text-amber-800",
    ENTREGUE: "bg-verde-light text-verde-dark",
    ATRASADA: "bg-red-100 text-red-700",
    DISPENSADA: "bg-gray-100 text-gray-500",
    ABERTA: "bg-gray-100 text-gray-700",
    PAGA: "bg-verde-light text-verde-dark",
    CANCELADA: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full ${TONES[status] ?? "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}

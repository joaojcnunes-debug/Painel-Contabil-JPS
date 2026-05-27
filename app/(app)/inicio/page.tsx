import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  FileText,
  Receipt,
  Trophy,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { formatBRL, formatDate } from "@/lib/utils";
import { BarChartMensal, type BarPoint } from "@/components/ui/BarChartMensal";

type ObrigRow = {
  id_obrigacao: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  status: string;
  clientes: { razao_social: string } | null;
  obrigacoes_catalogo: { sigla: string; nome: string } | null;
};

type FaturaRow = {
  id_fatura: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  status: string;
  clientes: { razao_social: string } | null;
};

type DocRow = {
  id_documento: string;
  id_cliente: string;
  arquivo_nome: string;
  tipo: string;
  origem: string;
  created_at: string;
  clientes: { razao_social: string } | null;
};

function isoHoje() {
  return new Date().toISOString().slice(0, 10);
}
function isoDaqui(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default async function InicioPage() {
  const supabase = await getServerSupabase();

  const hoje = isoHoje();
  const em7dias = isoDaqui(7);
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  // Últimos 6 meses pra gráfico
  const seisMesesAtras = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 10);
  })();

  // Tudo em paralelo — 8 queries no Promise.all (era 10 + outras nas listas)
  const [
    clientesAtivos,
    obrigPend,
    obrigAtras,
    docsRecebidos,
    fatAtrasoCount,
    fatAbertoSum,
    fatRecebidoMesSum,
    proxObrig,
    proxFat,
    docsCliente,
    lancs6meses,
    topClientesMes,
  ] = await Promise.all([
    supabase
      .from("clientes")
      .select("*", { count: "exact", head: true })
      .eq("status", "Ativo"),
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .in("status", ["PENDENTE", "EM_ANDAMENTO"]),
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .eq("status", "ATRASADA"),
    supabase
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .eq("status", "RECEBIDO"),
    supabase
      .from("faturas")
      .select("*", { count: "exact", head: true })
      .eq("status", "ATRASADA"),
    supabase
      .from("faturas")
      .select("valor")
      .in("status", ["ABERTA", "ATRASADA"]),
    supabase
      .from("faturas")
      .select("valor")
      .eq("status", "PAGA")
      .gte("data_pagamento", inicioMes),
    supabase
      .from("obrigacoes")
      .select(
        "id_obrigacao, id_cliente, competencia, data_vencimento, status, clientes(razao_social), obrigacoes_catalogo(sigla, nome)"
      )
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
      .lte("data_vencimento", em7dias)
      .order("data_vencimento")
      .limit(8),
    supabase
      .from("faturas")
      .select(
        "id_fatura, id_cliente, competencia, data_vencimento, valor, status, clientes(razao_social)"
      )
      .in("status", ["ABERTA", "ATRASADA"])
      .order("data_vencimento")
      .limit(8),
    supabase
      .from("documentos")
      .select(
        "id_documento, id_cliente, arquivo_nome, tipo, origem, created_at, clientes(razao_social)"
      )
      .eq("origem", "CLIENTE")
      .order("created_at", { ascending: false })
      .limit(8),
    // Lançamentos dos últimos 6 meses pra gráfico de evolução
    supabase
      .from("lancamentos")
      .select("data_lancamento, tipo, valor")
      .gte("data_lancamento", seisMesesAtras),
    // Top clientes por receita no mês corrente
    supabase
      .from("lancamentos")
      .select("id_cliente, valor, clientes(razao_social)")
      .eq("tipo", "RECEITA")
      .gte("data_lancamento", inicioMes),
  ]);

  const proximas = (proxObrig.data ?? []) as unknown as ObrigRow[];
  const faturas = (proxFat.data ?? []) as unknown as FaturaRow[];
  const docs = (docsCliente.data ?? []) as unknown as DocRow[];

  const aReceber = (
    (fatAbertoSum.data ?? []) as unknown as Array<{ valor: number }>
  ).reduce((s, f) => s + Number(f.valor ?? 0), 0);
  const recebidoMes = (
    (fatRecebidoMesSum.data ?? []) as unknown as Array<{ valor: number }>
  ).reduce((s, f) => s + Number(f.valor ?? 0), 0);

  // ─── Evolução 6 meses ───
  type LancMes = { data_lancamento: string; tipo: string; valor: number };
  const lancsMes = (lancs6meses.data ?? []) as unknown as LancMes[];
  const meses: BarPoint[] = (() => {
    const arr: BarPoint[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const x = new Date(d);
      x.setMonth(x.getMonth() - i);
      const ym = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
      const label = x
        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
        .replace(".", "")
        .replace(" de ", "/");
      arr.push({ label, receita: 0, despesa: 0 });
      // Pivot
      for (const l of lancsMes) {
        if (l.data_lancamento.startsWith(ym)) {
          const v = Number(l.valor);
          if (l.tipo === "RECEITA") arr[arr.length - 1].receita += v;
          else arr[arr.length - 1].despesa += v;
        }
      }
    }
    return arr;
  })();
  const temHistorico = meses.some((m) => m.receita > 0 || m.despesa > 0);

  // ─── Top clientes por receita no mês ───
  type TopRow = {
    id_cliente: string;
    valor: number;
    clientes: { razao_social: string } | null;
  };
  const topRaw = (topClientesMes.data ?? []) as unknown as TopRow[];
  const topMap = new Map<string, { nome: string; total: number }>();
  for (const r of topRaw) {
    const nome = r.clientes?.razao_social ?? "—";
    const cur = topMap.get(r.id_cliente) ?? { nome, total: 0 };
    cur.total += Number(r.valor);
    topMap.set(r.id_cliente, cur);
  }
  const topClientes = Array.from(topMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const totalTopMes = topClientes.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <PageHeader title="Início" subtitle="Visão geral do escritório" />

      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card
          label="Clientes ativos"
          value={clientesAtivos.count ?? 0}
          icon={Users}
          tone="verde"
          href="/clientes"
        />
        <Card
          label="Obrigações em aberto"
          value={obrigPend.count ?? 0}
          icon={CalendarCheck}
          tone="amber"
          href="/obrigacoes"
        />
        <Card
          label="Atrasadas"
          value={obrigAtras.count ?? 0}
          icon={AlertTriangle}
          tone={(obrigAtras.count ?? 0) > 0 ? "red" : "neutral"}
          href="/obrigacoes?status=ATRASADA"
        />
        <Card
          label="Docs a processar"
          value={docsRecebidos.count ?? 0}
          icon={FileText}
          tone="verde"
          href="/documentos?status=RECEBIDO"
        />
        <Card
          label="Faturas em atraso"
          value={fatAtrasoCount.count ?? 0}
          icon={Receipt}
          tone={(fatAtrasoCount.count ?? 0) > 0 ? "red" : "neutral"}
          href="/honorarios?status=ATRASADA"
        />
      </div>

      {/* Financeiro resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              A receber (todas as competências)
            </div>
            <Receipt className="text-gold" size={18} />
          </div>
          <div className="mt-2 text-3xl font-bold text-verde-dark">
            {formatBRL(aReceber)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Recebido este mês
            </div>
            <Receipt className="text-gold" size={18} />
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-800">
            {formatBRL(recebidoMes)}
          </div>
        </div>
      </div>

      {/* Painéis */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Panel
          title="Próximos vencimentos (7 dias)"
          href="/obrigacoes"
          empty="Nenhuma obrigação vence nos próximos 7 dias"
        >
          {proximas.map((o) => {
            const atrasada = o.data_vencimento < hoje;
            return (
              <Link
                key={o.id_obrigacao}
                href={`/clientes/${o.id_cliente}`}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">
                      <span className="font-mono text-xs text-verde-dark mr-2">
                        {o.obrigacoes_catalogo?.sigla ?? "—"}
                      </span>
                      {o.clientes?.razao_social ?? "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {o.obrigacoes_catalogo?.nome} • Comp. {o.competencia}
                    </div>
                  </div>
                  <div
                    className={
                      atrasada
                        ? "text-xs font-medium text-red-alert whitespace-nowrap"
                        : "text-xs font-medium text-verde-dark whitespace-nowrap"
                    }
                  >
                    {formatDate(o.data_vencimento)}
                  </div>
                </div>
              </Link>
            );
          })}
        </Panel>

        <Panel
          title="Faturas a receber"
          href="/honorarios"
          empty="Nenhuma fatura em aberto"
        >
          {faturas.map((f) => (
            <Link
              key={f.id_fatura}
              href={`/clientes/${f.id_cliente}`}
              className="block px-4 py-3 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">
                    {f.clientes?.razao_social ?? "—"}
                  </div>
                  <div className="text-xs text-gray-500">
                    Comp. {f.competencia} • Venc. {formatDate(f.data_vencimento)}
                  </div>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-800">
                    {formatBRL(Number(f.valor))}
                  </span>
                  {f.status === "ATRASADA" && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                      atraso
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      {/* Evolução 6 meses + Top clientes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2 bg-white border border-card-border rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
            <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
              <BarChart3 size={14} className="text-gold" />
              Evolução financeira (últimos 6 meses)
            </h3>
            <Link
              href="/lancamentos/dre"
              className="text-xs text-gold hover:text-verde-dark flex items-center gap-1"
            >
              Ver DRE <ArrowRight size={12} />
            </Link>
          </div>
          <div className="p-4">
            {temHistorico ? (
              <BarChartMensal data={meses} />
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">
                Comece a registrar lançamentos pra ver o histórico aqui.
                <div className="mt-2">
                  <Link
                    href="/lancamentos"
                    className="text-xs text-gold hover:text-verde-dark"
                  >
                    Ir para lançamentos →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-card-border rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
            <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
              <Trophy size={14} className="text-gold" />
              Top clientes (mês)
            </h3>
            <span className="text-xs text-gray-500">{formatBRL(totalTopMes)}</span>
          </div>
          <div className="divide-y divide-card-border">
            {topClientes.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-gray-500">
                Sem receitas no mês ainda.
              </div>
            )}
            {topClientes.map((c, i) => {
              const perc =
                totalTopMes > 0 ? Math.round((c.total / totalTopMes) * 100) : 0;
              return (
                <Link
                  key={c.id}
                  href={`/clientes/${c.id}`}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-verde-light text-verde-dark text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-800 truncate">
                        {c.nome}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-verde-dark whitespace-nowrap">
                      {formatBRL(c.total)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-verde-primary"
                      style={{ width: `${perc}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Panel
        title="Documentos enviados por clientes (recentes)"
        href="/documentos"
        empty="Nenhum documento recebido do portal cliente ainda"
      >
        {docs.map((d) => (
          <Link
            key={d.id_documento}
            href={`/clientes/${d.id_cliente}`}
            className="block px-4 py-3 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-gray-800 truncate">
                  {d.clientes?.razao_social ?? "—"} • {d.tipo}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {d.arquivo_nome}
                </div>
              </div>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(d.created_at)}
              </div>
            </div>
          </Link>
        ))}
      </Panel>
    </div>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: "verde" | "amber" | "red" | "neutral";
  href: string;
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "amber"
      ? "text-amber-warning"
      : tone === "verde"
      ? "text-verde-dark"
      : "text-gray-800";
  return (
    <Link
      href={href}
      className="bg-white border border-card-border rounded-xl p-5 hover:border-verde-primary transition group"
    >
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide leading-tight">
          {label}
        </div>
        <Icon className="text-gold" size={18} />
      </div>
      <div className={`mt-2 text-3xl font-bold ${cls}`}>{value}</div>
      <div className="mt-2 text-[10px] text-gray-400 group-hover:text-verde-dark inline-flex items-center gap-1">
        Abrir <ArrowRight size={10} />
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  empty,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark">
          {title}
        </h3>
        <Link
          href={href}
          className="text-xs text-gold hover:text-verde-dark flex items-center gap-1"
        >
          Ver tudo <ArrowRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-card-border">
        {arr.length > 0 ? (
          arr
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

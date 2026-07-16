// Monitor de XMLs — dashboard das NFe capturadas pela Distribuição DFe.
//
// Server Component. Puxa da vw_nfe_dfe_monitor (view criada na migration 25)
// e renderiza cards de KPI + gráfico de linha (30d) + top emitentes + lista.
// Pra manter o custo de renderização controlado, o gráfico e o top são
// calculados em memória depois de carregar N linhas da view.

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  FileCode,
  Link2,
  MailCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";
import { GraficoNfePorDia } from "./GraficoNfePorDia";

type Search = {
  cliente?: string;
  periodo?: string; // 30d (default) | 7d | 90d | ano
};

type MonitorRow = {
  chave: string;
  id_cliente: string;
  cliente_nome: string | null;
  ambiente: number;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  numero: string | null;
  serie: string | null;
  valor_total: number | null;
  dh_emissao: string | null;
  baixado_em: string;
  visualizada_em: string | null;
  status_manifestacao: string | null;
  status_manifestacao_em: string | null;
  id_lancamento: string | null;
  lancamento_competencia: string | null;
  lancamento_valor: number | null;
  dias_desde_emissao: number | null;
  sem_manifestacao: boolean;
  sem_lancamento: boolean;
};

const PERIODOS: Record<string, { label: string; dias: number }> = {
  "7d": { label: "7 dias", dias: 7 },
  "30d": { label: "30 dias", dias: 30 },
  "90d": { label: "90 dias", dias: 90 },
  ano: { label: "12 meses", dias: 365 },
};

export default async function MonitorXmlsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await getServerSupabase();

  const periodoKey = PERIODOS[sp.periodo ?? "30d"] ? sp.periodo ?? "30d" : "30d";
  const dias = PERIODOS[periodoKey].dias;
  const desdeIso = new Date(Date.now() - dias * 86400_000).toISOString();

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id_cliente, razao_social")
    .order("razao_social")
    .limit(500);
  const clientes = (clientesData ?? []) as Array<{
    id_cliente: string;
    razao_social: string;
  }>;

  let q = supabase
    .from("vw_nfe_dfe_monitor")
    .select("*")
    .gte("baixado_em", desdeIso)
    .order("baixado_em", { ascending: false })
    .limit(2000);
  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);

  const { data, error } = await q;
  const rows = (data ?? []) as unknown as MonitorRow[];

  // KPIs
  const totalNfe = rows.length;
  const totalValor = rows.reduce(
    (s, r) => s + (Number(r.valor_total) || 0),
    0
  );
  const semManif = rows.filter((r) => r.sem_manifestacao).length;
  const semManifAtrasadas = rows.filter(
    (r) => r.sem_manifestacao && (r.dias_desde_emissao ?? 0) >= 150
  ).length;
  const semLanc = rows.filter((r) => r.sem_lancamento).length;

  // Série diária (últimos N dias)
  const serie: Array<{ dia: string; qtd: number; valor: number }> = [];
  const bucket = new Map<string, { qtd: number; valor: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const k = d.toISOString().slice(0, 10);
    bucket.set(k, { qtd: 0, valor: 0 });
  }
  for (const r of rows) {
    const k = r.baixado_em.slice(0, 10);
    const b = bucket.get(k);
    if (b) {
      b.qtd += 1;
      b.valor += Number(r.valor_total) || 0;
    }
  }
  for (const [dia, v] of bucket.entries()) {
    serie.push({ dia, qtd: v.qtd, valor: v.valor });
  }

  // Top emitentes
  const emitMap = new Map<
    string,
    { nome: string; cnpj: string | null; qtd: number; valor: number }
  >();
  for (const r of rows) {
    const key = r.emitente_cnpj ?? r.emitente_nome ?? "?";
    const e = emitMap.get(key) ?? {
      nome: r.emitente_nome ?? "—",
      cnpj: r.emitente_cnpj,
      qtd: 0,
      valor: 0,
    };
    e.qtd += 1;
    e.valor += Number(r.valor_total) || 0;
    emitMap.set(key, e);
  }
  const topEmitentes = Array.from(emitMap.values())
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // Pendências críticas (mais urgentes primeiro)
  const criticas = rows
    .filter((r) => r.sem_manifestacao)
    .sort(
      (a, b) => (b.dias_desde_emissao ?? 0) - (a.dias_desde_emissao ?? 0)
    )
    .slice(0, 15);

  return (
    <div>
      <PageHeader
        title="Monitor de XMLs"
        subtitle="NFe capturadas via Distribuição DFe — matching, manifestação e prazos"
      />

      {/* Filtros */}
      <form
        method="get"
        className="bg-white border border-card-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select
            name="cliente"
            defaultValue={sp.cliente ?? ""}
            className={inputClass}
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Período
          </label>
          <select
            name="periodo"
            defaultValue={periodoKey}
            className={inputClass}
          >
            {Object.entries(PERIODOS).map(([k, v]) => (
              <option key={k} value={k}>
                Últimos {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="px-4 py-2 bg-verde-primary text-white text-sm rounded-lg hover:bg-verde-accent w-full"
          >
            Atualizar
          </button>
        </div>
      </form>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="NFe capturadas"
          value={String(totalNfe)}
          hint={`R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          tone="neutro"
        />
        <Kpi
          label="Sem manifestação"
          value={String(semManif)}
          hint={
            semManifAtrasadas > 0
              ? `${semManifAtrasadas} com > 150d (prazo 180d)`
              : "dentro do prazo"
          }
          tone={semManifAtrasadas > 0 ? "critico" : semManif > 0 ? "aviso" : "positivo"}
          href={`/monitor-xmls?periodo=${periodoKey}${sp.cliente ? `&cliente=${sp.cliente}` : ""}#pendentes`}
        />
        <Kpi
          label="Sem lançamento"
          value={String(semLanc)}
          hint={
            totalNfe > 0
              ? `${Math.round((semLanc / totalNfe) * 100)}% do total`
              : "—"
          }
          tone={semLanc > 0 ? "aviso" : "positivo"}
        />
        <Kpi
          label="Emitentes únicos"
          value={String(emitMap.size)}
          hint={`no período de ${PERIODOS[periodoKey].label}`}
          tone="neutro"
        />
      </div>

      {/* Gráfico + Top emitentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-card-border rounded-xl p-4 lg:col-span-2">
          <div className="text-xs uppercase text-gray-500 tracking-wide mb-3">
            NFe capturadas por dia
          </div>
          <GraficoNfePorDia data={serie} />
        </div>
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500 tracking-wide mb-3">
            Top emitentes por valor
          </div>
          {topEmitentes.length === 0 ? (
            <div className="text-xs text-gray-500 py-6 text-center">
              Sem dados no período
            </div>
          ) : (
            <ul className="space-y-2">
              {topEmitentes.map((e) => (
                <li
                  key={e.cnpj ?? e.nome}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-800">{e.nome}</div>
                    {e.cnpj && (
                      <div className="text-[10px] font-mono text-gray-400">
                        {formatCNPJ(e.cnpj)}
                      </div>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-verde-dark font-medium">
                      {formatBRL(e.valor)}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {e.qtd} NFe
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Pendências críticas */}
      <div
        id="pendentes"
        className="bg-white border border-card-border rounded-xl mb-4"
      >
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={16}
              className={semManifAtrasadas > 0 ? "text-red-alert" : "text-gray-400"}
            />
            <h3 className="text-sm font-semibold text-gray-800">
              Pendentes de manifestação
            </h3>
            {semManif > 0 && (
              <span className="text-[11px] text-gray-500">
                (mostrando {criticas.length} de {semManif})
              </span>
            )}
          </div>
          <Link
            href={`/integracoes/notas-fiscais/recebidas${sp.cliente ? `?cliente=${sp.cliente}` : ""}`}
            className="text-xs text-verde-primary hover:text-verde-dark flex items-center gap-1"
          >
            Ver lista completa <ArrowRight size={12} />
          </Link>
        </div>
        {criticas.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            <MailCheck size={28} className="mx-auto text-gray-300 mb-2" />
            Todas as NFe do período já foram manifestadas. 🎉
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {criticas.map((r) => (
              <PendenciaLinha key={r.chave} r={r} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-alert">
          Erro na query: {error.message}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "neutro" | "positivo" | "aviso" | "critico";
  href?: string;
}) {
  const toneCls =
    tone === "critico"
      ? "text-red-alert"
      : tone === "aviso"
        ? "text-amber-700"
        : tone === "positivo"
          ? "text-verde-dark"
          : "text-gray-800";
  const body = (
    <>
      <div className="text-xs uppercase text-gray-500 tracking-wide">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneCls}`}>{value}</div>
      {hint && (
        <div className="text-[11px] text-gray-500 mt-1">{hint}</div>
      )}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="bg-white border border-card-border rounded-xl p-4 hover:border-verde-primary transition-colors block"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      {body}
    </div>
  );
}

function PendenciaLinha({ r }: { r: MonitorRow }) {
  const dias = r.dias_desde_emissao ?? 0;
  const critico = dias >= 150;
  const aviso = dias >= 90 && dias < 150;
  return (
    <div className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm">
      <div
        className={`w-1.5 h-10 rounded-full flex-shrink-0 ${
          critico
            ? "bg-red-alert"
            : aviso
              ? "bg-amber-500"
              : "bg-verde-primary/40"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-gray-800 truncate max-w-[260px]">
            {r.emitente_nome ?? "—"}
          </span>
          <span className="text-[11px] text-gray-500">
            {r.cliente_nome} · NF {r.numero ?? "—"}
          </span>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          Emitida {r.dh_emissao ? formatDate(r.dh_emissao.slice(0, 10)) : "?"} —{" "}
          <strong
            className={
              critico ? "text-red-alert" : aviso ? "text-amber-700" : "text-gray-700"
            }
          >
            {dias}d
          </strong>{" "}
          desde emissão
          {r.sem_lancamento && (
            <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              <Link2 size={9} className="inline mr-0.5" />
              sem lançamento
            </span>
          )}
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="text-sm font-medium text-verde-dark">
          {r.valor_total != null ? formatBRL(Number(r.valor_total)) : "—"}
        </div>
      </div>
      <Link
        href={`/integracoes/notas-fiscais?cliente=${r.id_cliente}`}
        className="p-1.5 text-gray-400 hover:text-verde-dark"
        title="Ir pra manifestação"
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Clock,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Row = {
  id_obrigacao: string;
  id_cliente: string;
  data_vencimento: string;
  data_entrega: string | null;
  status: string;
  responsavel: string | null;
  clientes: { razao_social: string } | null;
  obrigacoes_catalogo: { sigla: string } | null;
};

function isoHojeMenosDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function diffDias(a: string, b: string) {
  const ta = new Date(a + "T12:00").getTime();
  const tb = new Date(b + "T12:00").getTime();
  return Math.round((tb - ta) / 86400000);
}

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const sp = await searchParams;
  const periodoDias = Math.max(7, Math.min(365, Number(sp.dias ?? "30")));
  const cutoff = isoHojeMenosDias(periodoDias);

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  // Pega obrigações com vencimento OU entrega no período
  const { data } = await supabase
    .from("obrigacoes")
    .select(
      "id_obrigacao, id_cliente, data_vencimento, data_entrega, status, responsavel, clientes(razao_social), obrigacoes_catalogo(sigla)"
    )
    .or(`data_vencimento.gte.${cutoff},data_entrega.gte.${cutoff}`)
    .limit(2000);

  const rows = (data ?? []) as unknown as Row[];

  // ─── Agregações globais ─────────────────────────────────────────
  let entreguesNoPeriodo = 0;
  let entreguesNoPrazo = 0;
  let entreguesAtraso = 0; // entregues mas após o vencimento
  let pendentesAtrasadas = 0;
  let pendentesNoPrazo = 0;
  let somaAntecedencia = 0; // dias entre entrega e vencimento (positivo = antes)

  const hoje = new Date().toISOString().slice(0, 10);

  for (const r of rows) {
    if (r.data_entrega && r.data_entrega >= cutoff) {
      entreguesNoPeriodo++;
      const ant = diffDias(r.data_entrega, r.data_vencimento);
      somaAntecedencia += ant;
      if (ant >= 0) entreguesNoPrazo++;
      else entreguesAtraso++;
    } else if (
      (r.status === "PENDENTE" || r.status === "EM_ANDAMENTO") &&
      r.data_vencimento >= cutoff
    ) {
      if (r.data_vencimento < hoje) pendentesAtrasadas++;
      else pendentesNoPrazo++;
    } else if (r.status === "ATRASADA") {
      pendentesAtrasadas++;
    }
  }

  const percNoPrazo =
    entreguesNoPeriodo > 0
      ? Math.round((entreguesNoPrazo / entreguesNoPeriodo) * 100)
      : 0;
  const antecedenciaMedia =
    entreguesNoPeriodo > 0
      ? (somaAntecedencia / entreguesNoPeriodo).toFixed(1)
      : "—";

  // ─── Por responsável ────────────────────────────────────────────
  type Stat = {
    nome: string;
    total: number;
    noPrazo: number;
    atrasadas: number;
  };
  const porResp = new Map<string, Stat>();
  for (const r of rows) {
    const nome = r.responsavel?.trim() || "(sem responsável)";
    const s = porResp.get(nome) ?? { nome, total: 0, noPrazo: 0, atrasadas: 0 };
    if (r.data_entrega && r.data_entrega >= cutoff) {
      s.total++;
      const ant = diffDias(r.data_entrega, r.data_vencimento);
      if (ant >= 0) s.noPrazo++;
      else s.atrasadas++;
    } else if (r.status === "ATRASADA") {
      s.atrasadas++;
    }
    porResp.set(nome, s);
  }
  const responsaveis = Array.from(porResp.values())
    .filter((s) => s.total > 0 || s.atrasadas > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ─── Por cliente (críticos) ─────────────────────────────────────
  type ClienteStat = {
    id: string;
    nome: string;
    atrasadas: number;
    pendentes: number;
  };
  const porCliente = new Map<string, ClienteStat>();
  for (const r of rows) {
    const id = r.id_cliente;
    const s = porCliente.get(id) ?? {
      id,
      nome: r.clientes?.razao_social ?? "—",
      atrasadas: 0,
      pendentes: 0,
    };
    if (r.status === "ATRASADA") s.atrasadas++;
    if (r.status === "PENDENTE" || r.status === "EM_ANDAMENTO")
      s.pendentes++;
    porCliente.set(id, s);
  }
  const clientesCriticos = Array.from(porCliente.values())
    .filter((c) => c.atrasadas > 0)
    .sort((a, b) => b.atrasadas - a.atrasadas)
    .slice(0, 10);

  // ─── Por sigla (obrigações mais problemáticas) ──────────────────
  type SiglaStat = { sigla: string; atrasadas: number; total: number };
  const porSigla = new Map<string, SiglaStat>();
  for (const r of rows) {
    const sigla = r.obrigacoes_catalogo?.sigla ?? "—";
    const s = porSigla.get(sigla) ?? { sigla, atrasadas: 0, total: 0 };
    s.total++;
    if (r.status === "ATRASADA") s.atrasadas++;
    porSigla.set(sigla, s);
  }
  const siglasProblema = Array.from(porSigla.values())
    .filter((s) => s.atrasadas > 0)
    .sort((a, b) => b.atrasadas - a.atrasadas)
    .slice(0, 6);

  // ─── Últimas entregas ───────────────────────────────────────────
  const ultimasEntregas = rows
    .filter((r) => !!r.data_entrega && r.data_entrega >= cutoff)
    .sort((a, b) =>
      (b.data_entrega ?? "").localeCompare(a.data_entrega ?? "")
    )
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Produtividade"
        subtitle={`Indicadores dos últimos ${periodoDias} dias`}
        actions={
          <div className="flex items-center gap-1 bg-white border border-card-border rounded-lg p-1">
            {[15, 30, 60, 90].map((d) => (
              <Link
                key={d}
                href={`/produtividade?dias=${d}`}
                className={
                  periodoDias === d
                    ? "px-3 py-1.5 rounded-md bg-verde-primary text-white text-xs font-medium"
                    : "px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50 text-xs"
                }
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          label="Entregues no período"
          value={entreguesNoPeriodo}
          icon={CalendarCheck}
          tone="verde"
        />
        <Card
          label="% no prazo"
          value={`${percNoPrazo}%`}
          icon={TrendingUp}
          tone={percNoPrazo >= 80 ? "verde" : percNoPrazo >= 50 ? "amber" : "red"}
        />
        <Card
          label="Atrasadas (aberto + entregues atraso)"
          value={pendentesAtrasadas + entreguesAtraso}
          icon={AlertTriangle}
          tone={pendentesAtrasadas + entreguesAtraso > 0 ? "red" : "neutral"}
        />
        <Card
          label="Antecedência média"
          value={
            antecedenciaMedia === "—"
              ? "—"
              : `${antecedenciaMedia} d`
          }
          icon={Clock}
          tone="neutral"
        />
      </div>

      {/* Pendências em aberto */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <MiniCard
          label="Em aberto — no prazo"
          value={pendentesNoPrazo}
          tone="verde"
        />
        <MiniCard
          label="Em aberto — atrasadas"
          value={pendentesAtrasadas}
          tone={pendentesAtrasadas > 0 ? "red" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Por responsável */}
        <Panel title="Desempenho por responsável" empty="Sem entregas no período">
          <div className="divide-y divide-card-border">
            {responsaveis.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Sem entregas no período
              </div>
            )}
            {responsaveis.map((r) => {
              const perc =
                r.total > 0 ? Math.round((r.noPrazo / r.total) * 100) : 0;
              return (
                <div key={r.nome} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {r.nome}
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {r.total} entregue{r.total !== 1 && "s"}
                      {r.atrasadas > 0 && (
                        <span className="text-red-alert ml-2">
                          • {r.atrasadas} atras{r.atrasadas === 1 ? "ada" : "adas"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={
                        perc >= 80
                          ? "h-full bg-verde-primary"
                          : perc >= 50
                          ? "h-full bg-amber-warning"
                          : "h-full bg-red-alert"
                      }
                      style={{ width: `${perc}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{perc}% no prazo</div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Clientes críticos */}
        <Panel
          title="Clientes com mais pendências"
          empty="Nenhum cliente em atraso 🎉"
        >
          <div className="divide-y divide-card-border">
            {clientesCriticos.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Nenhum cliente com atrasos no período
              </div>
            )}
            {clientesCriticos.map((c) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-gray-800 truncate">{c.nome}</div>
                  <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">
                      {c.atrasadas} atras{c.atrasadas === 1 ? "ada" : "adas"}
                    </span>
                    {c.pendentes > 0 && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                        +{c.pendentes} pend.
                      </span>
                    )}
                    <ArrowRight size={12} className="text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Siglas mais problemáticas */}
        <Panel
          title="Obrigações com mais atrasos"
          empty="Sem atrasos no período"
        >
          <div className="divide-y divide-card-border">
            {siglasProblema.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Nenhuma sigla em atraso 🎉
              </div>
            )}
            {siglasProblema.map((s) => {
              const perc = Math.round((s.atrasadas / s.total) * 100);
              return (
                <div
                  key={s.sigla}
                  className="px-4 py-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-mono text-sm font-bold text-verde-dark">
                      {s.sigla}
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.atrasadas} de {s.total} ({perc}%)
                    </div>
                  </div>
                  <div className="w-32 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-red-alert"
                      style={{ width: `${Math.min(100, perc)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Últimas entregas */}
        <Panel title="Últimas entregas" empty="Nenhuma entrega no período">
          <div className="divide-y divide-card-border">
            {ultimasEntregas.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Nenhuma entrega registrada
              </div>
            )}
            {ultimasEntregas.map((r) => {
              const ant = r.data_entrega
                ? diffDias(r.data_entrega, r.data_vencimento)
                : 0;
              const cor = ant >= 0 ? "text-verde-dark" : "text-red-alert";
              return (
                <Link
                  key={r.id_obrigacao}
                  href={`/clientes/${r.id_cliente}`}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 truncate">
                        <span className="font-mono text-xs text-verde-dark mr-2">
                          {r.obrigacoes_catalogo?.sigla ?? "—"}
                        </span>
                        {r.clientes?.razao_social ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Entregue {formatDate(r.data_entrega)}
                      </div>
                    </div>
                    <div className={`text-xs whitespace-nowrap ${cor}`}>
                      {ant >= 0
                        ? `${ant === 0 ? "no dia" : `${ant}d antes`}`
                        : `${-ant}d atraso`}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: "verde" | "amber" | "red" | "neutral";
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
    <div className="bg-white border border-card-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide leading-tight">
          {label}
        </div>
        <Icon className="text-gold" size={18} />
      </div>
      <div className={`mt-2 text-3xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "verde" | "red" | "neutral";
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "verde"
      ? "text-verde-dark"
      : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded-xl p-4 flex items-center justify-between">
      <div className="text-sm text-gray-600">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark">
          {title}
        </h3>
      </div>
      {children ? children : (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          {empty}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { formatBRL } from "@/lib/utils";
import { FiltrosDre } from "./FiltrosDre";

type Row = {
  id_lancamento: string;
  data_lancamento: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  id_cliente: string;
  clientes: { razao_social: string } | null;
  plano_contas: {
    id_conta: string;
    codigo: string;
    nome: string;
    tipo: string;
    grupo: string | null;
  } | null;
};

function primeiroDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}
function ultimoDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const dataInicio = sp.de || primeiroDiaMes();
  const dataFim = sp.ate || ultimoDiaMes();

  const supabase = await getServerSupabase();

  let q = supabase
    .from("lancamentos")
    .select(
      "id_lancamento, data_lancamento, tipo, valor, id_cliente, clientes(razao_social), plano_contas(id_conta, codigo, nome, tipo, grupo)"
    )
    .gte("data_lancamento", dataInicio)
    .lte("data_lancamento", dataFim)
    .order("data_lancamento")
    .limit(5000);
  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id_cliente, razao_social")
    .order("razao_social");

  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  // Cliente selecionado (pra mostrar no header)
  const clienteSel = sp.cliente
    ? ((clientesData ?? []) as Array<{ id_cliente: string; razao_social: string }>).find(
        (c) => c.id_cliente === sp.cliente
      )
    : null;

  // ─── Agregação: tipo → grupo → conta ───
  type ContaAgg = { codigo: string; nome: string; total: number };
  type GrupoAgg = { grupo: string; total: number; contas: Map<string, ContaAgg> };
  const receitas = new Map<string, GrupoAgg>();
  const despesas = new Map<string, GrupoAgg>();

  for (const r of rows) {
    const c = r.plano_contas;
    if (!c) continue;
    const grupoNome = c.grupo ?? "Sem grupo";
    const target = r.tipo === "RECEITA" ? receitas : despesas;
    if (!target.has(grupoNome)) {
      target.set(grupoNome, {
        grupo: grupoNome,
        total: 0,
        contas: new Map(),
      });
    }
    const grupo = target.get(grupoNome)!;
    grupo.total += Number(r.valor);
    if (!grupo.contas.has(c.id_conta)) {
      grupo.contas.set(c.id_conta, {
        codigo: c.codigo,
        nome: c.nome,
        total: 0,
      });
    }
    grupo.contas.get(c.id_conta)!.total += Number(r.valor);
  }

  const totalReceitas = Array.from(receitas.values()).reduce(
    (s, g) => s + g.total,
    0
  );
  const totalDespesas = Array.from(despesas.values()).reduce(
    (s, g) => s + g.total,
    0
  );
  const resultado = totalReceitas - totalDespesas;

  function gruposOrdenados(m: Map<string, GrupoAgg>) {
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/lancamentos"
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para lançamentos
        </Link>
      </div>

      <PageHeader
        title="DRE — Demonstrativo de Resultado"
        subtitle={
          clienteSel
            ? `${clienteSel.razao_social} • ${formatPeriodo(dataInicio, dataFim)}`
            : `Consolidado • ${formatPeriodo(dataInicio, dataFim)}`
        }
      />

      <FiltrosDre
        clientes={(clientesData ?? []) as Array<{ id_cliente: string; razao_social: string }>}
        clienteAtual={sp.cliente ?? ""}
        dataInicio={dataInicio}
        dataFim={dataFim}
      />

      {/* Cards principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card
          label="Receita total"
          value={totalReceitas}
          tone="verde"
          icon={TrendingUp}
        />
        <Card
          label="Despesa total"
          value={totalDespesas}
          tone="red"
          icon={TrendingDown}
        />
        <Card
          label="Resultado"
          value={resultado}
          tone={resultado >= 0 ? "verde" : "red"}
          big
        />
      </div>

      {/* DRE estruturado */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-card-border bg-gray-50">
          <h3 className="font-serif text-sm font-semibold text-verde-dark">
            Detalhamento
          </h3>
        </div>

        {/* RECEITAS */}
        <SecaoBloco
          titulo="( + ) RECEITAS"
          total={totalReceitas}
          tone="verde"
          grupos={gruposOrdenados(receitas)}
        />

        {/* DESPESAS */}
        <SecaoBloco
          titulo="( − ) DESPESAS"
          total={totalDespesas}
          tone="red"
          grupos={gruposOrdenados(despesas)}
        />

        {/* RESULTADO */}
        <div className="px-5 py-4 bg-verde-light border-t-2 border-verde-dark">
          <div className="flex items-center justify-between">
            <div className="font-serif font-bold text-verde-dark uppercase tracking-wider">
              ( = ) RESULTADO DO PERÍODO
            </div>
            <div
              className={
                resultado >= 0
                  ? "text-2xl font-bold font-serif text-verde-dark"
                  : "text-2xl font-bold font-serif text-red-alert"
              }
            >
              {formatBRL(resultado)}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-4 text-center print:hidden">
        Use <strong>Ctrl/Cmd + P</strong> pra imprimir ou salvar em PDF.
      </p>
    </div>
  );
}

function formatPeriodo(de: string, ate: string) {
  const d1 = new Date(de + "T12:00").toLocaleDateString("pt-BR");
  const d2 = new Date(ate + "T12:00").toLocaleDateString("pt-BR");
  return `${d1} a ${d2}`;
}

function Card({
  label,
  value,
  tone,
  icon: Icon,
  big,
}: {
  label: string;
  value: number;
  tone: "verde" | "red";
  icon?: React.ElementType;
  big?: boolean;
}) {
  const cls = tone === "verde" ? "text-verde-dark" : "text-red-alert";
  return (
    <div className="bg-white border border-card-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        {Icon && <Icon className="text-gold" size={20} />}
      </div>
      <div
        className={`mt-2 ${big ? "text-3xl" : "text-2xl"} font-bold font-serif ${cls}`}
      >
        {formatBRL(value)}
      </div>
    </div>
  );
}

function SecaoBloco({
  titulo,
  total,
  tone,
  grupos,
}: {
  titulo: string;
  total: number;
  tone: "verde" | "red";
  grupos: Array<{
    grupo: string;
    total: number;
    contas: Map<string, { codigo: string; nome: string; total: number }>;
  }>;
}) {
  const cls = tone === "verde" ? "text-verde-dark" : "text-red-alert";
  return (
    <div className="border-b border-card-border last:border-b-0">
      <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between">
        <div className={`font-serif font-semibold text-sm ${cls}`}>
          {titulo}
        </div>
        <div className={`font-bold ${cls}`}>{formatBRL(total)}</div>
      </div>
      {grupos.length === 0 ? (
        <div className="px-5 py-4 text-center text-xs text-gray-500">
          Nenhum lançamento no período
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.grupo} className="px-5 py-2 border-t border-card-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium text-gray-700">
                {g.grupo}
              </div>
              <div className="text-sm font-semibold text-gray-700">
                {formatBRL(g.total)}
              </div>
            </div>
            <div className="divide-y divide-card-border/40">
              {Array.from(g.contas.values())
                .sort((a, b) => b.total - a.total)
                .map((c) => (
                  <div
                    key={c.codigo}
                    className="flex items-center justify-between py-1 pl-3 text-xs"
                  >
                    <div className="text-gray-600">
                      <span className="font-mono text-gray-400 mr-2">
                        {c.codigo}
                      </span>
                      {c.nome}
                    </div>
                    <div className="text-gray-700">{formatBRL(c.total)}</div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { FiltrosDemonstracoes } from "./FiltrosDemonstracoes";
import { DemonstracoesView, type LancamentoView } from "./DemonstracoesView";

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

export default async function DemonstracoesPage({
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
      "id_lancamento, data_lancamento, tipo, valor, descricao, documento_ref, id_cliente, clientes(razao_social), plano_contas(id_conta, codigo, nome, tipo, grupo)"
    )
    .gte("data_lancamento", dataInicio)
    .lte("data_lancamento", dataFim)
    .order("data_lancamento")
    .limit(5000);
  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);

  const [{ data: lancsRaw }, { data: clientesData }] = await Promise.all([
    q,
    supabase
      .from("clientes")
      .select("id_cliente, razao_social")
      .order("razao_social"),
  ]);

  const lancamentos = (lancsRaw ?? []) as unknown as LancamentoView[];
  const clientes = (clientesData ?? []) as Array<{
    id_cliente: string;
    razao_social: string;
  }>;
  const clienteSel = sp.cliente
    ? clientes.find((c) => c.id_cliente === sp.cliente) ?? null
    : null;

  return (
    <div>
      <div className="mb-3 print:hidden">
        <Link
          href="/lancamentos"
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para lançamentos
        </Link>
      </div>

      <div className="print:hidden">
        <PageHeader
          title="Demonstrações contábeis"
          subtitle={
            clienteSel
              ? `${clienteSel.razao_social} • ${formatPeriodo(dataInicio, dataFim)}`
              : `Consolidado • ${formatPeriodo(dataInicio, dataFim)}`
          }
        />

        <FiltrosDemonstracoes
          clientes={clientes}
          clienteAtual={sp.cliente ?? ""}
          dataInicio={dataInicio}
          dataFim={dataFim}
        />
      </div>

      <DemonstracoesView
        lancamentos={lancamentos}
        dataInicio={dataInicio}
        dataFim={dataFim}
        clienteNome={clienteSel?.razao_social ?? null}
      />
    </div>
  );
}

function formatPeriodo(de: string, ate: string) {
  const d1 = new Date(de + "T12:00").toLocaleDateString("pt-BR");
  const d2 = new Date(ate + "T12:00").toLocaleDateString("pt-BR");
  return `${d1} a ${d2}`;
}

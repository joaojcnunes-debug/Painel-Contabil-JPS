import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

export default async function ObrigacoesPage() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
  const { data } = await supabase
    .from("obrigacoes")
    .select(
      "*, clientes(razao_social), obrigacoes_catalogo(sigla, nome)"
    )
    .order("data_vencimento", { ascending: true })
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Obrigações"
        subtitle="Calendário fiscal dos clientes"
        actions={
          <button className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent">
            + Lançar obrigação
          </button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Obrigação</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {(data ?? []).map((o: Record<string, unknown>) => {
              const cliente = (o.clientes as { razao_social: string } | null)?.razao_social ?? "—";
              const cat = o.obrigacoes_catalogo as
                | { sigla: string; nome: string }
                | null;
              const status = (o.status as string) ?? "PENDENTE";
              return (
                <tr key={o.id_obrigacao as string} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{cliente}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-mono text-xs text-verde-dark mr-2">
                      {cat?.sigla ?? "—"}
                    </span>
                    {cat?.nome}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.competencia as string}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(o.data_vencimento as string)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[status] ?? "bg-gray-100"}`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhuma obrigação lançada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

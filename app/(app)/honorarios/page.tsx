import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-700",
  PAGA: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-500",
};

export default async function HonorariosPage() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
  const { data } = await supabase
    .from("faturas")
    .select("*, clientes(razao_social)")
    .order("data_vencimento", { ascending: false })
    .limit(100);

  const totalAberto = (data ?? [])
    .filter((f: Record<string, unknown>) => f.status === "ABERTA" || f.status === "ATRASADA")
    .reduce((acc: number, f: Record<string, unknown>) => acc + Number(f.valor ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Honorários"
        subtitle="Cobrança recorrente e faturas"
        actions={
          <button className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent">
            + Nova fatura
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">A receber</div>
          <div className="mt-2 text-2xl font-bold text-verde-dark">
            {formatBRL(totalAberto)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">Faturas mostradas</div>
          <div className="mt-2 text-2xl font-bold text-gray-800">
            {(data ?? []).length}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">Em atraso</div>
          <div className="mt-2 text-2xl font-bold text-red-alert">
            {(data ?? []).filter((f: Record<string, unknown>) => f.status === "ATRASADA").length}
          </div>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {(data ?? []).map((f: Record<string, unknown>) => {
              const cliente =
                (f.clientes as { razao_social: string } | null)?.razao_social ?? "—";
              const status = (f.status as string) ?? "ABERTA";
              return (
                <tr key={f.id_fatura as string} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{cliente}</td>
                  <td className="px-4 py-3 text-gray-600">{f.competencia as string}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(f.data_vencimento as string)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {formatBRL(Number(f.valor))}
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
                  Nenhuma fatura ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

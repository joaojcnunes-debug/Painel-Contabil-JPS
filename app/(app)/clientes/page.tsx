import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import type { Cliente } from "@/lib/supabase/types";
import { formatCNPJ, formatBRL } from "@/lib/utils";

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  MEI: "MEI",
  DOMESTICO: "Doméstico",
  PRODUTOR_RURAL: "Produtor Rural",
};

export default async function ClientesPage() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
  const { data: clientesData } = await supabase
    .from("clientes")
    .select("*")
    .order("razao_social");
  const clientes = (clientesData ?? []) as Cliente[];

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Carteira do escritório"
        actions={
          <button className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent">
            + Novo cliente
          </button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Razão Social</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Regime</th>
              <th className="px-4 py-3">Honorário</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {clientes.map((c) => (
              <tr key={c.id_cliente} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {c.razao_social}
                  {c.nome_fantasia && (
                    <div className="text-xs text-gray-500">{c.nome_fantasia}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                  {formatCNPJ(c.cnpj)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {REGIME_LABEL[c.regime] ?? c.regime}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatBRL(c.honorario_mensal)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.status === "Ativo"
                        ? "text-xs px-2 py-1 rounded-full bg-verde-light text-verde-dark"
                        : "text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                    }
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

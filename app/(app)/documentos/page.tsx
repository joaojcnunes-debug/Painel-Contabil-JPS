import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export default async function DocumentosPage() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
  const { data } = await supabase
    .from("documentos")
    .select("*, clientes(razao_social)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Documentos"
        subtitle="Arquivos enviados pelos clientes e pela equipe"
        actions={
          <button className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent">
            + Enviar documento
          </button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Enviado em</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {(data ?? []).map((d: Record<string, unknown>) => {
              const cliente =
                (d.clientes as { razao_social: string } | null)?.razao_social ?? "—";
              return (
                <tr key={d.id_documento as string} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{cliente}</td>
                  <td className="px-4 py-3 text-gray-700">{d.tipo as string}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {d.arquivo_nome as string}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {d.origem as string}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(d.created_at as string)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-verde-light text-verde-dark">
                      {d.status as string}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum documento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

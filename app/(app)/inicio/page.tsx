import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export default async function InicioPage() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const [clientes, obrigacoesPend, docsRecebidos, faturasAtraso] = await Promise.all([
    supabase.from("clientes").select("*", { count: "exact", head: true }).eq("status", "Ativo"),
    supabase.from("obrigacoes").select("*", { count: "exact", head: true }).in("status", ["PENDENTE", "EM_ANDAMENTO"]),
    supabase.from("documentos").select("*", { count: "exact", head: true }).eq("status", "RECEBIDO"),
    supabase.from("faturas").select("*", { count: "exact", head: true }).eq("status", "ATRASADA"),
  ]);

  const cards = [
    { label: "Clientes ativos", value: clientes.count ?? 0, tone: "verde" },
    { label: "Obrigações pendentes", value: obrigacoesPend.count ?? 0, tone: "amber" },
    { label: "Documentos a processar", value: docsRecebidos.count ?? 0, tone: "verde" },
    { label: "Faturas em atraso", value: faturasAtraso.count ?? 0, tone: "red" },
  ];

  return (
    <div>
      <PageHeader
        title="Início"
        subtitle="Visão geral do escritório"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white border border-card-border rounded-xl p-5"
          >
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {c.label}
            </div>
            <div
              className={
                c.tone === "red"
                  ? "mt-2 text-3xl font-bold text-red-alert"
                  : c.tone === "amber"
                  ? "mt-2 text-3xl font-bold text-amber-warning"
                  : "mt-2 text-3xl font-bold text-verde-dark"
              }
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export default async function PortalInicio() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: usuarioData } = await supabase
    .from("usuarios")
    .select("id_cliente, nome")
    .eq("id_usuario", user!.id)
    .single();
  const usuario = usuarioData as
    | { id_cliente: string | null; nome: string }
    | null;

  const idCliente = usuario?.id_cliente;

  const [obrigPend, docs, faturas] = await Promise.all([
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente!)
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"]),
    supabase
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente!),
    supabase
      .from("faturas")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente!)
      .in("status", ["ABERTA", "ATRASADA"]),
  ]);

  return (
    <div>
      <PageHeader title={`Olá, ${usuario?.nome ?? "cliente"}`} subtitle="Visão geral da sua conta" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">Obrigações em aberto</div>
          <div className="mt-2 text-3xl font-bold text-amber-warning">
            {obrigPend.count ?? 0}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">Documentos enviados</div>
          <div className="mt-2 text-3xl font-bold text-verde-dark">{docs.count ?? 0}</div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase">Faturas a pagar</div>
          <div className="mt-2 text-3xl font-bold text-red-alert">
            {faturas.count ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: usuarioData } = await supabase
    .from("usuarios")
    .select("perfil, id_cliente")
    .ilike("email", user.email ?? "")
    .single();
  const usuario = usuarioData as
    | { perfil: string; id_cliente: string | null }
    | null;

  if (!usuario || usuario.perfil !== "Cliente" || !usuario.id_cliente) {
    redirect("/inicio");
  }

  return <AppShell variant="portal">{children}</AppShell>;
}

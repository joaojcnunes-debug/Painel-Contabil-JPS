import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export default async function InternoLayout({
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
    .select("perfil")
    .eq("id_usuario", user.id)
    .single();
  const usuario = usuarioData as { perfil: string } | null;

  if (usuario?.perfil === "Cliente") redirect("/portal");

  return (
    <div className="min-h-screen flex">
      <Sidebar variant="interno" />
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}

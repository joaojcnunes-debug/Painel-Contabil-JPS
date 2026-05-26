import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getAuthUser, getUsuarioPerfil } from "@/lib/supabase/server-cache";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const usuario = await getUsuarioPerfil();
  if (!usuario || usuario.perfil !== "Cliente" || !usuario.id_cliente) {
    redirect("/inicio");
  }

  return <AppShell variant="portal">{children}</AppShell>;
}

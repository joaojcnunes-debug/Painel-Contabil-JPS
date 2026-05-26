import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getAuthUser, getUsuarioPerfil } from "@/lib/supabase/server-cache";

export default async function InternoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const usuario = await getUsuarioPerfil();
  if (usuario?.perfil === "Cliente") redirect("/portal");

  return <AppShell variant="interno">{children}</AppShell>;
}

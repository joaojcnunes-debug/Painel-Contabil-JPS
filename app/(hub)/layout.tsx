import { redirect } from "next/navigation";
import { getAuthUser, getUsuarioPerfil } from "@/lib/supabase/server-cache";

// Mesma checagem de (app), mas sem o AppShell: o hub ocupa a página inteira.
export default async function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const usuario = await getUsuarioPerfil();
  if (usuario?.perfil === "Cliente") redirect("/portal");

  return <>{children}</>;
}

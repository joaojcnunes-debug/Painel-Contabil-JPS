import { getUsuarioPerfil } from "@/lib/supabase/server-cache";
import { HubModulos } from "@/components/hub/HubModulos";

// Perfil vem do servidor (não do estado salvo no navegador), para o hub
// nunca mostrar os cartões de outro usuário que logou antes no mesmo PC.
export default async function ModulosPage() {
  const usuario = await getUsuarioPerfil();
  return <HubModulos nome={usuario?.nome ?? ""} perfil={usuario?.perfil ?? null} />;
}

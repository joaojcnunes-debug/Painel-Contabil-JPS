import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./client";

// Dedupe a criação do client + lookup do usuario logado dentro de UMA
// renderização. Next.js React cache() garante 1 chamada por request.
// Layouts e pages aninhadas que precisarem do user/usuario chamam isso
// sem custo extra.

export const getServerSupabase = cache(async () => {
  const cookieStore = await cookies();
  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
});

export const getAuthUser = cache(async () => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type PerfilLite = {
  perfil: string;
  id_cliente: string | null;
  nome: string;
  email: string;
} | null;

export const getUsuarioPerfil = cache(async (): Promise<PerfilLite> => {
  const user = await getAuthUser();
  if (!user?.email) return null;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("usuarios")
    .select("perfil, id_cliente, nome, email")
    .ilike("email", user.email)
    .maybeSingle();
  return data as PerfilLite;
});

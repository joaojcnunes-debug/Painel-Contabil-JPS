import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "./client";
import { createClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Cache persistente (entre requests) pra dados quase-estáticos.
// Usa unstable_cache do Next com revalidate de 1 hora + tags pra invalidação
// manual. Toda mutação relevante deve chamar revalidateTag('<tag>') depois.
//
// IMPORTANTE: unstable_cache não enxerga cookies → não dá pra usar o cliente
// com auth do usuário aqui. Como esses dados não dependem do user e RLS
// permite leitura ampla (configuracoes, catálogos), criamos um cliente
// anônimo dedicado (sem cookies) só pra essas queries cacheadas.
// ---------------------------------------------------------------------------

function getAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, { auth: { persistSession: false } });
}

export const getConfiguracoes = unstable_cache(
  async (): Promise<Record<string, unknown> | null> => {
    const supabase = getAnonSupabase();
    const { data } = await supabase
      .from("configuracoes")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return data as Record<string, unknown> | null;
  },
  ["configuracoes-singleton"],
  { revalidate: 3600, tags: ["configuracoes"] }
);

export type CatalogoObrigacaoLite = {
  id_catalogo: string;
  sigla: string;
  nome: string;
  periodicidade: string | null;
  dia_vencimento: number | null;
};

export const getCatalogoObrigacoes = unstable_cache(
  async (): Promise<CatalogoObrigacaoLite[]> => {
    const supabase = getAnonSupabase();
    const { data } = await supabase
      .from("obrigacoes_catalogo")
      .select("id_catalogo, sigla, nome, periodicidade, dia_vencimento")
      .order("sigla");
    return (data ?? []) as CatalogoObrigacaoLite[];
  },
  ["catalogo-obrigacoes"],
  { revalidate: 3600, tags: ["catalogo-obrigacoes"] }
);

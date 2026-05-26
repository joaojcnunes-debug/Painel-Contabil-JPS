"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/lib/store";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { translateAuthError } from "@/lib/supabase/errors";
import type { Usuario } from "@/lib/supabase/types";
import { Logo } from "@/components/ui/Logo";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/inicio";
  const setUser = useUserStore((s) => s.setUser);
  const { data: cfg } = useConfiguracao();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm || !senha) {
      toast.error("Informe e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password: senha,
      });
      if (error || !data.user) {
        toast.error(translateAuthError(error?.message));
        return;
      }

      // Verifica se há fator 2FA verificado — se sim, redireciona pra step 2
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.nextLevel === "aal2" && aalData.currentLevel === "aal1") {
        router.push(`/login/2fa?next=${encodeURIComponent(next)}`);
        return;
      }

      const { data: usuarioData, error: errUser } = await supabase
        .from("usuarios")
        .select("*")
        .ilike("email", emailNorm)
        .maybeSingle();

      if (errUser) {
        toast.error("Erro ao buscar perfil: " + errUser.message);
        await supabase.auth.signOut();
        return;
      }
      const usuario = usuarioData as Usuario | null;

      if (!usuario) {
        toast.error(
          "Você está autenticado mas ainda não foi cadastrado no sistema. Avise o administrador."
        );
        await supabase.auth.signOut();
        return;
      }
      if (!usuario.ativo) {
        toast.error("Usuário desativado. Procure o administrador.");
        await supabase.auth.signOut();
        return;
      }

      setUser(usuario);
      toast.success(`Olá, ${usuario.nome.split(" ")[0]}!`);

      const destino =
        usuario.perfil === "Cliente"
          ? "/portal"
          : next.startsWith("/portal")
          ? "/inicio"
          : next;
      router.push(destino);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-card-border p-8">
        <div className="flex flex-col items-center mb-7">
          <Logo size={120} src={cfg?.logo_url ?? null} />
          <h1 className="mt-5 font-serif text-2xl font-bold text-verde-dark tracking-wide text-center">
            {cfg?.nome_escritorio ?? "JSP Contabilidade"}
          </h1>
          {cfg?.mensagem_login && (
            <p className="text-xs text-gray-500 mt-2 text-center max-w-xs">
              {cfg.mensagem_login}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <PasswordInput
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-verde-primary text-white rounded-lg font-medium hover:bg-verde-accent transition disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Link
            href="/esqueci-senha"
            className="text-xs text-gold hover:text-verde-dark"
          >
            Esqueci minha senha
          </Link>
          <p className="text-xs text-gray-400">
            Acesso para equipe e clientes.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/lib/store";
import type { Usuario } from "@/lib/supabase/types";

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

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (error || !data.user) {
        toast.error(error?.message ?? "Não foi possível entrar.");
        return;
      }

      const { data: usuarioData, error: errUser } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id_usuario", data.user.id)
        .single();
      const usuario = usuarioData as Usuario | null;

      if (errUser || !usuario) {
        toast.error("Usuário autenticado, mas sem registro em usuarios.");
        return;
      }
      if (!usuario.ativo) {
        toast.error("Usuário desativado.");
        await supabase.auth.signOut();
        return;
      }

      setUser(usuario);
      toast.success(`Olá, ${usuario.nome}!`);

      const destino =
        usuario.perfil === "Cliente"
          ? "/portal"
          : next.startsWith("/portal")
          ? "/inicio"
          : next;
      router.push(destino);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-card-border p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-verde-primary flex items-center justify-center text-white mb-3">
            <LogIn size={28} />
          </div>
          <h1 className="text-2xl font-bold text-verde-dark">Painel Contábil</h1>
          <p className="text-sm text-gray-500">Chabra Contabilidade</p>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary"
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

        <p className="text-xs text-gray-400 text-center mt-6">
          Acesso para equipe e clientes.
        </p>
      </div>
    </div>
  );
}

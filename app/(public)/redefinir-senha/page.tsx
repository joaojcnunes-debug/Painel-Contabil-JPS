"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { translateAuthError } from "@/lib/supabase/errors";
import { Logo } from "@/components/ui/Logo";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const { data: cfg } = useConfiguracao();

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);
  // sessaoOk indica que o Supabase carregou o token de recovery na URL.
  const [sessaoOk, setSessaoOk] = useState<boolean | null>(null);

  // Quando o usuário cai aqui vindo do link do e-mail, o Supabase emite
  // o evento PASSWORD_RECOVERY e a sessão fica disponível pra updateUser.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessaoOk(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessaoOk(true);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (senha !== confirmar) {
      toast.error("As senhas não conferem");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        toast.error(translateAuthError(error.message));
        return;
      }
      setPronto(true);
      await supabase.auth.signOut();
      setTimeout(() => router.push("/login"), 2500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-card-border p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo size={88} src={cfg?.logo_url ?? null} showSubtitle={false} />
          <h1 className="mt-4 font-serif text-xl font-bold text-verde-dark text-center">
            Definir nova senha
          </h1>
        </div>

        {pronto ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto text-verde-primary" size={42} />
            <h2 className="font-serif text-lg font-semibold text-verde-dark">
              Senha redefinida!
            </h2>
            <p className="text-sm text-gray-600">
              Redirecionando pro login…
            </p>
          </div>
        ) : sessaoOk === false ? (
          <div className="space-y-4">
            <div className="bg-red-100 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              Link inválido ou expirado. Solicite um novo e-mail de
              redefinição.
            </div>
            <Link
              href="/esqueci-senha"
              className="block text-center text-sm text-gold hover:text-verde-dark"
            >
              Pedir novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nova senha
              </label>
              <PasswordInput
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar nova senha
              </label>
              <PasswordInput
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading || sessaoOk !== true}
              className="w-full py-2.5 bg-verde-primary text-white rounded-lg font-medium hover:bg-verde-accent transition disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

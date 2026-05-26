"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { translateAuthError } from "@/lib/supabase/errors";
import { Logo } from "@/components/ui/Logo";

export default function EsqueciSenhaPage() {
  const { data: cfg } = useConfiguracao();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      toast.error("Informe seu e-mail");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/redefinir-senha`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        redirectTo,
      });
      if (error) {
        toast.error(translateAuthError(error.message));
        return;
      }
      setEnviado(true);
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
            Esqueci minha senha
          </h1>
        </div>

        {enviado ? (
          <div className="space-y-4">
            <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark flex items-start gap-3">
              <MailCheck size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>E-mail enviado!</strong>
                <p className="text-xs mt-1 text-verde-dark/80">
                  Se esse e-mail estiver cadastrado, você receberá um link pra
                  redefinir a senha em alguns instantes. Verifique também a
                  caixa de spam.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-gold hover:text-verde-dark"
            >
              ← Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Informe o e-mail cadastrado. Vamos enviar um link pra você definir
              uma nova senha.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-verde-primary text-white rounded-lg font-medium hover:bg-verde-accent transition disabled:opacity-60"
              >
                {loading ? "Enviando..." : "Enviar link de redefinição"}
              </button>
            </form>

            <Link
              href="/login"
              className="mt-6 flex items-center justify-center gap-1 text-xs text-gold hover:text-verde-dark"
            >
              <ArrowLeft size={12} /> Voltar para o login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

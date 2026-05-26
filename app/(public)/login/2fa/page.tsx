"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Shield } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { useUserStore } from "@/lib/store";
import { Logo } from "@/components/ui/Logo";
import type { Usuario } from "@/lib/supabase/types";

export default function LoginTwoFactorPage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorForm />
    </Suspense>
  );
}

function TwoFactorForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/inicio";
  const { data: cfg } = useConfiguracao();
  const setUser = useUserStore((s) => s.setUser);

  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Pega o factor TOTP verificado pra desafiar
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (!mounted) return;
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      if (!totp) {
        // Não tem MFA configurado — manda pro destino direto
        router.replace(next);
        return;
      }
      setFactorId(totp.id);
    })();
    return () => {
      mounted = false;
    };
  }, [router, next]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (codigo.length !== 6) {
      toast.error("Código deve ter 6 dígitos");
      return;
    }
    if (!factorId) return;

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: ch, error: errCh } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (errCh) {
        toast.error(errCh.message);
        return;
      }
      const { error: errV } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: codigo,
      });
      if (errV) {
        toast.error("Código inválido");
        return;
      }

      // Pega user de novo + atualiza store
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.email) {
        const { data: usuarioData } = await supabase
          .from("usuarios")
          .select("*")
          .ilike("email", userData.user.email)
          .maybeSingle();
        if (usuarioData) setUser(usuarioData as Usuario);
      }

      toast.success("Autenticado");
      router.replace(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function sair() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-card-border p-8">
        <div className="flex flex-col items-center mb-6">
          <Logo size={88} src={cfg?.logo_url ?? null} showSubtitle={false} />
          <div className="mt-4 w-12 h-12 rounded-full bg-verde-light flex items-center justify-center text-verde-dark">
            <Shield size={22} />
          </div>
          <h1 className="mt-3 font-serif text-xl font-bold text-verde-dark text-center">
            Verificação de dois fatores
          </h1>
          <p className="text-sm text-gray-500 text-center mt-2 max-w-xs">
            Digite o código de 6 dígitos do seu app autenticador
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            required
            autoFocus
            value={codigo}
            onChange={(e) =>
              setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            maxLength={6}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-center text-2xl tracking-[0.4em] font-mono"
          />
          <button
            type="submit"
            disabled={loading || codigo.length !== 6 || !factorId}
            className="w-full py-2.5 bg-verde-primary text-white rounded-lg font-medium hover:bg-verde-accent transition disabled:opacity-60"
          >
            {loading ? "Verificando..." : "Verificar"}
          </button>
        </form>

        <button
          type="button"
          onClick={sair}
          className="mt-6 w-full text-center text-xs text-gold hover:text-verde-dark"
        >
          ← Sair e voltar pro login
        </button>
      </div>
    </div>
  );
}

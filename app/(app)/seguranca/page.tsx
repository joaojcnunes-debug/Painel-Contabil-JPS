"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AtivarMfa } from "@/components/seguranca/AtivarMfa";
import { DesativarMfa } from "@/components/seguranca/DesativarMfa";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/lib/store";

type FactorLite = { id: string; status: string; factor_type: string };

export default function SegurancaPage() {
  const user = useUserStore((s) => s.user);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });

  const totpVerified =
    (data?.totp ?? []).find((f: FactorLite) => f.status === "verified") ?? null;
  const totpPending =
    (data?.totp ?? []).find((f: FactorLite) => f.status === "unverified") ?? null;

  // Limpa enroll pendente que ficou de tentativas anteriores
  async function limparPendente() {
    if (!totpPending) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.mfa.unenroll({ factorId: totpPending.id });
    qc.invalidateQueries({ queryKey: ["mfa-factors"] });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Segurança"
        subtitle={`Conta: ${user?.email ?? "—"}`}
      />

      <div className="bg-white border border-card-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-verde-light flex items-center justify-center text-verde-dark">
            <Shield size={20} />
          </div>
          <div>
            <h3 className="font-serif text-base font-semibold text-verde-dark">
              Autenticação em dois fatores (2FA)
            </h3>
            <p className="text-xs text-gray-500">
              Camada adicional de proteção via app autenticador (TOTP)
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-gray-500">Carregando…</div>
        ) : totpVerified ? (
          <DesativarMfa
            factorId={totpVerified.id}
            onSuccess={() =>
              qc.invalidateQueries({ queryKey: ["mfa-factors"] })
            }
          />
        ) : (
          <>
            {totpPending && (
              <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center justify-between gap-2">
                <span>Você tem uma configuração pendente. Conclua ou descarte.</span>
                <button
                  type="button"
                  onClick={limparPendente}
                  className="text-xs text-gold hover:text-verde-dark whitespace-nowrap"
                >
                  Descartar
                </button>
              </div>
            )}
            <AtivarMfa
              onSuccess={() =>
                qc.invalidateQueries({ queryKey: ["mfa-factors"] })
              }
            />
          </>
        )}
      </div>

      <div className="mt-4 bg-white border border-card-border rounded-xl p-5 text-sm text-gray-600">
        <h4 className="font-serif font-semibold text-verde-dark mb-2">
          Recomendado para
        </h4>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>Contas com perfil <strong>Admin</strong> (alteram tudo)</li>
          <li>Contas que acessam de redes públicas</li>
          <li>Conformidade com CFC e LGPD</li>
        </ul>
      </div>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type EnrollData = {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
};

export function AtivarMfa({ onSuccess }: { onSuccess: () => void }) {
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [codigo, setCodigo] = useState("");

  const iniciar = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Aplicativo autenticador",
      });
      if (error) throw error;
      if (!data?.totp) throw new Error("Falha ao iniciar 2FA");
      return {
        factorId: data.id,
        qrCodeSvg: data.totp.qr_code,
        secret: data.totp.secret,
      };
    },
    onSuccess: (d) => setEnroll(d),
    onError: (e: Error) => {
      // Se MFA não estiver habilitado no projeto, retorna erro claro
      if (e.message.toLowerCase().includes("mfa") && e.message.toLowerCase().includes("disabled")) {
        toast.error(
          "MFA não está habilitado no Supabase. Ative em Auth → Sign-in Methods."
        );
      } else {
        toast.error(e.message);
      }
    },
  });

  const verificar = useMutation({
    mutationFn: async () => {
      if (!enroll) throw new Error("Faça o enroll primeiro");
      if (codigo.length !== 6) throw new Error("Código deve ter 6 dígitos");
      const supabase = createSupabaseBrowserClient();
      const { data: ch, error: errCh } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (errCh) throw errCh;
      const { error: errV } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: ch.id,
        code: codigo,
      });
      if (errV) throw errV;
    },
    onSuccess: () => {
      toast.success("2FA ativado");
      setEnroll(null);
      setCodigo("");
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copiarSecret() {
    if (!enroll) return;
    navigator.clipboard.writeText(enroll.secret);
    toast.success("Segredo copiado");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    verificar.mutate();
  }

  if (!enroll) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Proteja sua conta exigindo um código de 6 dígitos do app autenticador
          (Google Authenticator, Authy, 1Password, etc) a cada login.
        </p>
        <Button
          onClick={() => iniciar.mutate()}
          disabled={iniciar.isPending}
          className="flex items-center gap-2"
        >
          <ShieldCheck size={16} />
          {iniciar.isPending ? "Gerando..." : "Iniciar configuração"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
        <li>Instale um app autenticador (ex.: Google Authenticator, Authy).</li>
        <li>Escaneie o QR Code abaixo ou cole o segredo manualmente.</li>
        <li>Digite o código de 6 dígitos gerado pelo app.</li>
      </ol>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div
          className="bg-white p-3 border border-card-border rounded-lg"
          dangerouslySetInnerHTML={{ __html: enroll.qrCodeSvg }}
        />
        <div className="flex-1 w-full">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Segredo manual
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded font-mono break-all">
              {enroll.secret}
            </code>
            <button
              type="button"
              onClick={copiarSecret}
              className="p-2 rounded hover:bg-gray-100 text-gray-600"
              title="Copiar"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Código gerado pelo app" required>
          <input
            className={`${inputClass} text-center text-lg tracking-[0.3em] font-mono`}
            value={codigo}
            onChange={(e) =>
              setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            maxLength={6}
            autoFocus
            inputMode="numeric"
          />
        </Field>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEnroll(null)}
            disabled={verificar.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={verificar.isPending || codigo.length !== 6}
            className="flex-1"
          >
            {verificar.isPending ? "Verificando..." : "Confirmar e ativar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

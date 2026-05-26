"use client";

import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  factorId: string;
  onSuccess: () => void;
};

export function DesativarMfa({ factorId, onSuccess }: Props) {
  const remover = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("2FA desativado");
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="bg-verde-light border border-verde-border rounded-lg p-3 text-sm text-verde-dark">
        ✓ Autenticação de dois fatores está <strong>ATIVA</strong>. A cada login
        o sistema vai pedir um código do seu app autenticador.
      </div>
      <Button
        variant="danger"
        onClick={() => {
          if (
            confirm(
              "Remover a autenticação de dois fatores? Sua conta ficará protegida apenas pela senha."
            )
          ) {
            remover.mutate();
          }
        }}
        disabled={remover.isPending}
        className="flex items-center gap-2"
      >
        <ShieldOff size={16} />
        {remover.isPending ? "Removendo..." : "Desativar 2FA"}
      </Button>
    </div>
  );
}

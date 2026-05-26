"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, Edit2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/lib/store";
import type { Cliente, Fatura } from "@/lib/supabase/types";

const FaturaFormModal = dynamic(
  () =>
    import("@/components/faturas/FaturaFormModal").then((m) => ({
      default: m.FaturaFormModal,
    })),
  { ssr: false }
);

export function FaturaActions({
  fatura,
  clientes,
}: {
  fatura: Fatura;
  clientes: Cliente[];
}) {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const [editing, setEditing] = useState(false);

  const marcarPaga = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("faturas")
        .update({
          status: "PAGA",
          data_pagamento: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_fatura", fatura.id_fatura);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcada como paga");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("faturas")
        .update({
          status: "CANCELADA",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_fatura", fatura.id_fatura);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatura cancelada");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {fatura.status !== "PAGA" && fatura.status !== "CANCELADA" && (
        <Button
          onClick={() => marcarPaga.mutate()}
          disabled={marcarPaga.isPending}
          className="flex items-center gap-2"
        >
          <Check size={16} /> Marcar como paga
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2"
      >
        <Edit2 size={14} /> Editar
      </Button>
      <Link
        href={`/honorarios/${fatura.id_fatura}/recibo`}
        target="_blank"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
      >
        <Printer size={14} /> Recibo
      </Link>
      {isAdmin && fatura.status !== "CANCELADA" && (
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Cancelar esta fatura?")) cancelar.mutate();
          }}
          disabled={cancelar.isPending}
          className="flex items-center gap-2"
        >
          <X size={14} /> Cancelar
        </Button>
      )}

      <FaturaFormModal
        open={editing}
        onClose={() => {
          setEditing(false);
          router.refresh();
        }}
        fatura={fatura}
        clientes={clientes}
      />
    </div>
  );
}

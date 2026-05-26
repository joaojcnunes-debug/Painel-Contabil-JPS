"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, Edit2, RotateCcw, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ObrigacaoFormModal = dynamic(
  () =>
    import("@/components/obrigacoes/ObrigacaoFormModal").then((m) => ({
      default: m.ObrigacaoFormModal,
    })),
  { ssr: false }
);
import { useUserStore } from "@/lib/store";
import type {
  Cliente,
  Obrigacao,
  ObrigacaoCatalogo,
} from "@/lib/supabase/types";

type Props = {
  obrigacao: Obrigacao;
  clientes: Cliente[];
  catalogo: ObrigacaoCatalogo[];
};

export function ObrigacaoActions({ obrigacao, clientes, catalogo }: Props) {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const [editing, setEditing] = useState(false);

  const marcarEntregue = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .update({
          status: "ENTREGUE",
          data_entrega: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_obrigacao", obrigacao.id_obrigacao);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcada como entregue");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desmarcar = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .update({
          status: "PENDENTE",
          data_entrega: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_obrigacao", obrigacao.id_obrigacao);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrega desfeita");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .delete()
        .eq("id_obrigacao", obrigacao.id_obrigacao);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigação excluída");
      router.push("/obrigacoes");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {obrigacao.status !== "ENTREGUE" ? (
        <Button
          onClick={() => marcarEntregue.mutate()}
          disabled={marcarEntregue.isPending}
          className="flex items-center gap-2"
        >
          <Check size={16} /> Marcar como entregue
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => desmarcar.mutate()}
          disabled={desmarcar.isPending}
          className="flex items-center gap-2"
        >
          <RotateCcw size={16} /> Desmarcar entrega
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2"
      >
        <Edit2 size={14} /> Editar
      </Button>
      {isAdmin && (
        <Button
          variant="danger"
          onClick={() => {
            if (
              confirm(
                "Excluir esta obrigação? Comentários também serão removidos."
              )
            ) {
              excluir.mutate();
            }
          }}
          disabled={excluir.isPending}
          className="flex items-center gap-2"
        >
          <Trash2 size={14} /> Excluir
        </Button>
      )}

      <ObrigacaoFormModal
        open={editing}
        onClose={() => {
          setEditing(false);
          router.refresh();
        }}
        obrigacao={obrigacao}
        clientes={clientes}
        catalogo={catalogo}
      />
    </div>
  );
}

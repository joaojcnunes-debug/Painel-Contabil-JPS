"use client";

import { useState } from "react";
import { Edit2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import type { Cliente } from "@/lib/supabase/types";

const ClienteFormModal = dynamic(
  () =>
    import("@/components/clientes/ClienteFormModal").then((m) => ({
      default: m.ClienteFormModal,
    })),
  { ssr: false }
);

export function ClienteHeaderActions({ cliente }: { cliente: Cliente }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <Edit2 size={14} /> Editar
      </Button>
      <ClienteFormModal
        open={open}
        onClose={() => setOpen(false)}
        cliente={cliente}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Edit2, FileBarChart2 } from "lucide-react";
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
      <Link
        href={`/clientes/${cliente.id_cliente}/relatorio`}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
      >
        <FileBarChart2 size={14} /> Relatório
      </Link>
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

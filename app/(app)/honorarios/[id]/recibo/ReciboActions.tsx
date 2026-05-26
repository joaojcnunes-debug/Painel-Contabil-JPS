"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

export function ReciboActions() {
  const router = useRouter();
  return (
    <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between px-4 print:hidden">
      <button
        onClick={() => router.back()}
        className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Voltar
      </button>
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent flex items-center gap-2"
      >
        <Printer size={14} /> Imprimir / Salvar PDF
      </button>
    </div>
  );
}

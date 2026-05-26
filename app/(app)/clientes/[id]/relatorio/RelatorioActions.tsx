"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

type Props = {
  idCliente: string;
  competencia: string;
};

export function RelatorioActions({ idCliente, competencia }: Props) {
  const router = useRouter();

  function trocarMes(nova: string) {
    const params = new URLSearchParams();
    params.set("comp", nova);
    router.push(`/clientes/${idCliente}/relatorio?${params.toString()}`);
  }

  return (
    <div className="max-w-4xl mx-auto mb-4 flex flex-col sm:flex-row items-center gap-3 justify-between print:hidden">
      <Link
        href={`/clientes/${idCliente}`}
        className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Voltar para o cliente
      </Link>
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={competencia}
          onChange={(e) => trocarMes(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-verde-primary"
        />
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent flex items-center gap-2"
        >
          <Printer size={14} /> Imprimir / PDF
        </button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { List } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { CalendarMonth } from "@/components/obrigacoes/CalendarMonth";
import { useClientes } from "@/lib/hooks/useClientes";
import { useObrigacoesPorIntervalo } from "@/lib/hooks/useObrigacoes";

function isoDoMes(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  const ini = `${year}-${String(month).padStart(2, "0")}-01`;
  const fim = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { ini, fim };
}

export default function CalendarioPage() {
  return (
    <Suspense fallback={null}>
      <CalendarioInner />
    </Suspense>
  );
}

function CalendarioInner() {
  const sp = useSearchParams();
  const hoje = new Date();
  const [year, setYear] = useState(hoje.getFullYear());
  const [month, setMonth] = useState(hoje.getMonth() + 1);
  const [idCliente, setIdCliente] = useState(sp.get("cliente") ?? "");

  const { ini, fim } = isoDoMes(year, month);
  const { data: clientes = [] } = useClientes();
  const { data: obrigacoes = [], isLoading } = useObrigacoesPorIntervalo(
    ini,
    fim,
    { idCliente: idCliente || undefined }
  );

  return (
    <div>
      <PageHeader
        title="Calendário fiscal"
        subtitle="Vencimentos do mês organizados por dia"
        actions={
          <Link
            href={`/obrigacoes${idCliente ? `?cliente=${idCliente}` : ""}`}
            className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
          >
            <List size={14} /> Ver como lista
          </Link>
        }
      />

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {isLoading
            ? "Carregando…"
            : `${obrigacoes.length} obrigaç${obrigacoes.length === 1 ? "ão" : "ões"} no mês`}
        </div>
      </div>

      <CalendarMonth
        year={year}
        month={month}
        obrigacoes={obrigacoes}
        onChangeMonth={(y, m) => {
          setYear(y);
          setMonth(m);
        }}
      />
    </div>
  );
}

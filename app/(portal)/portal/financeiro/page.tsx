"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { useFaturas } from "@/lib/hooks/useFaturas";
import { useUserStore } from "@/lib/store";
import { formatBRL, formatDate } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-700",
  PAGA: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Em aberto",
  PAGA: "Paga",
  ATRASADA: "Em atraso",
  CANCELADA: "Cancelada",
};

export default function PortalFinanceiro() {
  const user = useUserStore((s) => s.user);
  const idCliente = user?.id_cliente ?? "";
  const [status, setStatus] = useState("");

  const { data: faturas = [], isLoading } = useFaturas({
    idCliente,
    status: status || undefined,
  });

  const stats = useMemo(() => {
    let aberto = 0;
    let pago = 0;
    let atraso = 0;
    for (const f of faturas) {
      const v = Number(f.valor ?? 0);
      if (f.status === "PAGA") pago += v;
      else if (f.status === "ABERTA") aberto += v;
      else if (f.status === "ATRASADA") atraso += v;
    }
    return { aberto, pago, atraso };
  }, [faturas]);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Suas faturas e pagamentos" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Em aberto</div>
          <div className="mt-2 text-2xl font-bold text-verde-dark">
            {formatBRL(stats.aberto)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Em atraso</div>
          <div className="mt-2 text-2xl font-bold text-red-alert">
            {formatBRL(stats.atraso)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Pago no período</div>
          <div className="mt-2 text-2xl font-bold text-gray-800">
            {formatBRL(stats.pago)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Status
          </label>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ABERTA">Em aberto</option>
            <option value="ATRASADA">Em atraso</option>
            <option value="PAGA">Pagas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {faturas.length} fatura{faturas.length !== 1 && "s"}
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading &&
              faturas.map((f) => (
                <tr key={f.id_fatura} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    {f.descricao ?? `Honorários ${f.competencia}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{f.competencia}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(f.data_vencimento)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {formatBRL(Number(f.valor))}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(f.data_pagamento)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[f.status] ?? "bg-gray-100"}`}
                    >
                      {STATUS_LABEL[f.status] ?? f.status}
                    </span>
                  </td>
                </tr>
              ))}
            {!isLoading && faturas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhuma fatura.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { useObrigacoes } from "@/lib/hooks/useObrigacoes";
import { useUserStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  ENTREGUE: "Entregue",
  ATRASADA: "Atrasada",
  DISPENSADA: "Dispensada",
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PortalObrigacoes() {
  const user = useUserStore((s) => s.user);
  const idCliente = user?.id_cliente ?? "";
  const [competencia, setCompetencia] = useState(competenciaAtual());

  const { data: obrigacoes = [], isLoading } = useObrigacoes({
    idCliente,
    competencia: competencia || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Minhas obrigações"
        subtitle="Calendário fiscal da sua empresa"
      />

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Competência
          </label>
          <input
            type="month"
            className={inputClass}
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {obrigacoes.length} obrigaç{obrigacoes.length === 1 ? "ão" : "ões"}
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Obrigação</th>
              <th className="px-4 py-3">Esfera</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Entrega</th>
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
              obrigacoes.map((o) => (
                <tr key={o.id_obrigacao} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-mono text-xs text-verde-dark mr-2">
                      {o.obrigacoes_catalogo?.sigla ?? "—"}
                    </span>
                    {o.obrigacoes_catalogo?.nome}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {o.obrigacoes_catalogo?.esfera ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.competencia}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(o.data_vencimento)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(o.data_entrega)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[o.status] ?? "bg-gray-100"}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            {!isLoading && obrigacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhuma obrigação lançada para essa competência.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

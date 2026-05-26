"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { useClientes } from "@/lib/hooks/useClientes";
import { formatCNPJ, formatBRL } from "@/lib/utils";
import { csvData, csvMoeda } from "@/lib/csv";
import type { Cliente } from "@/lib/supabase/types";

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  MEI: "MEI",
  DOMESTICO: "Doméstico",
  PRODUTOR_RURAL: "Produtor Rural",
};

const STATUS_TONE: Record<string, string> = {
  Ativo: "bg-verde-light text-verde-dark",
  Inativo: "bg-gray-100 text-gray-600",
  Suspenso: "bg-amber-100 text-amber-800",
};

export default function ClientesPage() {
  const { data: clientes = [], isLoading } = useClientes();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);

  function novo() {
    setEditing(null);
    setModalOpen(true);
  }
  function editar(c: Cliente) {
    setEditing(c);
    setModalOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Carteira do escritório"
        actions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={clientes}
              filename={`clientes-${new Date().toISOString().slice(0, 10)}.csv`}
              columns={[
                { header: "Razão social", value: (c) => c.razao_social },
                { header: "Nome fantasia", value: (c) => c.nome_fantasia },
                { header: "CNPJ", value: (c) => formatCNPJ(c.cnpj) },
                { header: "Regime", value: (c) => c.regime },
                { header: "Atividade", value: (c) => c.atividade_principal },
                {
                  header: "Honorário (R$)",
                  value: (c) => csvMoeda(c.honorario_mensal),
                },
                { header: "Dia vencto", value: (c) => c.dia_vencimento },
                {
                  header: "Início contrato",
                  value: (c) => csvData(c.inicio_contrato),
                },
                { header: "Status", value: (c) => c.status },
              ]}
            />
            <Button onClick={novo} className="flex items-center gap-2">
              <Plus size={16} /> Novo cliente
            </Button>
          </div>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Razão social</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Regime</th>
              <th className="px-4 py-3">Honorário</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-12"></th>
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
              clientes.map((c) => (
                <tr key={c.id_cliente} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${c.id_cliente}`}
                      className="font-medium text-gray-900 hover:text-verde-dark"
                    >
                      {c.razao_social}
                    </Link>
                    {c.nome_fantasia && (
                      <div className="text-xs text-gray-500">{c.nome_fantasia}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {formatCNPJ(c.cnpj)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {REGIME_LABEL[c.regime] ?? c.regime}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatBRL(c.honorario_mensal)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_TONE[c.status] ?? "bg-gray-100"}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => editar(c)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                      aria-label="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            {!isLoading && clientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ClienteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cliente={editing}
      />
    </div>
  );
}

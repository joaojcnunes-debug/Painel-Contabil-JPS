"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Edit2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { CatalogoFormModal } from "@/components/obrigacoes/CatalogoFormModal";
import { useObrigacoesCatalogo } from "@/lib/hooks/useObrigacoes";
import { useUserStore } from "@/lib/store";
import type { ObrigacaoCatalogo } from "@/lib/supabase/types";

const ESFERA_TONE: Record<string, string> = {
  FEDERAL: "bg-verde-light text-verde-dark",
  ESTADUAL: "bg-blue-100 text-blue-800",
  MUNICIPAL: "bg-amber-100 text-amber-800",
  TRABALHISTA: "bg-purple-100 text-purple-800",
};

export default function CatalogoPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const { data: items = [], isLoading } = useObrigacoesCatalogo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ObrigacaoCatalogo | null>(null);

  function novo() {
    setEditing(null);
    setOpen(true);
  }
  function editar(it: ObrigacaoCatalogo) {
    setEditing(it);
    setOpen(true);
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Catálogo de obrigações" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas administradores podem gerenciar o catálogo.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/obrigacoes"
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para obrigações
        </Link>
      </div>
      <PageHeader
        title="Catálogo de obrigações"
        subtitle="Base usada pelo gerador mensal e pelo lançamento manual"
        actions={
          <Button onClick={novo} className="flex items-center gap-2">
            <Plus size={16} /> Novo item
          </Button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Sigla</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Esfera</th>
              <th className="px-4 py-3">Periodicidade</th>
              <th className="px-4 py-3">Dia venc.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading &&
              items.map((it) => (
                <tr key={it.id_obrigacao_catalogo} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-verde-dark">
                    {it.sigla}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{it.nome}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${ESFERA_TONE[it.esfera] ?? "bg-gray-100"}`}
                    >
                      {it.esfera}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{it.periodicidade}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {it.dia_vencimento_padrao ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {it.ativo ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-verde-light text-verde-dark">
                        Ativo
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => editar(it)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                      aria-label="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <CatalogoFormModal
        open={open}
        onClose={() => setOpen(false)}
        item={editing}
      />
    </div>
  );
}

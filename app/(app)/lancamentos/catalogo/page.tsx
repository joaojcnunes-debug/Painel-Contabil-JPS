"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Edit2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { usePlanoContas } from "@/lib/hooks/useLancamentos";
import { useUserStore } from "@/lib/store";
import type { PlanoConta } from "@/lib/supabase/types";

const PlanoContaFormModal = dynamic(
  () =>
    import("@/components/lancamentos/PlanoContaFormModal").then((m) => ({
      default: m.PlanoContaFormModal,
    })),
  { ssr: false }
);

const TIPO_TONE: Record<string, string> = {
  RECEITA: "bg-verde-light text-verde-dark",
  DESPESA: "bg-red-100 text-red-700",
};

export default function PlanoContasPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const { data: contas = [], isLoading } = usePlanoContas();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanoConta | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, PlanoConta[]>();
    for (const c of contas) {
      const g = c.grupo ?? "Sem grupo";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [contas]);

  function novo() {
    setEditing(null);
    setOpen(true);
  }
  function editar(c: PlanoConta) {
    setEditing(c);
    setOpen(true);
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Plano de contas" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas administradores podem gerenciar o plano de contas.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/lancamentos"
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para lançamentos
        </Link>
      </div>

      <PageHeader
        title="Plano de contas"
        subtitle="Catálogo de categorias usado nos lançamentos e no DRE"
        actions={
          <Button onClick={novo} className="flex items-center gap-2">
            <Plus size={16} /> Nova conta
          </Button>
        }
      />

      {isLoading && (
        <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
          Carregando…
        </div>
      )}

      <div className="space-y-4">
        {grupos.map(([nomeGrupo, lista]) => (
          <div
            key={nomeGrupo}
            className="bg-white border border-card-border rounded-xl overflow-hidden"
          >
            <div className="px-4 py-2 bg-gray-50 border-b border-card-border flex items-center justify-between">
              <h3 className="font-serif text-sm font-semibold text-verde-dark">
                {nomeGrupo}
              </h3>
              <span className="text-xs text-gray-500">
                {lista.length} conta{lista.length !== 1 && "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-gray-500 text-xs uppercase">
                  <tr className="border-b border-card-border">
                    <th className="px-4 py-2 text-left w-24">Código</th>
                    <th className="px-4 py-2 text-left">Nome</th>
                    <th className="px-4 py-2 text-left w-28">Tipo</th>
                    <th className="px-4 py-2 text-left w-24">Status</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {lista
                    .sort((a, b) => a.codigo.localeCompare(b.codigo))
                    .map((c) => (
                      <tr key={c.id_conta} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">
                          {c.codigo}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{c.nome}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${TIPO_TONE[c.tipo] ?? "bg-gray-100"}`}
                          >
                            {c.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {c.ativo ? (
                            <span className="text-xs text-verde-dark">
                              Ativa
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Inativa
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => editar(c)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                            aria-label="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <PlanoContaFormModal
        open={open}
        onClose={() => setOpen(false)}
        conta={editing}
      />
    </div>
  );
}

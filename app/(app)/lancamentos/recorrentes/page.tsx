"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Edit2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useClientes } from "@/lib/hooks/useClientes";
import {
  useLancamentosModelos,
  usePlanoContas,
  type LancamentoModeloComJoin,
} from "@/lib/hooks/useLancamentos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import type { LancamentoModelo } from "@/lib/supabase/types";

const LancamentoModeloFormModal = dynamic(
  () =>
    import("@/components/lancamentos/LancamentoModeloFormModal").then((m) => ({
      default: m.LancamentoModeloFormModal,
    })),
  { ssr: false }
);
const GeradorLancamentosModal = dynamic(
  () =>
    import("@/components/lancamentos/GeradorLancamentosModal").then((m) => ({
      default: m.GeradorLancamentosModal,
    })),
  { ssr: false }
);

export default function RecorrentesPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: modelos = [], isLoading } = useLancamentosModelos();
  const { data: clientes = [] } = useClientes();
  const { data: contas = [] } = usePlanoContas();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LancamentoModelo | null>(null);
  const [gerOpen, setGerOpen] = useState(false);

  const qc = useQueryClient();
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("lancamentos_modelos")
        .delete()
        .eq("id_modelo", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancamentos-modelos"] });
      toast.success("Modelo removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function novo() {
    setEditing(null);
    setFormOpen(true);
  }
  function editar(m: LancamentoModeloComJoin) {
    setEditing(m);
    setFormOpen(true);
  }

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Lançamentos recorrentes" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode gerenciar lançamentos recorrentes.
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
        title="Lançamentos recorrentes"
        subtitle="Modelos fixos que se repetem todo mês"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setGerOpen(true)}
              className="flex items-center gap-2"
              disabled={modelos.filter((m) => m.ativo).length === 0}
            >
              <Sparkles size={16} /> Gerar mês
            </Button>
            <Button onClick={novo} className="flex items-center gap-2">
              <Plus size={16} /> Novo modelo
            </Button>
          </div>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-16">Dia</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Conta</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 w-20">Status</th>
              <th className="px-4 py-3 w-24"></th>
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
              modelos.map((m) => (
                <tr key={m.id_modelo} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 text-center font-mono">
                    {String(m.dia_mes).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {m.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-xs font-mono">
                      {m.plano_contas?.codigo}
                    </div>
                    <div>{m.plano_contas?.nome}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{m.descricao}</td>
                  <td
                    className={
                      m.tipo === "RECEITA"
                        ? "px-4 py-3 text-right font-medium text-verde-dark whitespace-nowrap"
                        : "px-4 py-3 text-right font-medium text-red-alert whitespace-nowrap"
                    }
                  >
                    {m.tipo === "RECEITA" ? "+" : "−"}{" "}
                    {formatBRL(Number(m.valor))}
                  </td>
                  <td className="px-4 py-3">
                    {m.ativo ? (
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => editar(m)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                        aria-label="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover modelo "${m.descricao}"?`)) {
                            excluir.mutate(m.id_modelo);
                          }
                        }}
                        disabled={excluir.isPending}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-alert"
                        aria-label="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && modelos.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  Nenhum modelo cadastrado.{" "}
                  <button
                    onClick={novo}
                    className="text-gold hover:text-verde-dark"
                  >
                    Criar o primeiro
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LancamentoModeloFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        modelo={editing}
        clientes={clientes}
        contas={contas}
      />
      <GeradorLancamentosModal
        open={gerOpen}
        onClose={() => setGerOpen(false)}
        modelos={modelos}
      />
    </div>
  );
}

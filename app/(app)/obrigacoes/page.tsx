"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Check,
  Edit2,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { inputClass } from "@/components/ui/Field";
import { ObrigacaoFormModal } from "@/components/obrigacoes/ObrigacaoFormModal";
import { GeradorMesModal } from "@/components/obrigacoes/GeradorMesModal";
import { useClientes } from "@/lib/hooks/useClientes";
import {
  useObrigacoes,
  useObrigacoesCatalogo,
  type ObrigacaoComJoin,
} from "@/lib/hooks/useObrigacoes";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { csvData } from "@/lib/csv";
import type { Obrigacao } from "@/lib/supabase/types";

const STATUS_STYLE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ObrigacoesPage() {
  return (
    <Suspense fallback={null}>
      <ObrigacoesInner />
    </Suspense>
  );
}

function ObrigacoesInner() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const sp = useSearchParams();

  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [idCliente, setIdCliente] = useState(sp.get("cliente") ?? "");

  const { data: obrigacoes = [], isLoading } = useObrigacoes({
    competencia,
    status: status || undefined,
    idCliente: idCliente || undefined,
  });
  const { data: clientes = [] } = useClientes();
  const { data: catalogo = [] } = useObrigacoesCatalogo();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Obrigacao | null>(null);
  const [gerOpen, setGerOpen] = useState(false);

  const qc = useQueryClient();
  const marcarEntregue = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .update({
          status: "ENTREGUE",
          data_entrega: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_obrigacao", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      toast.success("Marcada como entregue");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desmarcarEntrega = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .update({
          status: "PENDENTE",
          data_entrega: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_obrigacao", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      toast.success("Entrega desfeita — voltou pra pendente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes")
        .delete()
        .eq("id_obrigacao", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      toast.success("Obrigação excluída");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function novo() {
    setEditing(null);
    setFormOpen(true);
  }
  function editar(o: ObrigacaoComJoin) {
    setEditing(o);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Obrigações"
        subtitle="Calendário fiscal dos clientes"
        actions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={obrigacoes}
              filename={`obrigacoes-${competencia || "geral"}.csv`}
              columns={[
                { header: "Cliente", value: (o) => o.clientes?.razao_social },
                { header: "Sigla", value: (o) => o.obrigacoes_catalogo?.sigla },
                { header: "Obrigação", value: (o) => o.obrigacoes_catalogo?.nome },
                { header: "Esfera", value: (o) => o.obrigacoes_catalogo?.esfera },
                { header: "Competência", value: (o) => o.competencia },
                { header: "Vencimento", value: (o) => csvData(o.data_vencimento) },
                { header: "Entrega", value: (o) => csvData(o.data_entrega) },
                { header: "Status", value: (o) => o.status },
                { header: "Responsável", value: (o) => o.responsavel },
              ]}
            />
            <Link
              href={`/obrigacoes/calendario${idCliente ? `?cliente=${idCliente}` : ""}`}
              className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
            >
              <CalendarDays size={14} /> Calendário
            </Link>
            {isAdmin && (
              <Link
                href="/obrigacoes/catalogo"
                className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
              >
                <Settings2 size={14} /> Catálogo
              </Link>
            )}
            <Button
              variant="secondary"
              onClick={() => setGerOpen(true)}
              className="flex items-center gap-2"
            >
              <Sparkles size={16} /> Gerar mês
            </Button>
            <Button onClick={novo} className="flex items-center gap-2">
              <Plus size={16} /> Nova obrigação
            </Button>
          </div>
        }
      />

      {/* Filtros */}
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
            <option value="PENDENTE">Pendente</option>
            <option value="EM_ANDAMENTO">Em andamento</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="ATRASADA">Atrasada</option>
            <option value="DISPENSADA">Dispensada</option>
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {obrigacoes.length} resultado{obrigacoes.length !== 1 && "s"}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Obrigação</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-32"></th>
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
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {o.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <Link
                      href={`/obrigacoes/${o.id_obrigacao}`}
                      className="hover:text-verde-dark"
                    >
                      <span className="font-mono text-xs text-verde-dark mr-2 font-bold">
                        {o.obrigacoes_catalogo?.sigla ?? "—"}
                      </span>
                      {o.obrigacoes_catalogo?.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.competencia}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(o.data_vencimento)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[o.status] ?? "bg-gray-100"}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {o.status !== "ENTREGUE" ? (
                        <button
                          onClick={() => marcarEntregue.mutate(o.id_obrigacao)}
                          disabled={marcarEntregue.isPending}
                          className="p-1.5 rounded hover:bg-verde-light text-verde-dark"
                          title="Marcar como entregue"
                          aria-label="Marcar como entregue"
                        >
                          <Check size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => desmarcarEntrega.mutate(o.id_obrigacao)}
                          disabled={desmarcarEntrega.isPending}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-700"
                          title="Desmarcar como entregue (volta pra pendente)"
                          aria-label="Desmarcar como entregue"
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => editar(o)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            const nome =
                              `${o.obrigacoes_catalogo?.sigla ?? ""} • ${o.clientes?.razao_social ?? ""} • ${o.competencia}`.trim();
                            if (
                              confirm(
                                `Excluir esta obrigação?\n\n${nome}\n\nEssa ação não pode ser desfeita.`
                              )
                            ) {
                              excluir.mutate(o.id_obrigacao);
                            }
                          }}
                          disabled={excluir.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-alert"
                          title="Excluir"
                          aria-label="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && obrigacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhuma obrigação lançada para esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ObrigacaoFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        obrigacao={editing}
        clientes={clientes}
        catalogo={catalogo}
      />
      <GeradorMesModal
        open={gerOpen}
        onClose={() => setGerOpen(false)}
        clientes={clientes}
        catalogo={catalogo}
      />
    </div>
  );
}

"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, Edit2, Plus, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { inputClass } from "@/components/ui/Field";
import { FaturaFormModal } from "@/components/faturas/FaturaFormModal";
import { GeradorFaturasModal } from "@/components/faturas/GeradorFaturasModal";
import { useClientes } from "@/lib/hooks/useClientes";
import { useFaturas, type FaturaComCliente } from "@/lib/hooks/useFaturas";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { csvData, csvMoeda } from "@/lib/csv";
import type { Fatura, StatusFatura } from "@/lib/supabase/types";

const STATUS_STYLE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-700",
  PAGA: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-500",
};

const STATUSES: StatusFatura[] = ["ABERTA", "PAGA", "ATRASADA", "CANCELADA"];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function HonorariosPage() {
  return (
    <Suspense fallback={null}>
      <HonorariosInner />
    </Suspense>
  );
}

function HonorariosInner() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const sp = useSearchParams();

  // Default: sem filtro de competência (mostra tudo). Usuario pode escolher
  // ou clicar em "Mês atual" pra filtrar rápido.
  const [competencia, setCompetencia] = useState(sp.get("competencia") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [idCliente, setIdCliente] = useState(sp.get("cliente") ?? "");

  const { data: clientes = [] } = useClientes();
  const { data: faturas = [], isLoading } = useFaturas({
    competencia: competencia || undefined,
    status: status || undefined,
    idCliente: idCliente || undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fatura | null>(null);
  const [gerOpen, setGerOpen] = useState(false);

  const stats = useMemo(() => {
    let aberto = 0;
    let pago = 0;
    let atrasadas = 0;
    for (const f of faturas) {
      const v = Number(f.valor ?? 0);
      if (f.status === "PAGA") pago += v;
      else if (f.status === "ABERTA" || f.status === "ATRASADA") aberto += v;
      if (f.status === "ATRASADA") atrasadas += 1;
    }
    return { aberto, pago, atrasadas };
  }, [faturas]);

  const qc = useQueryClient();

  const marcarPaga = useMutation({
    mutationFn: async (f: FaturaComCliente) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("faturas")
        .update({
          status: "PAGA",
          data_pagamento: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_fatura", f.id_fatura);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faturas"] });
      toast.success("Fatura marcada como paga");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (f: FaturaComCliente) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("faturas")
        .update({
          status: "CANCELADA",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_fatura", f.id_fatura);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faturas"] });
      toast.success("Fatura cancelada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function novo() {
    setEditing(null);
    setFormOpen(true);
  }
  function editar(f: FaturaComCliente) {
    setEditing(f);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Honorários"
        subtitle="Cobrança recorrente e faturas"
        actions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={faturas}
              filename={`faturas-${competencia || "geral"}.csv`}
              columns={[
                { header: "Cliente", value: (f) => f.clientes?.razao_social },
                { header: "Competência", value: (f) => f.competencia },
                { header: "Vencimento", value: (f) => csvData(f.data_vencimento) },
                { header: "Pagamento", value: (f) => csvData(f.data_pagamento) },
                { header: "Valor (R$)", value: (f) => csvMoeda(Number(f.valor)) },
                { header: "Status", value: (f) => f.status },
                { header: "Descrição", value: (f) => f.descricao },
              ]}
            />
            <Button
              variant="secondary"
              onClick={() => setGerOpen(true)}
              className="flex items-center gap-2"
            >
              <Sparkles size={16} /> Gerar mês
            </Button>
            <Button onClick={novo} className="flex items-center gap-2">
              <Plus size={16} /> Nova fatura
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">A receber</div>
          <div className="mt-2 text-2xl font-bold text-verde-dark">
            {formatBRL(stats.aberto)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Recebido</div>
          <div className="mt-2 text-2xl font-bold text-gray-800">
            {formatBRL(stats.pago)}
          </div>
        </div>
        <div className="bg-white border border-card-border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Em atraso</div>
          <div className="mt-2 text-2xl font-bold text-red-alert">
            {stats.atrasadas}
          </div>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Competência
          </label>
          <div className="flex gap-1 items-center">
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
            {competencia && (
              <button
                type="button"
                onClick={() => setCompetencia("")}
                className="text-xs text-gray-500 hover:text-verde-dark px-2"
                title="Limpar"
              >
                ×
              </button>
            )}
            {!competencia && (
              <button
                type="button"
                onClick={() => setCompetencia(competenciaAtual())}
                className="text-xs text-gold hover:text-verde-dark px-2 whitespace-nowrap"
              >
                Mês atual
              </button>
            )}
          </div>
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
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
          {faturas.length} fatura{faturas.length !== 1 && "s"}
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-32"></th>
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
              faturas.map((f) => (
                <tr key={f.id_fatura} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {f.clientes?.razao_social ?? "—"}
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
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {f.status !== "PAGA" && f.status !== "CANCELADA" && (
                        <button
                          onClick={() => marcarPaga.mutate(f)}
                          disabled={marcarPaga.isPending}
                          className="p-1.5 rounded hover:bg-verde-light text-verde-dark"
                          title="Marcar como paga"
                          aria-label="Marcar como paga"
                        >
                          <Check size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => editar(f)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      {isAdmin && f.status !== "CANCELADA" && (
                        <button
                          onClick={() => {
                            if (confirm("Cancelar essa fatura?"))
                              cancelar.mutate(f);
                          }}
                          disabled={cancelar.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-alert"
                          title="Cancelar"
                          aria-label="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && faturas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhuma fatura para esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FaturaFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        fatura={editing}
        clientes={clientes}
      />
      <GeradorFaturasModal
        open={gerOpen}
        onClose={() => setGerOpen(false)}
        clientes={clientes}
      />
    </div>
  );
}

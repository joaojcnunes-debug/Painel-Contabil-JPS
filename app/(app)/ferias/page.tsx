"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  FileText,
  Pencil,
  Plane,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useFuncionarios } from "@/lib/hooks/useFuncionarios";
import { useFerias } from "@/lib/hooks/useFerias";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { STATUS_FERIAS_LABEL } from "@/lib/ferias";
import { formatBRL, formatDate } from "@/lib/utils";
import type { Ferias } from "@/lib/supabase/types";

const FeriasFormModal = dynamic(
  () =>
    import("@/components/ferias/FeriasFormModal").then((m) => ({
      default: m.FeriasFormModal,
    })),
  { ssr: false }
);

export default function FeriasPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  const { data: funcionarios = [] } = useFuncionarios({
    idCliente: idCliente || undefined,
  });

  const { data: ferias = [], isLoading } = useFerias({
    idCliente: idCliente || undefined,
    status: statusFiltro || undefined,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [feriasEdit, setFeriasEdit] = useState<Ferias | null>(null);

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("ferias")
        .delete()
        .eq("id_ferias", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ferias"] });
      toast.success("Férias removidas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Férias" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode programar férias.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Férias"
        subtitle="Programação e cálculo com 1/3 constitucional, abono pecuniário, INSS e IRRF"
        actions={
          <Button
            onClick={() => {
              setFeriasEdit(null);
              setModalOpen(true);
            }}
            disabled={funcionarios.length === 0}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> Programar férias
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Valor indicativo.</strong> Faltas reduzem dias de direito
          (0-5: 30 / 6-14: 24 / 15-23: 18 / 24-32: 12 / +32: 0). Abono
          pecuniário (10 dias) é isento de INSS/IRRF. Pagamento deve
          ocorrer em até 2 dias antes do início do gozo.
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[260px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
          >
            <option value="">Todas</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Status
          </label>
          <select
            className={`${inputClass} min-w-[160px]`}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="PROGRAMADA">Programada</option>
            <option value="EM_GOZO">Em gozo</option>
            <option value="PAGA">Paga</option>
            <option value="ENCERRADA">Encerrada</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Funcionário</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Período aquisitivo</th>
              <th className="px-4 py-3">Gozo</th>
              <th className="px-4 py-3 text-center">Dias</th>
              <th className="px-4 py-3 text-right">Bruto</th>
              <th className="px-4 py-3 text-right">Líquido</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && ferias.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                  <Plane size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhuma férias programada. Clique em &quot;Programar férias&quot;
                  pra começar.
                </td>
              </tr>
            )}
            {ferias.map((f) => {
              const st = STATUS_FERIAS_LABEL[f.status] ?? {
                label: f.status,
                cls: "bg-gray-100 text-gray-700",
              };
              return (
                <tr key={f.id_ferias} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{f.nome_func}</div>
                    {f.cargo_func && (
                      <div className="text-[11px] text-gray-500">
                        {f.cargo_func}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {f.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {formatDate(f.periodo_aquisitivo_inicio)} →{" "}
                    {formatDate(f.periodo_aquisitivo_fim)}
                    {f.faltas_periodo > 0 && (
                      <div className="text-[10px] text-amber-700">
                        {f.faltas_periodo} falta(s) • direito a {f.dias_direito}d
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    {formatDate(f.data_inicio_gozo)} →{" "}
                    {formatDate(f.data_fim_gozo)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-700 whitespace-nowrap">
                    <strong>{f.dias_gozados}</strong>
                    {f.dias_abono > 0 && (
                      <div className="text-[10px] text-gold">+ {f.dias_abono} abono</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                    {formatBRL(Number(f.total_bruto))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(f.liquido))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/ferias/recibo/${f.id_ferias}`}
                        className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium px-2"
                      >
                        <FileText size={12} /> Recibo
                      </Link>
                      <button
                        onClick={() => {
                          setFeriasEdit(f);
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-400 hover:text-verde-dark"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(`Remover férias de ${f.nome_func}?`)
                          )
                            excluir.mutate(f.id_ferias);
                        }}
                        className="p-1 text-gray-400 hover:text-red-alert"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FeriasFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ferias={feriasEdit}
        funcionarios={funcionarios}
        idClienteDefault={idCliente || undefined}
      />
    </div>
  );
}

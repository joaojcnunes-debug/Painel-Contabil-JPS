"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Edit2,
  FileBarChart2,
  Plus,
  Repeat,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import {
  useLancamentos,
  usePlanoContas,
  type LancamentoComJoin,
} from "@/lib/hooks/useLancamentos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { csvData, csvMoeda } from "@/lib/csv";
import type { Lancamento } from "@/lib/supabase/types";

const LancamentoFormModal = dynamic(
  () =>
    import("@/components/lancamentos/LancamentoFormModal").then((m) => ({
      default: m.LancamentoFormModal,
    })),
  { ssr: false }
);

function primeiroDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}
function ultimoDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

export default function LancamentosPage() {
  return (
    <Suspense fallback={null}>
      <LancamentosInner />
    </Suspense>
  );
}

function LancamentosInner() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";
  const sp = useSearchParams();

  const [idCliente, setIdCliente] = useState(sp.get("cliente") ?? "");
  const [idConta, setIdConta] = useState("");
  const [tipo, setTipo] = useState("");
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes());
  const [dataFim, setDataFim] = useState(ultimoDiaMes());

  const { data: clientes = [] } = useClientes();
  const { data: contas = [] } = usePlanoContas(false);
  const { data: lancamentos = [], isLoading } = useLancamentos({
    idCliente: idCliente || undefined,
    idConta: idConta || undefined,
    tipo: tipo || undefined,
    dataInicio,
    dataFim,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);

  const qc = useQueryClient();
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("lancamentos")
        .delete()
        .eq("id_lancamento", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Lançamento excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    for (const l of lancamentos) {
      const v = Number(l.valor ?? 0);
      if (l.tipo === "RECEITA") receitas += v;
      else despesas += v;
    }
    return { receitas, despesas, saldo: receitas - despesas };
  }, [lancamentos]);

  function novo() {
    setEditing(null);
    setFormOpen(true);
  }
  function editar(l: LancamentoComJoin) {
    setEditing(l);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Lançamentos contábeis"
        subtitle="Receitas e despesas por cliente"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/lancamentos/dre${idCliente ? `?cliente=${idCliente}` : ""}`}
              className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
            >
              <FileBarChart2 size={14} /> DRE
            </Link>
            {isEquipe && (
              <Link
                href="/lancamentos/recorrentes"
                className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
              >
                <Repeat size={14} /> Recorrentes
              </Link>
            )}
            {user?.perfil === "Admin" && (
              <Link
                href="/lancamentos/catalogo"
                className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
              >
                <Settings2 size={14} /> Plano de contas
              </Link>
            )}
            <ExportCsvButton
              rows={lancamentos}
              filename={`lancamentos-${dataInicio}_${dataFim}.csv`}
              columns={[
                { header: "Data", value: (l) => csvData(l.data_lancamento) },
                { header: "Tipo", value: (l) => l.tipo },
                { header: "Cliente", value: (l) => l.clientes?.razao_social },
                { header: "Código conta", value: (l) => l.plano_contas?.codigo },
                { header: "Conta", value: (l) => l.plano_contas?.nome },
                { header: "Descrição", value: (l) => l.descricao },
                { header: "Documento", value: (l) => l.documento_ref },
                { header: "Valor (R$)", value: (l) => csvMoeda(Number(l.valor)) },
              ]}
            />
            {isEquipe && (
              <Button onClick={novo} className="flex items-center gap-2">
                <Plus size={16} /> Novo lançamento
              </Button>
            )}
          </div>
        }
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <CardResumo
          label="Receitas no período"
          value={stats.receitas}
          icon={ArrowUpCircle}
          tone="verde"
        />
        <CardResumo
          label="Despesas no período"
          value={stats.despesas}
          icon={ArrowDownCircle}
          tone="red"
        />
        <CardResumo
          label="Saldo"
          value={stats.saldo}
          icon={Wallet}
          tone={stats.saldo >= 0 ? "verde" : "red"}
        />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            De
          </label>
          <input
            type="date"
            className={inputClass}
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Até
          </label>
          <input
            type="date"
            className={inputClass}
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
        <div className="min-w-[180px]">
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
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Tipo
          </label>
          <select
            className={inputClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Conta
          </label>
          <select
            className={inputClass}
            value={idConta}
            onChange={(e) => setIdConta(e.target.value)}
          >
            <option value="">Todas</option>
            {contas
              .filter((c) => !tipo || c.tipo === tipo)
              .map((c) => (
                <option key={c.id_conta} value={c.id_conta}>
                  {c.codigo} {c.nome}
                </option>
              ))}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {lancamentos.length} lançament
          {lancamentos.length === 1 ? "o" : "os"}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Conta</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 w-24"></th>
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
              lancamentos.map((l) => (
                <tr key={l.id_lancamento} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(l.data_lancamento)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {l.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-xs font-mono">
                      {l.plano_contas?.codigo}
                    </div>
                    <div>{l.plano_contas?.nome}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {l.descricao}
                    {l.documento_ref && (
                      <div className="text-xs text-gray-500">
                        Doc: {l.documento_ref}
                      </div>
                    )}
                  </td>
                  <td
                    className={
                      l.tipo === "RECEITA"
                        ? "px-4 py-3 text-right font-medium text-verde-dark whitespace-nowrap"
                        : "px-4 py-3 text-right font-medium text-red-alert whitespace-nowrap"
                    }
                  >
                    {l.tipo === "RECEITA" ? "+" : "−"}{" "}
                    {formatBRL(Number(l.valor))}
                  </td>
                  <td className="px-4 py-3">
                    {isEquipe && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => editar(l)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                          aria-label="Editar"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Excluir lançamento "${l.descricao}"?`
                              )
                            ) {
                              excluir.mutate(l.id_lancamento);
                            }
                          }}
                          disabled={excluir.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-alert"
                          aria-label="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            {!isLoading && lancamentos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum lançamento no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LancamentoFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        lancamento={editing}
        clientes={clientes}
        contas={contas}
      />
    </div>
  );
}

function CardResumo({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: "verde" | "red";
}) {
  const cls = tone === "verde" ? "text-verde-dark" : "text-red-alert";
  return (
    <div className="bg-white border border-card-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        <Icon className="text-gold" size={20} />
      </div>
      <div className={`mt-2 text-2xl font-bold ${cls}`}>
        {formatBRL(value)}
      </div>
    </div>
  );
}

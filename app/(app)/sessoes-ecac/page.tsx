"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useSessoesEcac } from "@/lib/hooks/useSessoesEcac";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { AbrirEcacButton } from "@/components/sessoes-ecac/AbrirEcacButton";
import type { PendenciaEcac, SessaoEcac } from "@/lib/supabase/types";

const SessaoEcacFormModal = dynamic(
  () =>
    import("@/components/sessoes-ecac/SessaoEcacFormModal").then((m) => ({
      default: m.SessaoEcacFormModal,
    })),
  { ssr: false }
);

const SITUACAO_CLS: Record<string, { label: string; cls: string }> = {
  REGULAR: { label: "Regular", cls: "bg-green-100 text-green-700" },
  PENDENTE: { label: "Pendência", cls: "bg-amber-100 text-amber-800" },
  INDETERMINADO: { label: "Indeterminado", cls: "bg-gray-100 text-gray-700" },
};

export default function SessoesEcacPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [editando, setEditando] = useState<SessaoEcac | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: sessoes = [], isLoading } = useSessoesEcac({
    idCliente: idCliente || undefined,
    situacao: situacaoFiltro || undefined,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sessoes_ecac")
        .delete()
        .eq("id_sessao", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessoes-ecac"] });
      toast.success("Sessão removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Sessões e-CAC" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sessões e-CAC"
        subtitle="Histórico de acessos manuais ao e-CAC e o que foi encontrado"
        actions={
          idCliente && (
            <AbrirEcacButton
              idCliente={idCliente}
              label="Abrir e-CAC do cliente"
            />
          )
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-900 flex items-start gap-2">
        <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Como funciona:</strong> selecione a empresa, clique em &quot;Abrir
          e-CAC&quot; — abre o site da Receita em pop-up usando o seu navegador
          (com seu cert digital instalado, login gov.br, etc.). Quando
          terminar, registre aqui o que encontrou. Vira histórico vinculado
          ao cliente.
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
            Situação
          </label>
          <select
            className={`${inputClass} min-w-[160px]`}
            value={situacaoFiltro}
            onChange={(e) => setSituacaoFiltro(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="REGULAR">Regular</option>
            <option value="PENDENTE">Com pendência</option>
            <option value="INDETERMINADO">Indeterminado</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-28">Data</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3 text-center">Caixa</th>
              <th className="px-4 py-3 text-center">Pendências</th>
              <th className="px-4 py-3 text-center">Duração</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && sessoes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                  <ClipboardList size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhuma sessão e-CAC registrada ainda.
                  {idCliente && (
                    <div className="mt-2">
                      Clique em &quot;Abrir e-CAC do cliente&quot; no topo pra começar.
                    </div>
                  )}
                </td>
              </tr>
            )}
            {sessoes.map((s) => {
              const sit = s.situacao_fiscal
                ? SITUACAO_CLS[s.situacao_fiscal]
                : null;
              const pend = Array.isArray(s.pendencias) ? (s.pendencias as PendenciaEcac[]) : [];
              return (
                <tr key={s.id_sessao} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {formatDate(s.iniciada_em)}
                    <div className="text-[10px] text-gray-400">
                      {new Date(s.iniciada_em).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {s.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {sit ? (
                      <span
                        className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full inline-flex items-center gap-1 ${sit.cls}`}
                      >
                        {sit.label === "Regular" ? (
                          <CheckCircle2 size={10} />
                        ) : sit.label === "Pendência" ? (
                          <AlertTriangle size={10} />
                        ) : null}
                        {sit.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {s.mensagens_nao_lidas != null && s.mensagens_nao_lidas > 0 ? (
                      <span className="font-bold text-amber-700">
                        {s.mensagens_nao_lidas}
                      </span>
                    ) : s.mensagens_nao_lidas === 0 ? (
                      <span className="text-green-700">0</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {pend.length > 0 ? (
                      <span
                        className="font-bold text-amber-700"
                        title={pend.map((p) => p.tipo).join(", ")}
                      >
                        {pend.length}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {s.duracao_minutos != null ? `${s.duracao_minutos} min` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {s.usuario_nome ?? s.usuario_email}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditando(s);
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-400 hover:text-verde-dark"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Remover sessão?"))
                            excluir.mutate(s.id_sessao);
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

      <SessaoEcacFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditando(null);
        }}
        sessao={editando}
        idCliente={editando?.id_cliente ?? idCliente}
      />
    </div>
  );
}

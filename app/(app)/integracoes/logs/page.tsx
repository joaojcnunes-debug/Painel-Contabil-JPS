"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useIntegracoesLogs } from "@/lib/hooks/useIntegracoesLogs";
import { useUserStore } from "@/lib/store";
import { MODULOS } from "@/lib/integracoes/core/registry";
import { formatDate } from "@/lib/utils";

function ConteudoLogs() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const searchParams = useSearchParams();
  const moduloInicial = searchParams.get("modulo") ?? "";

  const [idCliente, setIdCliente] = useState("");
  const [modulo, setModulo] = useState(moduloInicial);
  const [status, setStatus] = useState("");

  const { data: clientes = [] } = useClientes();
  const { data: logs = [], isLoading } = useIntegracoesLogs({
    idCliente: idCliente || undefined,
    modulo: modulo || undefined,
    status: status || undefined,
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Logs de integrações" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar logs.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/integracoes"
          className="text-sm text-gray-600 hover:text-verde-dark flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>

      <PageHeader
        title="Logs de integrações"
        subtitle="Histórico de chamadas a APIs governamentais (simuladas e reais)"
      />

      <div className="bg-white border border-card-border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-end">
        <select
          className={`${inputClass} max-w-[240px]`}
          value={idCliente}
          onChange={(e) => setIdCliente(e.target.value)}
        >
          <option value="">Todas empresas</option>
          {clientes.map((c) => (
            <option key={c.id_cliente} value={c.id_cliente}>
              {c.razao_social}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} max-w-[220px]`}
          value={modulo}
          onChange={(e) => setModulo(e.target.value)}
        >
          <option value="">Todos os módulos</option>
          {MODULOS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.curto}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} max-w-[140px]`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="OK">OK</option>
          <option value="ERRO">Erro</option>
        </select>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-3 py-3 w-32">Data/hora</th>
              <th className="px-3 py-3">Módulo / Ação</th>
              <th className="px-3 py-3">Empresa</th>
              <th className="px-3 py-3 w-24">Modo</th>
              <th className="px-3 py-3 w-20">Status</th>
              <th className="px-3 py-3 w-20 text-right">Duração</th>
              <th className="px-3 py-3">Mensagem</th>
              <th className="px-3 py-3">Usuário</th>
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
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                  <History size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhum log encontrado nesses filtros.
                </td>
              </tr>
            )}
            {logs.map((l) => {
              const meta = MODULOS.find((m) => m.id === l.modulo);
              return (
                <tr key={l.id_log} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {formatDate(l.created_at)}
                    <div className="text-[10px] text-gray-400">
                      {new Date(l.created_at).toLocaleTimeString("pt-BR")}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium text-gray-800">
                      {meta?.curto ?? l.modulo}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {l.acao}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {l.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                        l.modo === "REAL"
                          ? "bg-verde-dark text-white"
                          : "bg-gold/20 text-amber-900 border border-gold/40"
                      }`}
                    >
                      {l.modo === "REAL" ? "Real" : "Simulado"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        l.status === "OK"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-alert"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-gray-500">
                    {l.duracao_ms != null ? `${l.duracao_ms}ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-600 max-w-md">
                    {l.erro_mensagem ? (
                      <span className="text-red-alert">{l.erro_mensagem}</span>
                    ) : (
                      <span className="truncate block">
                        {typeof l.response_resumo === "object" &&
                        l.response_resumo &&
                        "mensagens" in l.response_resumo
                          ? String(
                              (l.response_resumo as { mensagens: string[] })
                                .mensagens?.[0] ?? "—"
                            )
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {l.usuario_nome ?? l.usuario_email ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Logs de integrações" />
        </div>
      }
    >
      <ConteudoLogs />
    </Suspense>
  );
}

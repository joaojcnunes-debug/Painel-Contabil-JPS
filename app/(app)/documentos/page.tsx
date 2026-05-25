"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Download, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { DocumentoUploadModal } from "@/components/documentos/DocumentoUploadModal";
import { useClientes } from "@/lib/hooks/useClientes";
import { useDocumentos } from "@/lib/hooks/useDocumentos";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import type { Documento, StatusDocumento } from "@/lib/supabase/types";

const STATUS_STYLE: Record<string, string> = {
  RECEBIDO: "bg-blue-100 text-blue-700",
  EM_ANALISE: "bg-amber-100 text-amber-800",
  PROCESSADO: "bg-verde-light text-verde-dark",
  DEVOLVIDO: "bg-red-100 text-red-700",
};

const STATUSES: StatusDocumento[] = [
  "RECEBIDO",
  "EM_ANALISE",
  "PROCESSADO",
  "DEVOLVIDO",
];

export default function DocumentosPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";

  const [idCliente, setIdCliente] = useState("");
  const [status, setStatus] = useState("");

  const { data: clientes = [] } = useClientes();
  const { data: docs = [], isLoading } = useDocumentos({
    idCliente: idCliente || undefined,
    status: status || undefined,
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const qc = useQueryClient();

  const trocarStatus = useMutation({
    mutationFn: async ({
      id,
      novoStatus,
    }: {
      id: string;
      novoStatus: StatusDocumento;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("documentos")
        .update({ status: novoStatus } as never)
        .eq("id_documento", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (doc: Documento) => {
      const supabase = createSupabaseBrowserClient();
      const { error: errStor } = await supabase.storage
        .from("documentos")
        .remove([doc.arquivo_path]);
      if (errStor && errStor.message !== "Object not found") throw errStor;
      const { error: errDb } = await supabase
        .from("documentos")
        .delete()
        .eq("id_documento", doc.id_documento);
      if (errDb) throw errDb;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documentos"] });
      toast.success("Documento excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function baixar(doc: Documento) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(doc.arquivo_path, 60, { download: doc.arquivo_nome });
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível gerar link de download");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="Documentos"
        subtitle="Arquivos enviados pela equipe ou recebidos do portal cliente"
        actions={
          <Button onClick={() => setUploadOpen(true)} className="flex items-center gap-2">
            <Upload size={16} /> Enviar documento
          </Button>
        }
      />

      {/* Filtros */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
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
        <div className="ml-auto text-sm text-gray-500">
          {docs.length} arquivo{docs.length !== 1 && "s"}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Comp.</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Enviado em</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-32"></th>
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
            {!isLoading &&
              docs.map((d) => (
                <tr key={d.id_documento} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {d.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{d.tipo}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    <div className="font-medium text-gray-800">{d.arquivo_nome}</div>
                    {d.descricao && (
                      <div className="text-gray-500">{d.descricao}</div>
                    )}
                    {d.tamanho_bytes != null && (
                      <div className="text-gray-400 mt-0.5">
                        {(Number(d.tamanho_bytes) / 1024).toFixed(1)} KB
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.competencia ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={
                        d.origem === "CLIENTE"
                          ? "px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                          : "px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                      }
                    >
                      {d.origem}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={d.status}
                      onChange={(e) =>
                        trocarStatus.mutate({
                          id: d.id_documento,
                          novoStatus: e.target.value as StatusDocumento,
                        })
                      }
                      className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_STYLE[d.status] ?? "bg-gray-100"}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => baixar(d)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                        title="Baixar"
                        aria-label="Baixar"
                      >
                        <Download size={15} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Excluir "${d.arquivo_nome}"? Essa ação remove o arquivo do Storage.`
                              )
                            ) {
                              excluir.mutate(d);
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
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum documento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DocumentoUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        origem="CONTABILIDADE"
        clientes={clientes}
      />
    </div>
  );
}

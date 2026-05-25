"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Download, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { DocumentoUploadModal } from "@/components/documentos/DocumentoUploadModal";
import { useDocumentos } from "@/lib/hooks/useDocumentos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Documento } from "@/lib/supabase/types";

const STATUS_STYLE: Record<string, string> = {
  RECEBIDO: "bg-blue-100 text-blue-700",
  EM_ANALISE: "bg-amber-100 text-amber-800",
  PROCESSADO: "bg-verde-light text-verde-dark",
  DEVOLVIDO: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  PROCESSADO: "Processado",
  DEVOLVIDO: "Devolvido",
};

export default function PortalDocumentos() {
  const user = useUserStore((s) => s.user);
  const idCliente = user?.id_cliente ?? "";
  const { data: docs = [], isLoading } = useDocumentos({ idCliente });
  const [uploadOpen, setUploadOpen] = useState(false);

  async function baixar(d: Documento) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(d.arquivo_path, 60, { download: d.arquivo_nome });
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível baixar");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="Meus documentos"
        subtitle="Envie notas, extratos e folha para a contabilidade"
        actions={
          <Button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2"
            disabled={!idCliente}
          >
            <Upload size={16} /> Enviar arquivo
          </Button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Competência</th>
              <th className="px-4 py-3">Enviado em</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-12"></th>
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
              docs.map((d) => (
                <tr key={d.id_documento} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{d.tipo}</td>
                  <td className="px-4 py-3 text-gray-800 text-xs">
                    <div className="font-medium">{d.arquivo_nome}</div>
                    {d.descricao && (
                      <div className="text-gray-500">{d.descricao}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.competencia ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[d.status] ?? "bg-gray-100"}`}
                    >
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => baixar(d)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                      aria-label="Baixar"
                    >
                      <Download size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Você ainda não enviou nenhum documento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {idCliente && (
        <DocumentoUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          fixedIdCliente={idCliente}
          origem="CLIENTE"
        />
      )}
    </div>
  );
}

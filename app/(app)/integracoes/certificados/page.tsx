"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  FileLock2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useClientes } from "@/lib/hooks/useClientes";
import { useCertificadosDigitais } from "@/lib/hooks/useCertificadosDigitais";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type { CertificadoDigital } from "@/lib/supabase/types";

const CertificadoFormModal = dynamic(
  () =>
    import("@/components/integracoes/CertificadoFormModal").then((m) => ({
      default: m.CertificadoFormModal,
    })),
  { ssr: false }
);

const TIPO_LABEL: Record<string, string> = {
  A1: "A1",
  A3: "A3",
  PROCURACAO_ECAC: "Procuração e-CAC",
  CONECTIVIDADE_SOCIAL: "Conectividade Social",
  OUTRO: "Outro",
};

function diasParaVencer(validadeFim: string | null): number | null {
  if (!validadeFim) return null;
  const d = new Date(validadeFim + "T12:00");
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function CertificadosPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const isEquipe = isAdmin || user?.perfil === "Contador";

  const { data: clientes = [] } = useClientes();
  const { data: certificados = [], isLoading } = useCertificadosDigitais();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [certEdit, setCertEdit] = useState<CertificadoDigital | null>(null);

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("certificados_digitais")
        .delete()
        .eq("id_certificado", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificados-digitais"] });
      toast.success("Certificado removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Certificados digitais" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar certificados.
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
        title="Certificados digitais"
        subtitle="A1, A3 e procurações e-CAC — metadata e alertas de vencimento"
        actions={
          <Button
            onClick={() => {
              setCertEdit(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> Novo certificado
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Cadastro de metadata apenas.</strong> O arquivo .pfx e a
          senha NÃO ficam no banco. Quando ativar modo real, o arquivo
          irá pra bucket privado do Supabase e a senha pra Edge Function
          Secret (nunca no frontend).
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Titular</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Emissor</th>
              <th className="px-4 py-3">Validade</th>
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
            {!isLoading && certificados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  <FileLock2 size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhum certificado cadastrado.
                </td>
              </tr>
            )}
            {certificados.map((c) => {
              const dias = diasParaVencer(c.validade_fim);
              const doc =
                c.titular_documento.length === 11
                  ? formatCPF(c.titular_documento)
                  : formatCNPJ(c.titular_documento);
              return (
                <tr key={c.id_certificado} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {c.titular_nome}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono">
                      {doc}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {c.clientes?.razao_social ?? (
                      <span className="text-gold italic">Escritório</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                      {TIPO_LABEL[c.tipo] ?? c.tipo}
                    </span>
                    {c.tipo === "PROCURACAO_ECAC" &&
                      c.procuracao_servicos &&
                      Array.isArray(c.procuracao_servicos) && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          {(c.procuracao_servicos as string[]).join(" • ")}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {c.emissor ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <div>
                      {formatDate(c.validade_inicio)} →{" "}
                      {formatDate(c.validade_fim)}
                    </div>
                    {dias != null && (
                      <div
                        className={`text-[10px] mt-0.5 ${
                          dias < 0
                            ? "text-red-alert font-semibold"
                            : dias < 30
                            ? "text-amber-700 font-medium"
                            : "text-gray-500"
                        }`}
                      >
                        {dias < 0
                          ? `VENCIDO há ${-dias} dia(s)`
                          : dias === 0
                          ? "Vence HOJE"
                          : `vence em ${dias} dia(s)`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setCertEdit(c);
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-400 hover:text-verde-dark"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Remover certificado de ${c.titular_nome}?`
                              )
                            )
                              excluir.mutate(c.id_certificado);
                          }}
                          className="p-1 text-gray-400 hover:text-red-alert"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CertificadoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        certificado={certEdit}
        clientes={clientes}
      />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileLock2,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCertificadosDigitais } from "@/lib/hooks/useCertificadosDigitais";
import { useUserStore } from "@/lib/store";
import { formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type { CertificadoDigital } from "@/lib/supabase/types";

function diasParaVencer(fim: string | null): number | null {
  if (!fim) return null;
  return Math.ceil(
    (new Date(fim + "T12:00").getTime() - Date.now()) / 86400000
  );
}

const TIPO_LABEL: Record<string, string> = {
  A1: "A1",
  A3: "A3",
  PROCURACAO_ECAC: "Procuração e-CAC",
  CONECTIVIDADE_SOCIAL: "Conectividade Social",
  OUTRO: "Outro",
};

export default function CertificadoDigitalPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe = user?.perfil === "Admin" || user?.perfil === "Contador";

  const { data: certificados = [], isLoading } = useCertificadosDigitais();

  const stats = useMemo(() => {
    const total = certificados.length;
    const vencidos = certificados.filter((c) => {
      const d = diasParaVencer(c.validade_fim);
      return d != null && d < 0;
    }).length;
    const proximos = certificados.filter((c) => {
      const d = diasParaVencer(c.validade_fim);
      return d != null && d >= 0 && d <= 60;
    }).length;
    const validos = total - vencidos - proximos;
    const porTipo: Record<string, number> = {};
    for (const c of certificados) {
      porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
    }
    return { total, vencidos, proximos, validos, porTipo };
  }, [certificados]);

  // Próximos a vencer (ordenados, max 10)
  const alertas = useMemo(() => {
    return [...certificados]
      .filter((c) => c.validade_fim != null)
      .sort((a, b) =>
        (a.validade_fim ?? "").localeCompare(b.validade_fim ?? "")
      )
      .slice(0, 10);
  }, [certificados]);

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Certificado Digital" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar.
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
        title="Certificado Digital — Monitor"
        subtitle="Visão geral de A1/A3 e procurações com alertas de vencimento"
        actions={
          <Link
            href="/integracoes/certificados"
            className="inline-flex items-center gap-2 px-3 py-2 bg-verde-primary text-white rounded-lg text-xs font-medium hover:bg-verde-accent"
          >
            <Plus size={14} /> Gerenciar certificados
          </Link>
        }
      />

      {/* Stats gerais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={FileLock2}
          label="Total cadastrados"
          value={stats.total}
          tone="neutral"
        />
        <StatCard
          icon={ShieldCheck}
          label="Válidos (> 60 dias)"
          value={stats.validos}
          tone="verde"
        />
        <StatCard
          icon={AlertTriangle}
          label="Vencendo (≤ 60 dias)"
          value={stats.proximos}
          tone="amarelo"
        />
        <StatCard
          icon={ShieldAlert}
          label="Vencidos"
          value={stats.vencidos}
          tone="vermelho"
        />
      </div>

      {/* Tipos */}
      {stats.total > 0 && (
        <div className="bg-white border border-card-border rounded-xl p-4 mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Por tipo
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.porTipo).map(([tipo, qtd]) => (
              <div
                key={tipo}
                className="flex items-center gap-2 px-3 py-1.5 bg-app-bg border border-card-border rounded-full"
              >
                <span className="text-xs text-gray-600">
                  {TIPO_LABEL[tipo] ?? tipo}
                </span>
                <span className="text-xs font-bold text-verde-dark">
                  {qtd}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas ordenados por vencimento */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border bg-gray-50 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-700" />
          <h3 className="font-serif text-sm font-semibold text-verde-dark">
            Próximos vencimentos
          </h3>
        </div>
        <div className="overflow-x-auto">
          {isLoading && (
            <div className="p-8 text-center text-sm text-gray-500">
              Carregando…
            </div>
          )}
          {!isLoading && alertas.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              <CheckCircle2 size={32} className="mx-auto text-gray-300 mb-2" />
              Nenhum certificado cadastrado com validade.{" "}
              <Link
                href="/integracoes/certificados"
                className="text-verde-primary hover:underline"
              >
                Cadastrar agora
              </Link>
              .
            </div>
          )}
          {!isLoading && alertas.length > 0 && (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-white text-gray-600 text-left text-xs uppercase border-b border-card-border">
                <tr>
                  <th className="px-4 py-2">Titular</th>
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Vence em</th>
                  <th className="px-4 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {alertas.map((c) => {
                  const dias = diasParaVencer(c.validade_fim);
                  const doc =
                    c.titular_documento.length === 11
                      ? formatCPF(c.titular_documento)
                      : formatCNPJ(c.titular_documento);
                  const tone =
                    dias == null
                      ? "neutro"
                      : dias < 0
                      ? "vermelho"
                      : dias <= 30
                      ? "vermelho"
                      : dias <= 60
                      ? "amarelo"
                      : "verde";
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
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {formatDate(c.validade_fim)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {dias == null && (
                          <span className="text-gray-400">—</span>
                        )}
                        {dias != null && dias < 0 && (
                          <span className="text-red-alert font-semibold">
                            VENCIDO há {-dias} dia(s)
                          </span>
                        )}
                        {dias != null && dias === 0 && (
                          <span className="text-red-alert font-semibold">
                            Vence HOJE
                          </span>
                        )}
                        {dias != null && dias > 0 && dias <= 30 && (
                          <span className="text-red-alert font-medium">
                            {dias} dia(s)
                          </span>
                        )}
                        {dias != null && dias > 30 && dias <= 60 && (
                          <span className="text-amber-700 font-medium">
                            {dias} dia(s)
                          </span>
                        )}
                        {dias != null && dias > 60 && (
                          <span className="text-green-700">
                            {dias} dia(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="text-[11px] text-gray-500 mt-4">
        Esta tela é só visualização agregada. Para criar/editar
        certificados, use{" "}
        <Link
          href="/integracoes/certificados"
          className="text-verde-primary hover:underline"
        >
          Gerenciar certificados
        </Link>
        .
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: "neutral" | "verde" | "amarelo" | "vermelho";
}) {
  const cores: Record<
    string,
    { card: string; valor: string; icone: string }
  > = {
    neutral: {
      card: "bg-white border-card-border",
      valor: "text-gray-800",
      icone: "text-gold",
    },
    verde: {
      card: "bg-green-50 border-green-200",
      valor: "text-green-700",
      icone: "text-green-700",
    },
    amarelo: {
      card: "bg-amber-50 border-amber-200",
      valor: "text-amber-700",
      icone: "text-amber-700",
    },
    vermelho: {
      card: "bg-red-50 border-red-200",
      valor: "text-red-alert",
      icone: "text-red-alert",
    },
  };
  const c = cores[tone];
  return (
    <div className={`border rounded-xl p-4 ${c.card}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-600 uppercase tracking-wide">
          {label}
        </div>
        <Icon size={16} className={c.icone} />
      </div>
      <div className={`mt-2 text-3xl font-bold ${c.valor}`}>{value}</div>
    </div>
  );
}

"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useFolhaItens } from "@/lib/hooks/useFolhas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import type { FolhaPagamento } from "@/lib/supabase/types";

type FolhaComCliente = FolhaPagamento & {
  clientes: { razao_social: string; cnpj: string | null } | null;
};

export default function FolhaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: folha, isLoading: folhaLoading } = useQuery({
    queryKey: ["folha", id],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("folhas_pagamento")
        .select("*, clientes(razao_social, cnpj)")
        .eq("id_folha", id)
        .single();
      if (error) throw error;
      return data as unknown as FolhaComCliente;
    },
  });

  const { data: itens = [], isLoading: itensLoading } = useFolhaItens(id);

  if (folhaLoading || itensLoading) {
    return (
      <div>
        <PageHeader title="Carregando folha…" />
      </div>
    );
  }

  if (!folha) {
    return (
      <div>
        <PageHeader title="Folha não encontrada" />
        <Link href="/folha" className="text-verde-primary text-sm">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/folha"
          className="text-sm text-gray-600 hover:text-verde-dark flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>

      <PageHeader
        title={`Folha ${folha.competencia}`}
        subtitle={folha.clientes?.razao_social ?? ""}
        actions={
          <Button
            onClick={() => window.print()}
            variant="secondary"
            className="flex items-center gap-2"
          >
            <Printer size={14} /> Imprimir resumo
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Stat label="Funcionários" value={String(itens.length)} raw />
        <Stat label="Proventos" value={formatBRL(Number(folha.total_proventos))} />
        <Stat label="Descontos" value={formatBRL(Number(folha.total_descontos))} />
        <Stat
          label="Líquido"
          value={formatBRL(Number(folha.total_liquido))}
          highlight
        />
        <Stat
          label="INSS pat. + FGTS"
          value={formatBRL(
            Number(folha.total_inss_patronal) + Number(folha.total_fgts)
          )}
        />
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Funcionário</th>
              <th className="px-4 py-3 text-right">Bruto</th>
              <th className="px-4 py-3 text-right">INSS</th>
              <th className="px-4 py-3 text-right">IRRF</th>
              <th className="px-4 py-3 text-right">VT</th>
              <th className="px-4 py-3 text-right">Outros desc.</th>
              <th className="px-4 py-3 text-right">Líquido</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {itens.map((i) => {
              const outrosDesc =
                Number(i.plano_saude) +
                Number(i.desc_faltas) +
                Number(i.desc_adiantamento) +
                Number(i.desc_outros);
              return (
                <tr key={i.id_item} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{i.nome_func}</div>
                    {i.cargo_func && (
                      <div className="text-[11px] text-gray-500">
                        {i.cargo_func}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatBRL(Number(i.total_proventos))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(i.inss))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(i.irrf))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(i.vale_transporte))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(outrosDesc)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(i.liquido))}
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <Link
                      href={`/folha/${id}/holerite/${i.id_funcionario}`}
                      className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium"
                    >
                      <FileText size={12} /> Holerite
                    </Link>
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

function Stat({
  label,
  value,
  highlight,
  raw,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  raw?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "border border-gold/40 rounded-lg p-3 bg-gold/5"
          : "border border-card-border rounded-lg p-3 bg-white"
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={
          highlight
            ? "text-lg font-bold text-verde-dark mt-1"
            : raw
            ? "text-xl font-semibold text-gray-800 mt-1"
            : "text-base font-semibold text-gray-800 mt-1"
        }
      >
        {value}
      </div>
    </div>
  );
}

"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";
import type { NotaFiscal } from "@/lib/supabase/types";
import type { NfeItem } from "@/lib/nfe-parser";

type NotaComCliente = NotaFiscal & {
  clientes: { razao_social: string; cnpj: string | null } | null;
};

export default function NotaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: nota, isLoading } = useQuery({
    queryKey: ["nota-fiscal", id],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*, clientes(razao_social, cnpj)")
        .eq("id_nota", id)
        .single();
      if (error) throw error;
      return data as unknown as NotaComCliente;
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Carregando NF…" />
      </div>
    );
  }

  if (!nota) {
    return (
      <div>
        <PageHeader title="Nota não encontrada" />
        <Link href="/nfe" className="text-verde-primary text-sm">
          Voltar
        </Link>
      </div>
    );
  }

  const itens = Array.isArray(nota.itens) ? (nota.itens as NfeItem[]) : [];

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/nfe"
          className="text-sm text-gray-600 hover:text-verde-dark flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>

      <PageHeader
        title={`NF-e ${nota.numero}/${nota.serie}`}
        subtitle={nota.natureza_operacao ?? ""}
        actions={
          nota.id_lancamento && (
            <Link
              href={`/lancamentos`}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light"
            >
              <ExternalLink size={12} />
              Ver lançamento
            </Link>
          )
        }
      />

      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-2">
            Emitente
          </div>
          <div className="font-medium text-gray-800">{nota.emit_nome}</div>
          {nota.emit_cnpj && (
            <div className="text-xs font-mono text-gray-500 mt-0.5">
              CNPJ {formatCNPJ(nota.emit_cnpj)}
            </div>
          )}
          {nota.emit_uf && (
            <div className="text-xs text-gray-500 mt-0.5">UF: {nota.emit_uf}</div>
          )}
        </div>
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-2">
            Destinatário
          </div>
          <div className="font-medium text-gray-800">{nota.dest_nome}</div>
          {nota.dest_cnpj && (
            <div className="text-xs font-mono text-gray-500 mt-0.5">
              {nota.dest_cnpj.length === 11
                ? `CPF ${nota.dest_cnpj}`
                : `CNPJ ${formatCNPJ(nota.dest_cnpj)}`}
            </div>
          )}
        </div>
        <div className="bg-white border border-card-border rounded-xl p-4">
          <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-2">
            Identificação
          </div>
          <div className="text-xs text-gray-700">
            <strong>Tipo:</strong>{" "}
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                nota.tipo === "SAIDA"
                  ? "bg-verde-light text-verde-dark"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {nota.tipo}
            </span>
          </div>
          <div className="text-xs text-gray-700 mt-1">
            <strong>Emissão:</strong> {formatDate(nota.data_emissao)}
          </div>
          <div className="text-xs text-gray-700 mt-1">
            <strong>Empresa:</strong> {nota.clientes?.razao_social ?? "—"}
          </div>
        </div>
      </div>

      {/* Chave */}
      <div className="bg-app-bg border border-card-border rounded-xl p-3 mb-4">
        <div className="text-[10px] uppercase text-gray-500 tracking-wide mb-1">
          Chave de acesso
        </div>
        <div className="font-mono text-xs text-gray-700 break-all">
          {nota.chave}
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        <Stat label="Produtos" value={formatBRL(Number(nota.valor_produtos))} />
        {Number(nota.valor_desconto) > 0 && (
          <Stat label="Desconto" value={formatBRL(Number(nota.valor_desconto))} />
        )}
        {Number(nota.valor_frete) > 0 && (
          <Stat label="Frete" value={formatBRL(Number(nota.valor_frete))} />
        )}
        {Number(nota.valor_icms) > 0 && (
          <Stat label="ICMS" value={formatBRL(Number(nota.valor_icms))} />
        )}
        {Number(nota.valor_ipi) > 0 && (
          <Stat label="IPI" value={formatBRL(Number(nota.valor_ipi))} />
        )}
        {Number(nota.valor_pis) > 0 && (
          <Stat label="PIS" value={formatBRL(Number(nota.valor_pis))} />
        )}
        {Number(nota.valor_cofins) > 0 && (
          <Stat label="COFINS" value={formatBRL(Number(nota.valor_cofins))} />
        )}
        <div className="col-span-2 sm:col-span-1 border border-gold/40 rounded-lg p-3 bg-gold/5">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Total NF
          </div>
          <div className="text-base font-bold text-verde-dark mt-1">
            {formatBRL(Number(nota.valor_total))}
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border bg-gray-50 flex items-center gap-2">
          <FileText size={14} className="text-gold" />
          <h3 className="font-serif text-sm font-semibold text-verde-dark">
            Itens da nota ({itens.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-white text-gray-600 text-left text-xs uppercase border-b border-card-border">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 w-24">CFOP</th>
                <th className="px-3 py-2 w-24">NCM</th>
                <th className="px-3 py-2 text-right w-24">Qtd</th>
                <th className="px-3 py-2 text-right w-32">Unitário</th>
                <th className="px-3 py-2 text-right w-32">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                    Sem itens detalhados.
                  </td>
                </tr>
              ) : (
                itens.map((it) => (
                  <tr key={it.numero} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {it.numero}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-800">{it.descricao}</div>
                      {it.codigo && (
                        <div className="text-[10px] text-gray-500 font-mono">
                          Cód. {it.codigo}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">
                      {it.cfop}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">
                      {it.ncm}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 whitespace-nowrap">
                      {Number(it.quantidade).toLocaleString("pt-BR")} {it.unidade}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 whitespace-nowrap">
                      {formatBRL(Number(it.valorUnitario))}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {formatBRL(Number(it.valorTotal))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-card-border rounded-lg p-3 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-sm font-semibold text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}

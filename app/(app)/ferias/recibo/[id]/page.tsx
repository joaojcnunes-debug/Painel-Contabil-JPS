import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  Configuracao,
  Ferias,
} from "@/lib/supabase/types";
import { ReciboActions } from "@/app/(app)/honorarios/[id]/recibo/ReciboActions";

type FerExp = Ferias & { clientes: Cliente | null };

export default async function ReciboFeriasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const [{ data: ferData, error: errFer }, { data: cfgData }] =
    await Promise.all([
      supabase
        .from("ferias")
        .select("*, clientes(*)")
        .eq("id_ferias", id)
        .single(),
      supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
    ]);

  if (errFer || !ferData) notFound();
  const fer = ferData as unknown as FerExp;
  const empresa = fer.clientes;
  const cfg = cfgData as Configuracao | null;

  return (
    <div className="min-h-screen bg-app-bg py-8 print:bg-white print:py-0">
      <ReciboActions />

      <div className="max-w-3xl mx-auto bg-white p-10 print:p-0 print:max-w-none print:shadow-none border border-card-border print:border-0 rounded-xl print:rounded-none">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between pb-4 border-b-2 border-verde-dark mb-5">
          <div className="flex items-center gap-3">
            {cfg?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cfg.logo_url} alt="" className="w-12 h-12 object-contain" />
            ) : (
              <div className="w-12 h-12 rounded bg-verde-dark text-gold flex items-center justify-center font-serif font-bold text-lg">
                JSP
              </div>
            )}
            <div>
              <div className="font-serif text-base font-bold text-verde-dark">
                {empresa?.razao_social ?? "Empresa"}
              </div>
              {empresa?.cnpj && (
                <div className="text-[11px] text-gray-500 font-mono">
                  CNPJ {formatCNPJ(empresa.cnpj)}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Recibo de férias
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-1">
              {fer.id_ferias}
            </div>
          </div>
        </div>

        {/* Funcionário */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-5 border border-card-border rounded-lg p-3 bg-app-bg/40">
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Funcionário
            </div>
            <div className="font-semibold text-gray-800">{fer.nome_func}</div>
            {fer.cpf_func && (
              <div className="text-gray-500 font-mono text-[11px] mt-0.5">
                CPF {formatCPF(fer.cpf_func)}
              </div>
            )}
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Cargo
            </div>
            <div className="text-gray-800">{fer.cargo_func ?? "—"}</div>
            <div className="text-gray-500 text-[11px] mt-0.5">
              Salário base: {formatBRL(Number(fer.salario_base))}
            </div>
          </div>
        </div>

        {/* Período */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-5">
          <div className="border border-card-border rounded-lg p-3 bg-white">
            <div className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">
              Período aquisitivo
            </div>
            <div className="text-sm text-gray-800">
              {formatDate(fer.periodo_aquisitivo_inicio)} a{" "}
              {formatDate(fer.periodo_aquisitivo_fim)}
            </div>
            {fer.faltas_periodo > 0 && (
              <div className="text-[10px] text-amber-700 mt-1">
                {fer.faltas_periodo} falta(s) • direito a {fer.dias_direito} dias
              </div>
            )}
          </div>
          <div className="border border-card-border rounded-lg p-3 bg-white">
            <div className="text-gray-500 uppercase tracking-wide text-[10px] mb-1">
              Período de gozo
            </div>
            <div className="text-sm text-gray-800">
              {formatDate(fer.data_inicio_gozo)} a{" "}
              {formatDate(fer.data_fim_gozo)}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              <strong>{fer.dias_gozados}</strong> dias gozados
              {fer.dias_abono > 0 && (
                <> + <strong>{fer.dias_abono}</strong> dias abono</>
              )}
            </div>
          </div>
        </div>

        <h2 className="font-serif text-lg font-bold text-verde-dark mb-3">
          Demonstrativo
        </h2>

        {/* Tabela de proventos */}
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-verde-light text-verde-dark text-xs uppercase">
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right w-32">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-card-border">
              <td className="px-3 py-2">
                Férias ({fer.dias_gozados} dias)
                {Number(fer.media_variaveis) > 0 && (
                  <span className="text-xs text-gray-500">
                    {" "}com média de variáveis {formatBRL(Number(fer.media_variaveis))}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {formatBRL(Number(fer.valor_ferias))}
              </td>
            </tr>
            <tr className="border-b border-card-border">
              <td className="px-3 py-2 pl-6 text-gray-700">
                + 1/3 constitucional (Art. 7º XVII CF)
              </td>
              <td className="px-3 py-2 text-right">
                {formatBRL(Number(fer.terco_ferias))}
              </td>
            </tr>
            {Number(fer.valor_abono) > 0 && (
              <>
                <tr className="border-b border-card-border bg-gold/5">
                  <td className="px-3 py-2">
                    Abono pecuniário ({fer.dias_abono} dias){" "}
                    <span className="text-xs text-gray-500">— isento</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatBRL(Number(fer.valor_abono))}
                  </td>
                </tr>
                <tr className="border-b border-card-border bg-gold/5">
                  <td className="px-3 py-2 pl-6 text-gray-700">
                    + 1/3 sobre abono{" "}
                    <span className="text-xs text-gray-500">— isento</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatBRL(Number(fer.terco_abono))}
                  </td>
                </tr>
              </>
            )}
            <tr className="bg-gray-50 border-t-2 border-card-border font-semibold">
              <td className="px-3 py-2 text-right">Total bruto</td>
              <td className="px-3 py-2 text-right">
                {formatBRL(Number(fer.total_bruto))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Descontos */}
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-app-bg text-gray-700 text-xs uppercase">
              <th className="px-3 py-2 text-left">Descontos</th>
              <th className="px-3 py-2 text-left w-40">Base</th>
              <th className="px-3 py-2 text-right w-28">Valor</th>
            </tr>
          </thead>
          <tbody>
            {Number(fer.inss) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">INSS</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  base {formatBRL(Number(fer.base_inss))}
                </td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(fer.inss))}
                </td>
              </tr>
            )}
            {Number(fer.irrf) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">IRRF</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  base {formatBRL(Number(fer.base_irrf))}
                </td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(fer.irrf))}
                </td>
              </tr>
            )}
            {Number(fer.outros_descontos) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">Outros descontos</td>
                <td className="px-3 py-2 text-xs text-gray-500">—</td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(fer.outros_descontos))}
                </td>
              </tr>
            )}
            {Number(fer.inss) === 0 &&
              Number(fer.irrf) === 0 &&
              Number(fer.outros_descontos) === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-3 text-center text-xs text-gray-400"
                  >
                    Sem descontos.
                  </td>
                </tr>
              )}
          </tbody>
        </table>

        {/* Líquido */}
        <div className="border-2 border-verde-dark rounded-lg p-4 mb-5 bg-gold/5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Valor líquido
            </div>
            <div className="text-xs text-gray-500">
              {fer.data_pagamento
                ? `pago em ${formatDate(fer.data_pagamento)}`
                : "a pagar (até 2 dias antes do início do gozo)"}
            </div>
          </div>
          <div className="font-serif text-3xl font-bold text-verde-dark">
            {formatBRL(Number(fer.liquido))}
          </div>
        </div>

        <div className="text-[10px] text-gray-500 mb-6">
          <strong>FGTS sobre tributável (encargo da empresa):</strong>{" "}
          {formatBRL(Number(fer.fgts))}
        </div>

        {/* Assinatura */}
        <div className="mt-10 pt-6 border-t border-card-border">
          <div className="text-center text-xs text-gray-600 mb-2">
            Declaro ter recebido a importância líquida acima a título de
            férias do período aquisitivo{" "}
            {formatDate(fer.periodo_aquisitivo_inicio)} a{" "}
            {formatDate(fer.periodo_aquisitivo_fim)}.
          </div>
          <div className="mt-10 mx-auto max-w-md">
            <div className="border-b border-gray-400 h-8" />
            <div className="text-center text-xs text-gray-600 mt-2">
              {fer.nome_func}
              {fer.cpf_func && (
                <span className="text-gray-400 ml-2 font-mono">
                  CPF {formatCPF(fer.cpf_func)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-gray-400 text-center">
          Demonstrativo gerado por{" "}
          {cfg?.nome_escritorio ?? "JSP Contabilidade"} — valor indicativo,
          confira tabelas oficiais.
        </div>
      </div>
    </div>
  );
}

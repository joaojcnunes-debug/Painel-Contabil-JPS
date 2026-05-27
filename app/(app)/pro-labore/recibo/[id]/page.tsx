import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  Configuracao,
  ProLaborePagamento,
} from "@/lib/supabase/types";
import { ReciboActions } from "@/app/(app)/honorarios/[id]/recibo/ReciboActions";

type PagExp = ProLaborePagamento & { clientes: Cliente | null };

function valorPorExtenso(v: number): string {
  const reais = Math.floor(v);
  const centavos = Math.round((v - reais) * 100);
  return `${reais} reais${centavos > 0 ? ` e ${centavos} centavos` : ""}`;
}

export default async function ReciboProLaborePage({
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

  const [{ data: pagData, error: errPag }, { data: cfgData }] =
    await Promise.all([
      supabase
        .from("pro_labore_pagamentos")
        .select("*, clientes(*)")
        .eq("id_pagamento", id)
        .single(),
      supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
    ]);

  if (errPag || !pagData) notFound();
  const pag = pagData as unknown as PagExp;
  const empresa = pag.clientes;
  const cfg = cfgData as Configuracao | null;

  const valor = Number(pag.valor_pro_labore);
  const liquido = Number(pag.liquido);
  const pago = !!pag.data_pagamento;
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-app-bg py-8 print:bg-white print:py-0">
      <ReciboActions />

      <div className="max-w-3xl mx-auto bg-white p-10 print:p-0 print:max-w-none print:shadow-none border border-card-border print:border-0 rounded-xl print:rounded-none">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-verde-dark mb-6">
          <div className="flex items-center gap-4">
            {cfg?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cfg.logo_url}
                alt=""
                className="w-14 h-14 object-contain"
              />
            ) : (
              <div className="w-14 h-14 rounded bg-verde-dark text-gold flex items-center justify-center font-serif font-bold text-xl">
                JSP
              </div>
            )}
            <div>
              <div className="font-serif text-lg font-bold text-verde-dark">
                {empresa?.razao_social ?? "Empresa"}
              </div>
              {empresa?.cnpj && (
                <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                  CNPJ {formatCNPJ(empresa.cnpj)}
                </div>
              )}
              {empresa?.logradouro && (
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {[
                    empresa.logradouro,
                    empresa.numero,
                    empresa.bairro,
                    empresa.municipio,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Recibo de pró-labore
            </div>
            <div className="text-sm font-bold text-verde-dark mt-1">
              {pag.competencia}
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-1">
              {pag.id_pagamento}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Emitido {hoje}</div>
          </div>
        </div>

        {/* Status */}
        <div className="mb-5">
          <div
            className={
              pago
                ? "inline-block px-3 py-1 rounded-full bg-verde-light text-verde-dark text-xs font-semibold"
                : "inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold"
            }
          >
            {pago
              ? `✓ Pago em ${formatDate(pag.data_pagamento!)}`
              : "Em aberto"}
          </div>
        </div>

        <h2 className="font-serif text-xl font-bold text-verde-dark mb-3">
          Recibo de pagamento de pró-labore
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-5">
          {pago ? "Pagamos" : "Pagaremos"} a{" "}
          <strong>{pag.nome_socio}</strong>
          {pag.cpf_socio && (
            <>
              {" "}— CPF{" "}
              <span className="font-mono">{formatCPF(pag.cpf_socio)}</span>
            </>
          )}
          , na qualidade de sócio(a) de{" "}
          <strong>{empresa?.razao_social ?? "—"}</strong>, a importância
          líquida de <strong>{formatBRL(liquido)}</strong>{" "}
          <span className="text-gray-500">({valorPorExtenso(liquido)})</span>,
          referente ao pró-labore da competência{" "}
          <strong>{pag.competencia}</strong>, conforme demonstrativo abaixo.
        </p>

        {/* Demonstrativo */}
        <table className="w-full text-sm border border-card-border rounded-lg overflow-hidden mb-5">
          <thead className="bg-verde-light text-verde-dark text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Descrição</th>
              <th className="px-4 py-2 text-right">Proventos</th>
              <th className="px-4 py-2 text-right">Descontos</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-card-border">
              <td className="px-4 py-2">Pró-labore mensal</td>
              <td className="px-4 py-2 text-right">{formatBRL(valor)}</td>
              <td className="px-4 py-2 text-right text-gray-300">—</td>
            </tr>
            {Number(pag.inss) > 0 && (
              <tr className="border-t border-card-border">
                <td className="px-4 py-2">
                  INSS contribuinte individual (11%)
                </td>
                <td className="px-4 py-2 text-right text-gray-300">—</td>
                <td className="px-4 py-2 text-right text-red-alert">
                  {formatBRL(Number(pag.inss))}
                </td>
              </tr>
            )}
            {Number(pag.irrf) > 0 && (
              <tr className="border-t border-card-border">
                <td className="px-4 py-2">
                  IRRF{" "}
                  <span className="text-xs text-gray-500">
                    (base {formatBRL(Number(pag.base_irrf))})
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-gray-300">—</td>
                <td className="px-4 py-2 text-right text-red-alert">
                  {formatBRL(Number(pag.irrf))}
                </td>
              </tr>
            )}
            {Number(pag.outros_descontos) > 0 && (
              <tr className="border-t border-card-border">
                <td className="px-4 py-2">Outros descontos</td>
                <td className="px-4 py-2 text-right text-gray-300">—</td>
                <td className="px-4 py-2 text-right text-red-alert">
                  {formatBRL(Number(pag.outros_descontos))}
                </td>
              </tr>
            )}
            <tr className="bg-gray-50 border-t-2 border-card-border font-semibold">
              <td className="px-4 py-2 text-right">Totais</td>
              <td className="px-4 py-2 text-right">{formatBRL(valor)}</td>
              <td className="px-4 py-2 text-right text-red-alert">
                {formatBRL(
                  Number(pag.inss) +
                    Number(pag.irrf) +
                    Number(pag.outros_descontos)
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Líquido em destaque */}
        <div className="border-2 border-verde-dark rounded-lg p-4 flex items-center justify-between mb-6 bg-gold/5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Valor líquido
            </div>
            <div className="text-xs text-gray-500">a receber</div>
          </div>
          <div className="font-serif text-3xl font-bold text-verde-dark">
            {formatBRL(liquido)}
          </div>
        </div>

        {/* Assinatura */}
        <div className="mt-10 pt-6 border-t border-card-border">
          <div className="text-center text-xs text-gray-600 mb-2">
            Declaro ter recebido a importância líquida discriminada acima.
          </div>
          <div className="mt-10 mx-auto max-w-md">
            <div className="border-b border-gray-400 h-8" />
            <div className="text-center text-xs text-gray-600 mt-2">
              {pag.nome_socio}
              {pag.cpf_socio && (
                <span className="text-gray-400 ml-2 font-mono">
                  CPF {formatCPF(pag.cpf_socio)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-gray-400 text-center">
          Demonstrativo gerado por{" "}
          {cfg?.nome_escritorio ?? "JSP Contabilidade"} — valor indicativo,
          confira tabelas oficiais antes do recolhimento.
        </div>
      </div>
    </div>
  );
}

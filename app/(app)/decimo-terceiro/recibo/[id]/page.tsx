import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  Configuracao,
  DecimoTerceiro,
} from "@/lib/supabase/types";
import { ReciboActions } from "@/app/(app)/honorarios/[id]/recibo/ReciboActions";

type DecExp = DecimoTerceiro & { clientes: Cliente | null };

export default async function ReciboDecimoPage({
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

  const [{ data: decData, error: errDec }, { data: cfgData }] =
    await Promise.all([
      supabase
        .from("decimos_terceiros")
        .select("*, clientes(*)")
        .eq("id_decimo", id)
        .single(),
      supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
    ]);

  if (errDec || !decData) notFound();
  const dec = decData as unknown as DecExp;
  const empresa = dec.clientes;
  const cfg = cfgData as Configuracao | null;

  const integral = Number(dec.valor_integral);
  const primeira = Number(dec.valor_primeira);
  const segunda = Number(dec.valor_segunda);
  const liquidoTotal = Number(dec.liquido_total);

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
              Recibo de 13º
            </div>
            <div className="text-sm font-bold text-verde-dark mt-1">
              Ano-base {dec.ano}
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-1">
              {dec.id_decimo}
            </div>
          </div>
        </div>

        {/* Dados do funcionário */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-5 border border-card-border rounded-lg p-3 bg-app-bg/40">
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Funcionário
            </div>
            <div className="font-semibold text-gray-800">{dec.nome_func}</div>
            {dec.cpf_func && (
              <div className="text-gray-500 font-mono text-[11px] mt-0.5">
                CPF {formatCPF(dec.cpf_func)}
              </div>
            )}
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Cargo / Meses
            </div>
            <div className="text-gray-800">{dec.cargo_func ?? "—"}</div>
            <div className="text-gray-500 text-[11px] mt-0.5">
              {dec.meses_trabalhados}/12 meses trabalhados
            </div>
          </div>
        </div>

        {/* Demonstrativo */}
        <h2 className="font-serif text-lg font-bold text-verde-dark mb-3">
          Demonstrativo de 13º salário
        </h2>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-verde-light text-verde-dark text-xs uppercase">
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left w-40">Referência</th>
              <th className="px-3 py-2 text-right w-28">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-card-border">
              <td className="px-3 py-2 font-medium">13º integral</td>
              <td className="px-3 py-2 text-xs text-gray-500">
                {formatBRL(Number(dec.salario_base))} × {dec.meses_trabalhados}
                /12
                {Number(dec.media_variaveis) > 0 && (
                  <> + média {formatBRL(Number(dec.media_variaveis))}</>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {formatBRL(integral)}
              </td>
            </tr>
            <tr className="border-b border-card-border">
              <td className="px-3 py-2 pl-6 text-gray-700">
                1ª parcela (50%)
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">
                {dec.data_primeira
                  ? `paga em ${formatDate(dec.data_primeira)}`
                  : "a pagar até 30/nov"}
              </td>
              <td className="px-3 py-2 text-right">{formatBRL(primeira)}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-app-bg text-gray-700 text-xs uppercase">
              <th className="px-3 py-2 text-left">Descontos (sobre integral)</th>
              <th className="px-3 py-2 text-left w-40">Base</th>
              <th className="px-3 py-2 text-right w-28">Valor</th>
            </tr>
          </thead>
          <tbody>
            {Number(dec.inss) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">INSS</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  base {formatBRL(Number(dec.base_inss))}
                </td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(dec.inss))}
                </td>
              </tr>
            )}
            {Number(dec.irrf) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">IRRF</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  base {formatBRL(Number(dec.base_irrf))}
                </td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(dec.irrf))}
                </td>
              </tr>
            )}
            {Number(dec.outros_descontos) > 0 && (
              <tr className="border-b border-card-border">
                <td className="px-3 py-2">Outros descontos</td>
                <td className="px-3 py-2 text-xs text-gray-500">—</td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(Number(dec.outros_descontos))}
                </td>
              </tr>
            )}
            {Number(dec.inss) === 0 &&
              Number(dec.irrf) === 0 &&
              Number(dec.outros_descontos) === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-center text-xs text-gray-400">
                    Sem descontos a aplicar.
                  </td>
                </tr>
              )}
          </tbody>
        </table>

        {/* 2ª parcela em destaque */}
        <div className="border-2 border-verde-dark rounded-lg p-4 mb-4 bg-gold/5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
                2ª parcela líquida
              </div>
              <div className="text-xs text-gray-500">
                {dec.data_segunda
                  ? `paga em ${formatDate(dec.data_segunda)}`
                  : "a pagar até 20/dez"}
              </div>
            </div>
            <div className="font-serif text-2xl font-bold text-verde-dark">
              {formatBRL(segunda)}
            </div>
          </div>
          <div className="text-[10px] text-gray-500 pt-2 border-t border-card-border">
            Líquido total do 13º (1ª + 2ª, descontados INSS e IRRF):{" "}
            <strong className="text-verde-dark">{formatBRL(liquidoTotal)}</strong>
          </div>
        </div>

        <div className="text-[10px] text-gray-500 mb-6">
          <strong>FGTS sobre o integral (encargo da empresa):</strong>{" "}
          {formatBRL(Number(dec.fgts))}
        </div>

        {/* Assinatura */}
        <div className="mt-10 pt-6 border-t border-card-border">
          <div className="text-center text-xs text-gray-600 mb-2">
            Declaro ter recebido as importâncias discriminadas acima a título
            de 13º salário do ano-base {dec.ano}.
          </div>
          <div className="mt-10 mx-auto max-w-md">
            <div className="border-b border-gray-400 h-8" />
            <div className="text-center text-xs text-gray-600 mt-2">
              {dec.nome_func}
              {dec.cpf_func && (
                <span className="text-gray-400 ml-2 font-mono">
                  CPF {formatCPF(dec.cpf_func)}
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

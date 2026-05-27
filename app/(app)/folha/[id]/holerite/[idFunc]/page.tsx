import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import { TIPO_FUNC_LABEL } from "@/lib/folha-pagamento";
import type {
  Cliente,
  Configuracao,
  FolhaItem,
  FolhaPagamento,
  Funcionario,
} from "@/lib/supabase/types";
import { ReciboActions } from "@/app/(app)/honorarios/[id]/recibo/ReciboActions";

export default async function HoleritePage({
  params,
}: {
  params: Promise<{ id: string; idFunc: string }>;
}) {
  const { id, idFunc } = await params;
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const [
    { data: folhaData, error: errFolha },
    { data: itemData, error: errItem },
    { data: funcData },
    { data: cfgData },
  ] = await Promise.all([
    supabase
      .from("folhas_pagamento")
      .select("*, clientes(*)")
      .eq("id_folha", id)
      .single(),
    supabase
      .from("folha_itens")
      .select("*")
      .eq("id_folha", id)
      .eq("id_funcionario", idFunc)
      .single(),
    supabase
      .from("funcionarios")
      .select("*")
      .eq("id_funcionario", idFunc)
      .single(),
    supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (errFolha || !folhaData || errItem || !itemData) notFound();

  const folha = folhaData as unknown as FolhaPagamento & {
    clientes: Cliente | null;
  };
  const item = itemData as unknown as FolhaItem;
  const func = (funcData ?? null) as Funcionario | null;
  const cfg = cfgData as Configuracao | null;
  const empresa = folha.clientes;

  const proventos: Array<{ label: string; valor: number; ref?: string }> = [
    { label: "Salário base", valor: Number(item.salario_base), ref: "30 dias" },
  ];
  if (Number(item.horas_extras) > 0)
    proventos.push({ label: "Horas extras", valor: Number(item.horas_extras) });
  if (Number(item.adicional_noturno) > 0)
    proventos.push({
      label: "Adicional noturno",
      valor: Number(item.adicional_noturno),
    });
  if (Number(item.outros_proventos) > 0)
    proventos.push({ label: "Outros proventos", valor: Number(item.outros_proventos) });

  const descontos: Array<{ label: string; valor: number; ref?: string }> = [];
  if (Number(item.inss) > 0)
    descontos.push({
      label: "INSS",
      valor: Number(item.inss),
      ref: `base ${formatBRL(Number(item.base_inss))}`,
    });
  if (Number(item.irrf) > 0)
    descontos.push({
      label: "IRRF",
      valor: Number(item.irrf),
      ref: `base ${formatBRL(Number(item.base_irrf))}`,
    });
  if (Number(item.vale_transporte) > 0)
    descontos.push({ label: "Vale-transporte", valor: Number(item.vale_transporte) });
  if (Number(item.plano_saude) > 0)
    descontos.push({ label: "Plano de saúde", valor: Number(item.plano_saude) });
  if (Number(item.desc_faltas) > 0)
    descontos.push({ label: "Faltas/atrasos", valor: Number(item.desc_faltas) });
  if (Number(item.desc_adiantamento) > 0)
    descontos.push({ label: "Adiantamento", valor: Number(item.desc_adiantamento) });
  if (Number(item.desc_outros) > 0)
    descontos.push({ label: "Outros descontos", valor: Number(item.desc_outros) });

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
              Holerite
            </div>
            <div className="text-sm font-bold text-verde-dark mt-1">
              {folha.competencia}
            </div>
          </div>
        </div>

        {/* Dados do funcionário */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-5 border border-card-border rounded-lg p-3 bg-app-bg/40">
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Funcionário
            </div>
            <div className="font-semibold text-gray-800">{item.nome_func}</div>
            {func?.cpf && (
              <div className="text-gray-500 font-mono text-[11px] mt-0.5">
                CPF {formatCPF(func.cpf)}
              </div>
            )}
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide text-[10px]">
              Cargo
            </div>
            <div className="text-gray-800">{item.cargo_func ?? "—"}</div>
            {func && (
              <div className="text-gray-500 text-[11px] mt-0.5">
                {TIPO_FUNC_LABEL[func.tipo] ?? func.tipo} • Admissão{" "}
                {formatDate(func.data_admissao)}
              </div>
            )}
          </div>
        </div>

        {/* Tabela */}
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-verde-light text-verde-dark text-xs uppercase">
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left w-32">Referência</th>
              <th className="px-3 py-2 text-right w-28">Proventos</th>
              <th className="px-3 py-2 text-right w-28">Descontos</th>
            </tr>
          </thead>
          <tbody>
            {proventos.map((p, i) => (
              <tr key={`p-${i}`} className="border-b border-card-border">
                <td className="px-3 py-2">{p.label}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{p.ref ?? ""}</td>
                <td className="px-3 py-2 text-right">{formatBRL(p.valor)}</td>
                <td className="px-3 py-2 text-right text-gray-300">—</td>
              </tr>
            ))}
            {descontos.map((d, i) => (
              <tr key={`d-${i}`} className="border-b border-card-border">
                <td className="px-3 py-2">{d.label}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{d.ref ?? ""}</td>
                <td className="px-3 py-2 text-right text-gray-300">—</td>
                <td className="px-3 py-2 text-right text-red-alert">
                  {formatBRL(d.valor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-sm">
              <td colSpan={2} className="px-3 py-2 text-right">
                Totais
              </td>
              <td className="px-3 py-2 text-right">
                {formatBRL(Number(item.total_proventos))}
              </td>
              <td className="px-3 py-2 text-right text-red-alert">
                {formatBRL(Number(item.total_descontos))}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Líquido */}
        <div className="border-2 border-verde-dark rounded-lg p-4 flex items-center justify-between mb-5 bg-gold/5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Valor líquido
            </div>
            <div className="text-xs text-gray-500">a receber</div>
          </div>
          <div className="font-serif text-3xl font-bold text-verde-dark">
            {formatBRL(Number(item.liquido))}
          </div>
        </div>

        {/* Bases (footer informativo) */}
        <div className="grid grid-cols-3 gap-3 text-[10px] text-gray-500 mb-6 border-t border-card-border pt-3">
          <div>
            <div className="uppercase tracking-wide">Base INSS</div>
            <div className="text-gray-700 font-medium">
              {formatBRL(Number(item.base_inss))}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wide">Base IRRF</div>
            <div className="text-gray-700 font-medium">
              {formatBRL(Number(item.base_irrf))}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wide">FGTS mês</div>
            <div className="text-gray-700 font-medium">
              {formatBRL(Number(item.fgts))}
            </div>
          </div>
        </div>

        {/* Assinatura */}
        <div className="mt-12 pt-6 border-t border-card-border">
          <div className="text-center text-xs text-gray-600 mb-2">
            Declaro ter recebido a importância líquida discriminada acima.
          </div>
          <div className="mt-10 mx-auto max-w-md">
            <div className="border-b border-gray-400 h-8" />
            <div className="text-center text-xs text-gray-600 mt-2">
              {item.nome_func}
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-gray-400 text-center">
          Folha gerada por {cfg?.nome_escritorio ?? "JSP Contabilidade"} —
          valor indicativo. Confira tabelas oficiais.
        </div>
      </div>
    </div>
  );
}

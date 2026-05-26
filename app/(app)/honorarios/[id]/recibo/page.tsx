import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  Configuracao,
  Fatura,
} from "@/lib/supabase/types";
import { ReciboActions } from "./ReciboActions";

type FatExp = Fatura & { clientes: Cliente | null };

function valorPorExtenso(v: number): string {
  // Versão simplificada — para muitos casos basta o valor numérico.
  // Manter como texto principalmente decorativo.
  const reais = Math.floor(v);
  const centavos = Math.round((v - reais) * 100);
  return `${reais} reais${centavos > 0 ? ` e ${centavos} centavos` : ""}`;
}

export default async function ReciboPage({
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

  const [{ data: fatData, error: errFat }, { data: cfgData }] =
    await Promise.all([
      supabase
        .from("faturas")
        .select("*, clientes(*)")
        .eq("id_fatura", id)
        .single(),
      supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
    ]);

  if (errFat || !fatData) notFound();
  const fatura = fatData as unknown as FatExp;
  const cliente = fatura.clientes;
  const cfg = cfgData as Configuracao | null;

  const pago = fatura.status === "PAGA";
  const valor = Number(fatura.valor ?? 0);
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-app-bg py-8 print:bg-white print:py-0">
      <ReciboActions />

      <div className="max-w-3xl mx-auto bg-white p-10 print:p-0 print:max-w-none print:shadow-none border border-card-border print:border-0 rounded-xl print:rounded-none">
        {/* Cabeçalho do escritório */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-verde-dark print:border-verde-dark mb-6">
          <div className="flex items-center gap-4">
            {cfg?.logo_url ? (
              // Usa <img> simples pra evitar problemas de next/image em print
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cfg.logo_url}
                alt=""
                className="w-16 h-16 object-contain"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-verde-dark text-gold flex items-center justify-center font-serif font-bold text-2xl">
                JSP
              </div>
            )}
            <div>
              <h1 className="font-serif text-xl font-bold text-verde-dark">
                {cfg?.nome_escritorio ?? "JSP Contabilidade Personalizada"}
              </h1>
              {cfg?.razao_social && (
                <div className="text-xs text-gray-600">{cfg.razao_social}</div>
              )}
              {cfg?.cnpj && (
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  CNPJ {formatCNPJ(cfg.cnpj)}
                </div>
              )}
              {cfg?.endereco && (
                <div className="text-xs text-gray-500 mt-0.5 max-w-sm">
                  {cfg.endereco}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              Recibo
            </div>
            <div className="font-mono text-xs text-gray-500 mt-1">
              {fatura.id_fatura}
            </div>
            <div className="text-xs text-gray-500 mt-1">Emitido {hoje}</div>
          </div>
        </div>

        {/* Status */}
        <div className="mb-6">
          <div
            className={
              pago
                ? "inline-block px-3 py-1 rounded-full bg-verde-light text-verde-dark text-xs font-semibold"
                : "inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold"
            }
          >
            {pago ? "✓ PAGA" : "Em aberto"}
          </div>
        </div>

        <h2 className="font-serif text-2xl font-bold text-verde-dark mb-2">
          Recibo de pagamento de honorários
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-6">
          {pago ? "Recebemos" : "Cobraremos"} de{" "}
          <strong>{cliente?.razao_social ?? "—"}</strong>
          {cliente?.cnpj && (
            <>
              {" "}— CNPJ <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
            </>
          )}
          {cliente?.cpf && !cliente?.cnpj && (
            <>
              {" "}— CPF <span className="font-mono">{formatCPF(cliente.cpf)}</span>
            </>
          )}
          , a importância de <strong>{formatBRL(valor)}</strong>{" "}
          <span className="text-gray-500">({valorPorExtenso(valor)})</span>,
          referente a{" "}
          <strong>
            {fatura.descricao ?? `honorários contábeis — competência ${fatura.competencia}`}
          </strong>
          , com vencimento em{" "}
          <strong>{formatDate(fatura.data_vencimento)}</strong>
          {fatura.data_pagamento && pago && (
            <>
              , quitada em <strong>{formatDate(fatura.data_pagamento)}</strong>
            </>
          )}
          .
        </p>

        {/* Tabela de itens */}
        <table className="w-full text-sm border border-card-border rounded-lg overflow-hidden mb-6">
          <thead className="bg-verde-light text-verde-dark text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Descrição</th>
              <th className="px-4 py-2 text-left">Competência</th>
              <th className="px-4 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-3">
                {fatura.descricao ?? `Honorários contábeis ${fatura.competencia}`}
              </td>
              <td className="px-4 py-3 text-gray-600">{fatura.competencia}</td>
              <td className="px-4 py-3 text-right font-medium">
                {formatBRL(valor)}
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={2} className="px-4 py-3 text-right font-semibold">
                Total
              </td>
              <td className="px-4 py-3 text-right font-bold text-verde-dark text-base">
                {formatBRL(valor)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Assinatura */}
        <div className="mt-12 pt-6 border-t border-card-border">
          <div className="grid grid-cols-2 gap-12 text-xs text-gray-600">
            <div>
              <div className="border-b border-gray-400 h-12" />
              <div className="text-center mt-2">
                {cfg?.nome_escritorio ?? "JSP Contabilidade"}
              </div>
            </div>
            <div>
              <div className="border-b border-gray-400 h-12" />
              <div className="text-center mt-2">
                {cliente?.razao_social ?? "Cliente"}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-10 text-[10px] text-gray-400 text-center">
          {cfg?.telefone && <>Tel: {cfg.telefone} • </>}
          {cfg?.email && <>{cfg.email} • </>}
          {cfg?.site && <>{cfg.site}</>}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  Receipt,
  User as UserIcon,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";
import type { Cliente, Fatura } from "@/lib/supabase/types";
import { FaturaActions } from "./FaturaActions";

type FaturaComCliente = Fatura & { clientes: Cliente | null };

const STATUS_TONE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-700",
  PAGA: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Em aberto",
  PAGA: "Paga",
  ATRASADA: "Em atraso",
  CANCELADA: "Cancelada",
};

export default async function FaturaDetalhe({
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

  const { data, error } = await supabase
    .from("faturas")
    .select("*, clientes(*)")
    .eq("id_fatura", id)
    .single();
  if (error || !data) notFound();
  const fatura = data as unknown as FaturaComCliente;
  const cliente = fatura.clientes;

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("*")
    .order("razao_social");
  const clientes = (clientesData ?? []) as unknown as Cliente[];

  // Recalcula atrasada (visual) se vencimento já passou e ainda está ABERTA
  const hoje = new Date().toISOString().slice(0, 10);
  const statusFinal =
    fatura.status === "ABERTA" && fatura.data_vencimento < hoje
      ? "ATRASADA"
      : fatura.status;

  // Histórico relevante do mesmo cliente (5 últimas faturas)
  const { data: histData } = await supabase
    .from("faturas")
    .select("id_fatura, competencia, data_vencimento, valor, status")
    .eq("id_cliente", fatura.id_cliente)
    .neq("id_fatura", id)
    .order("data_vencimento", { ascending: false })
    .limit(5);
  const historico = (histData ?? []) as unknown as Array<{
    id_fatura: string;
    competencia: string;
    data_vencimento: string;
    valor: number;
    status: string;
  }>;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/honorarios?cliente=${fatura.id_cliente}`}
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para honorários
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white border border-card-border rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-verde-light flex items-center justify-center text-verde-dark">
              <Receipt size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${STATUS_TONE[statusFinal] ?? "bg-gray-100"}`}
                >
                  {STATUS_LABEL[statusFinal] ?? statusFinal}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {fatura.id_fatura}
                </span>
              </div>
              <h1 className="font-serif text-2xl font-bold text-verde-dark mt-1">
                {fatura.descricao ?? `Honorários ${fatura.competencia}`}
              </h1>
              <Link
                href={`/clientes/${fatura.id_cliente}`}
                className="mt-1 text-sm text-gray-600 hover:text-verde-dark inline-flex items-center gap-1"
              >
                <Building2 size={13} className="text-gold" />
                {cliente?.razao_social ?? "—"}
              </Link>
            </div>
          </div>
          <FaturaActions fatura={fatura} clientes={clientes} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Valor + detalhes */}
          <div className="bg-white border border-card-border rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Valor da fatura
            </div>
            <div className="mt-1 text-4xl font-bold font-serif text-verde-dark">
              {formatBRL(Number(fatura.valor))}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-5 border-t border-card-border text-sm">
              <Info label="Competência" value={fatura.competencia} />
              <Info
                label="Vencimento"
                value={formatDate(fatura.data_vencimento)}
                tone={
                  statusFinal === "ATRASADA"
                    ? "red"
                    : statusFinal === "PAGA"
                    ? undefined
                    : undefined
                }
              />
              <Info
                label="Data de pagamento"
                value={formatDate(fatura.data_pagamento) || "—"}
                tone={fatura.data_pagamento ? "verde" : undefined}
              />
              <Info label="Criada em" value={formatDate(fatura.created_at)} />
            </div>
          </div>

          {/* Histórico do cliente */}
          {historico.length > 0 && (
            <div className="bg-white border border-card-border rounded-xl">
              <div className="px-4 py-3 border-b border-card-border">
                <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
                  <CalendarCheck size={14} className="text-gold" />
                  Outras faturas do cliente
                </h3>
              </div>
              <div className="divide-y divide-card-border">
                {historico.map((f) => (
                  <Link
                    key={f.id_fatura}
                    href={`/honorarios/${f.id_fatura}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <div className="text-sm text-gray-800">
                        Competência {f.competencia}
                      </div>
                      <div className="text-xs text-gray-500">
                        Venc. {formatDate(f.data_vencimento)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {formatBRL(Number(f.valor))}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${STATUS_TONE[f.status] ?? "bg-gray-100"}`}
                      >
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna lateral: cliente */}
        <aside className="space-y-4">
          <div className="bg-white border border-card-border rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
              <Building2 size={14} className="text-gold" /> Cliente
            </h3>
            {cliente ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium text-gray-800">
                  {cliente.razao_social}
                </div>
                {cliente.nome_fantasia && (
                  <div className="text-xs text-gray-500">
                    {cliente.nome_fantasia}
                  </div>
                )}
                {cliente.cnpj && (
                  <div className="text-xs text-gray-500 font-mono">
                    CNPJ {formatCNPJ(cliente.cnpj)}
                  </div>
                )}
                {cliente.email && (
                  <a
                    href={`mailto:${cliente.email}`}
                    className="text-xs text-gold hover:text-verde-dark block"
                  >
                    {cliente.email}
                  </a>
                )}
                <Link
                  href={`/clientes/${cliente.id_cliente}`}
                  className="inline-block mt-2 text-xs text-gold hover:text-verde-dark"
                >
                  Ver detalhes do cliente →
                </Link>
              </div>
            ) : (
              <div className="text-xs text-gray-500">Cliente não encontrado</div>
            )}
          </div>

          {cliente?.responsavel_nome && (
            <div className="bg-white border border-card-border rounded-xl p-5">
              <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
                <UserIcon size={14} className="text-gold" /> Responsável legal
              </h3>
              <div className="text-sm font-medium text-gray-800">
                {cliente.responsavel_nome}
              </div>
              {cliente.responsavel_email && (
                <a
                  href={`mailto:${cliente.responsavel_email}`}
                  className="text-xs text-gray-500 hover:text-verde-dark block mt-1"
                >
                  {cliente.responsavel_email}
                </a>
              )}
              {cliente.responsavel_telefone && (
                <div className="text-xs text-gray-500 mt-1">
                  {cliente.responsavel_telefone}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "verde" | "red";
}) {
  const cls =
    tone === "red"
      ? "text-red-alert font-medium"
      : tone === "verde"
      ? "text-verde-dark font-medium"
      : "text-gray-800";
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className={`text-sm ${cls}`}>{value}</dd>
    </div>
  );
}

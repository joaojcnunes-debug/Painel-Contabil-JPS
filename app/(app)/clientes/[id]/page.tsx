import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  FileText,
  Mail,
  Phone,
  Receipt,
  Users as UsersIcon,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type {
  Cliente,
  ClienteContato,
  Documento,
  Fatura,
  Obrigacao,
} from "@/lib/supabase/types";
import { ClienteHeaderActions } from "./ClienteHeader";

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  MEI: "MEI",
  DOMESTICO: "Doméstico",
  PRODUTOR_RURAL: "Produtor Rural",
};

const STATUS_TONE: Record<string, string> = {
  Ativo: "bg-verde-light text-verde-dark",
  Inativo: "bg-gray-100 text-gray-600",
  Suspenso: "bg-amber-100 text-amber-800",
};

const OBR_STYLE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

const FAT_STYLE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-700",
  PAGA: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-500",
};

type ObrigacaoExp = Obrigacao & {
  obrigacoes_catalogo: { sigla: string; nome: string } | null;
};

export default async function ClienteDetalhe({
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

  const { data: clienteData, error: errCliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id_cliente", id)
    .single();
  if (errCliente || !clienteData) notFound();
  const cliente = clienteData as Cliente;

  const [
    contatosRes,
    obrigPendCount,
    obrigAtrasCount,
    docsCount,
    fatAbertoSum,
    obrigRecentes,
    docsRecentes,
    faturasRecentes,
  ] = await Promise.all([
    supabase
      .from("clientes_contatos")
      .select("*")
      .eq("id_cliente", id)
      .order("principal", { ascending: false }),
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", id)
      .in("status", ["PENDENTE", "EM_ANDAMENTO"]),
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", id)
      .eq("status", "ATRASADA"),
    supabase
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", id),
    supabase
      .from("faturas")
      .select("valor")
      .eq("id_cliente", id)
      .in("status", ["ABERTA", "ATRASADA"]),
    supabase
      .from("obrigacoes")
      .select("*, obrigacoes_catalogo(sigla, nome)")
      .eq("id_cliente", id)
      .order("data_vencimento", { ascending: false })
      .limit(10),
    supabase
      .from("documentos")
      .select("*")
      .eq("id_cliente", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("faturas")
      .select("*")
      .eq("id_cliente", id)
      .order("data_vencimento", { ascending: false })
      .limit(10),
  ]);

  const contatos = (contatosRes.data ?? []) as unknown as ClienteContato[];
  const obrigacoes = (obrigRecentes.data ?? []) as unknown as ObrigacaoExp[];
  const documentos = (docsRecentes.data ?? []) as unknown as Documento[];
  const faturas = (faturasRecentes.data ?? []) as unknown as Fatura[];
  const totalAReceber = (
    (fatAbertoSum.data ?? []) as unknown as Array<{ valor: number }>
  ).reduce((acc, f) => acc + Number(f.valor ?? 0), 0);

  return (
    <div>
      <div className="mb-3">
        <Link
          href="/clientes"
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para clientes
        </Link>
      </div>

      {/* Header com identidade da empresa */}
      <div className="bg-white border border-card-border rounded-xl p-6 mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-verde-light flex items-center justify-center text-verde-dark">
            <Building2 size={26} />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-verde-dark">
              {cliente.razao_social}
            </h1>
            {cliente.nome_fantasia && (
              <div className="text-sm text-gray-600">{cliente.nome_fantasia}</div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`px-2 py-1 rounded-full ${STATUS_TONE[cliente.status] ?? "bg-gray-100"}`}
              >
                {cliente.status}
              </span>
              <span className="px-2 py-1 rounded-full bg-verde-light text-verde-dark">
                {REGIME_LABEL[cliente.regime] ?? cliente.regime}
              </span>
              {cliente.cnpj && (
                <span className="text-gray-500 font-mono">
                  CNPJ {formatCNPJ(cliente.cnpj)}
                </span>
              )}
              {cliente.cpf && !cliente.cnpj && (
                <span className="text-gray-500 font-mono">
                  CPF {formatCPF(cliente.cpf)}
                </span>
              )}
            </div>
            {cliente.atividade_principal && (
              <div className="mt-2 text-xs text-gray-600 max-w-xl">
                <span className="text-gray-500">Atividade:</span>{" "}
                {cliente.atividade_principal}
              </div>
            )}
          </div>
        </div>
        <ClienteHeaderActions cliente={cliente} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Obrigações em aberto"
          value={obrigPendCount.count ?? 0}
          icon={CalendarCheck}
          tone="amber"
        />
        <Stat
          label="Atrasadas"
          value={obrigAtrasCount.count ?? 0}
          icon={CalendarCheck}
          tone={obrigAtrasCount.count ? "red" : "neutral"}
        />
        <Stat
          label="Documentos"
          value={docsCount.count ?? 0}
          icon={FileText}
          tone="verde"
        />
        <Stat
          label="A receber"
          value={formatBRL(totalAReceber)}
          icon={Receipt}
          tone={totalAReceber > 0 ? "verde" : "neutral"}
        />
      </div>

      {/* Linhas-resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel
          title="Últimas obrigações"
          href={`/obrigacoes?cliente=${id}`}
          empty="Nenhuma obrigação lançada ainda"
        >
          {obrigacoes.map((o) => (
            <div
              key={o.id_obrigacao}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm text-gray-800 truncate">
                  <span className="font-mono text-xs text-verde-dark mr-2">
                    {o.obrigacoes_catalogo?.sigla ?? "—"}
                  </span>
                  {o.obrigacoes_catalogo?.nome}
                </div>
                <div className="text-xs text-gray-500">
                  Competência {o.competencia} • Venc. {formatDate(o.data_vencimento)}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${OBR_STYLE[o.status] ?? "bg-gray-100"}`}
              >
                {o.status}
              </span>
            </div>
          ))}
        </Panel>

        <Panel
          title="Últimas faturas"
          href={`/honorarios?cliente=${id}`}
          empty="Nenhuma fatura"
        >
          {faturas.map((f) => (
            <div
              key={f.id_fatura}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm text-gray-800">
                  {f.descricao ?? `Honorários ${f.competencia}`}
                </div>
                <div className="text-xs text-gray-500">
                  Venc. {formatDate(f.data_vencimento)}
                  {f.data_pagamento && ` • Pago em ${formatDate(f.data_pagamento)}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                  {formatBRL(Number(f.valor))}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${FAT_STYLE[f.status] ?? "bg-gray-100"}`}
                >
                  {f.status}
                </span>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Últimos documentos"
          href={`/documentos?cliente=${id}`}
          empty="Nenhum documento ainda"
        >
          {documentos.map((d) => (
            <div
              key={d.id_documento}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm text-gray-800 truncate">
                  {d.arquivo_nome}
                </div>
                <div className="text-xs text-gray-500">
                  {d.tipo}
                  {d.competencia && ` • ${d.competencia}`}
                  {d.origem === "CLIENTE" && " • enviado pelo cliente"}
                </div>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(d.created_at)}
              </span>
            </div>
          ))}
        </Panel>

        <Panel
          title="Contatos"
          href="#"
          empty="Nenhum contato cadastrado"
          icon={UsersIcon}
        >
          {contatos.map((c) => (
            <div key={c.id_contato} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-gray-800">
                  {c.nome}
                </div>
                {c.principal && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gold/20 text-gold">
                    principal
                  </span>
                )}
              </div>
              {c.cargo && (
                <div className="text-xs text-gray-500">{c.cargo}</div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                {c.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail size={11} /> {c.email}
                  </span>
                )}
                {c.telefone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={11} /> {c.telefone}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* Bloco financeiro/observações */}
      {(cliente.honorario_mensal != null ||
        cliente.dia_vencimento ||
        cliente.inicio_contrato ||
        cliente.observacoes) && (
        <div className="mt-4 bg-white border border-card-border rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3">
            Contrato
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase">Honorário</div>
              <div className="text-gray-800 font-medium">
                {formatBRL(cliente.honorario_mensal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Dia vencto</div>
              <div className="text-gray-800">
                {cliente.dia_vencimento ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Início</div>
              <div className="text-gray-800">
                {formatDate(cliente.inicio_contrato)}
              </div>
            </div>
          </div>
          {cliente.observacoes && (
            <div className="mt-3 text-sm text-gray-600 whitespace-pre-line">
              {cliente.observacoes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: "verde" | "amber" | "red" | "neutral";
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "amber"
      ? "text-amber-warning"
      : tone === "verde"
      ? "text-verde-dark"
      : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        <Icon className="text-gold" size={18} />
      </div>
      <div className={`mt-2 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  href,
  empty,
  icon: Icon,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
          {Icon && <Icon size={14} className="text-gold" />}
          {title}
        </h3>
        {href !== "#" && (
          <Link href={href} className="text-xs text-gold hover:text-verde-dark">
            Ver todos
          </Link>
        )}
      </div>
      <div className="divide-y divide-card-border">
        {arr.length > 0 ? (
          arr
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-500">{empty}</div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { CalendarCheck, FileText, Receipt, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  getServerSupabase,
  getUsuarioPerfil,
} from "@/lib/supabase/server-cache";
import { formatBRL, formatDate } from "@/lib/utils";

type ProximaObrig = {
  id_obrigacao: string;
  competencia: string;
  data_vencimento: string;
  status: string;
  obrigacoes_catalogo: { sigla: string; nome: string } | null;
};

type ProximaFatura = {
  id_fatura: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  status: string;
};

export default async function PortalInicio() {
  const supabase = await getServerSupabase();
  const usuario = await getUsuarioPerfil();
  const idCliente = usuario?.id_cliente ?? "";

  const [obrigPend, docs, fatPend, proxObrig, proxFat] = await Promise.all([
    supabase
      .from("obrigacoes")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente)
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"]),
    supabase
      .from("documentos")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente),
    supabase
      .from("faturas")
      .select("*", { count: "exact", head: true })
      .eq("id_cliente", idCliente)
      .in("status", ["ABERTA", "ATRASADA"]),
    supabase
      .from("obrigacoes")
      .select(
        "id_obrigacao, competencia, data_vencimento, status, obrigacoes_catalogo(sigla, nome)"
      )
      .eq("id_cliente", idCliente)
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
      .order("data_vencimento")
      .limit(5),
    supabase
      .from("faturas")
      .select("id_fatura, competencia, data_vencimento, valor, status")
      .eq("id_cliente", idCliente)
      .in("status", ["ABERTA", "ATRASADA"])
      .order("data_vencimento")
      .limit(5),
  ]);

  const proximasObrig = (proxObrig.data ?? []) as unknown as ProximaObrig[];
  const proximasFat = (proxFat.data ?? []) as unknown as ProximaFatura[];

  return (
    <div>
      <PageHeader
        title={`Olá, ${usuario?.nome ?? "cliente"}`}
        subtitle="Visão geral da sua conta"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card
          label="Obrigações em aberto"
          value={obrigPend.count ?? 0}
          icon={CalendarCheck}
          tone="amber"
          href="/portal/obrigacoes"
        />
        <Card
          label="Documentos enviados"
          value={docs.count ?? 0}
          icon={FileText}
          tone="verde"
          href="/portal/documentos"
        />
        <Card
          label="Faturas a pagar"
          value={fatPend.count ?? 0}
          icon={Receipt}
          tone="red"
          href="/portal/financeiro"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Próximas obrigações"
          href="/portal/obrigacoes"
          empty="Nenhuma obrigação em aberto"
        >
          {proximasObrig.map((o) => (
            <Row
              key={o.id_obrigacao}
              titulo={
                <>
                  <span className="font-mono text-xs text-verde-dark mr-2">
                    {o.obrigacoes_catalogo?.sigla ?? "—"}
                  </span>
                  {o.obrigacoes_catalogo?.nome}
                </>
              }
              detalhe={`Competência ${o.competencia}`}
              valor={formatDate(o.data_vencimento)}
              destaque
            />
          ))}
        </Panel>

        <Panel
          title="Próximas faturas"
          href="/portal/financeiro"
          empty="Nenhuma fatura em aberto"
        >
          {proximasFat.map((f) => (
            <Row
              key={f.id_fatura}
              titulo={`Honorários ${f.competencia}`}
              detalhe={`Venc. ${formatDate(f.data_vencimento)}`}
              valor={formatBRL(Number(f.valor))}
              destaque
            />
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: "verde" | "amber" | "red";
  href: string;
}) {
  const toneCls =
    tone === "red"
      ? "text-red-alert"
      : tone === "amber"
      ? "text-amber-warning"
      : "text-verde-dark";
  return (
    <Link
      href={href}
      className="bg-white border border-card-border rounded-xl p-5 hover:border-verde-primary transition group"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {label}
          </div>
          <div className={`mt-2 text-3xl font-bold ${toneCls}`}>{value}</div>
        </div>
        <Icon className="text-gold" size={24} />
      </div>
      <div className="mt-3 text-xs text-gray-500 group-hover:text-verde-dark flex items-center gap-1">
        Ver detalhes <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  empty,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark">
          {title}
        </h3>
        <Link
          href={href}
          className="text-xs text-gold hover:text-verde-dark flex items-center gap-1"
        >
          Ver todas <ArrowRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-card-border">
        {hasChildren ? (
          children
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-500">{empty}</div>
        )}
      </div>
    </div>
  );
}

function Row({
  titulo,
  detalhe,
  valor,
  destaque,
}: {
  titulo: React.ReactNode;
  detalhe: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-gray-800 truncate">{titulo}</div>
        <div className="text-xs text-gray-500">{detalhe}</div>
      </div>
      <div
        className={
          destaque
            ? "text-sm font-medium text-verde-dark whitespace-nowrap"
            : "text-sm text-gray-600 whitespace-nowrap"
        }
      >
        {valor}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  Building2,
  CalendarCheck,
  Clock,
  FileText,
  User as UserIcon,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type {
  Cliente,
  Obrigacao,
  ObrigacaoCatalogo,
} from "@/lib/supabase/types";
import { ObrigacaoActions } from "./ObrigacaoActions";
import { ComentariosThread } from "@/components/obrigacoes/ComentariosThread";

type Cat = ObrigacaoCatalogo;
type ObrigComJoin = Obrigacao & {
  clientes: Cliente | null;
  obrigacoes_catalogo: Cat | null;
};

const STATUS_TONE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  ENTREGUE: "Entregue",
  ATRASADA: "Atrasada",
  DISPENSADA: "Dispensada",
};

const ESFERA_TONE: Record<string, string> = {
  FEDERAL: "bg-verde-light text-verde-dark",
  ESTADUAL: "bg-blue-100 text-blue-800",
  MUNICIPAL: "bg-amber-100 text-amber-800",
  TRABALHISTA: "bg-purple-100 text-purple-800",
};

export default async function ObrigacaoDetalhe({
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

  const { data: obrigData, error } = await supabase
    .from("obrigacoes")
    .select(
      "*, clientes(*), obrigacoes_catalogo(*)"
    )
    .eq("id_obrigacao", id)
    .single();
  if (error || !obrigData) notFound();
  const obrig = obrigData as unknown as ObrigComJoin;

  const cliente = obrig.clientes;
  const cat = obrig.obrigacoes_catalogo;

  // Carrega listas para passar pro ObrigacaoFormModal (edição inline)
  const [{ data: clientesData }, { data: catalogoData }] = await Promise.all([
    supabase.from("clientes").select("*").order("razao_social"),
    supabase
      .from("obrigacoes_catalogo")
      .select("*")
      .order("sigla"),
  ]);
  const clientes = (clientesData ?? []) as unknown as Cliente[];
  const catalogo = (catalogoData ?? []) as unknown as ObrigacaoCatalogo[];

  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada =
    (obrig.status === "PENDENTE" || obrig.status === "EM_ANDAMENTO") &&
    obrig.data_vencimento < hoje;
  const statusFinal = atrasada ? "ATRASADA" : obrig.status;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/obrigacoes?cliente=${obrig.id_cliente}`}
          className="text-xs text-gray-500 hover:text-verde-dark inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para obrigações
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white border border-card-border rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-verde-light flex items-center justify-center text-verde-dark">
              <CalendarCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-gold font-bold">
                  {cat?.sigla ?? "—"}
                </span>
                {cat?.esfera && (
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ESFERA_TONE[cat.esfera] ?? "bg-gray-100"}`}
                  >
                    {cat.esfera}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-1 rounded-full ${STATUS_TONE[statusFinal] ?? "bg-gray-100"}`}
                >
                  {STATUS_LABEL[statusFinal] ?? statusFinal}
                </span>
              </div>
              <h1 className="font-serif text-2xl font-bold text-verde-dark mt-1">
                {cat?.nome ?? "—"}
              </h1>
              <Link
                href={`/clientes/${obrig.id_cliente}`}
                className="mt-1 text-sm text-gray-600 hover:text-verde-dark inline-flex items-center gap-1"
              >
                <Building2 size={13} className="text-gold" />
                {cliente?.razao_social ?? "—"}
              </Link>
            </div>
          </div>
          <ObrigacaoActions
            obrigacao={obrig}
            clientes={clientes}
            catalogo={catalogo}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna 1 e 2: comentários */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-card-border rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold text-verde-dark mb-4 flex items-center gap-2">
              <FileText size={14} className="text-gold" /> Detalhes
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Info label="Competência" value={obrig.competencia} />
              <Info label="Periodicidade" value={cat?.periodicidade ?? "—"} />
              <Info
                label="Vencimento"
                value={formatDate(obrig.data_vencimento)}
                tone={atrasada ? "red" : undefined}
              />
              <Info
                label="Data de entrega"
                value={formatDate(obrig.data_entrega) || "—"}
                tone={obrig.data_entrega ? "verde" : undefined}
              />
              <Info
                label="Responsável"
                value={obrig.responsavel || "(não atribuído)"}
              />
              <Info
                label="Criada em"
                value={formatDate(obrig.created_at)}
              />
            </dl>
            {obrig.observacoes && (
              <div className="mt-4 pt-4 border-t border-card-border">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Observações
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-line">
                  {obrig.observacoes}
                </div>
              </div>
            )}
          </div>

          <ComentariosThread idObrigacao={obrig.id_obrigacao} />
        </div>

        {/* Coluna 3: contexto do cliente */}
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
                    CNPJ {cliente.cnpj}
                  </div>
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

          <div className="bg-white border border-card-border rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
              <Clock size={14} className="text-gold" /> Atualização
            </h3>
            <div className="text-xs text-gray-500 space-y-1">
              <div>
                Criada em <strong>{formatDate(obrig.created_at)}</strong>
              </div>
              {obrig.updated_at && (
                <div>
                  Atualizada em <strong>{formatDate(obrig.updated_at)}</strong>
                </div>
              )}
            </div>
          </div>
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

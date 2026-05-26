import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  MinusCircle,
  PlusCircle,
  Edit3,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inputClass } from "@/components/ui/Field";
import {
  getServerSupabase,
  getUsuarioPerfil,
} from "@/lib/supabase/server-cache";
import { DiffRow } from "./DiffRow";

type Entry = {
  id: number;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  autor_email: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  created_at: string;
};

const ACAO_LABEL: Record<string, string> = {
  INSERT: "Criou",
  UPDATE: "Editou",
  DELETE: "Excluiu",
};

const ACAO_ICON = {
  INSERT: PlusCircle,
  UPDATE: Edit3,
  DELETE: MinusCircle,
} as const;

const ACAO_TONE: Record<string, string> = {
  INSERT: "bg-verde-light text-verde-dark",
  UPDATE: "bg-amber-100 text-amber-800",
  DELETE: "bg-red-100 text-red-700",
};

const TABELAS = [
  { value: "clientes", label: "Clientes" },
  { value: "obrigacoes", label: "Obrigações" },
  { value: "faturas", label: "Faturas" },
  { value: "documentos", label: "Documentos" },
  { value: "usuarios", label: "Usuários" },
  { value: "configuracoes", label: "Configurações" },
  { value: "clientes_contatos", label: "Contatos" },
  { value: "obrigacoes_catalogo", label: "Catálogo de obrigações" },
];

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tabela?: string;
    acao?: string;
    autor?: string;
  }>;
}) {
  const sp = await searchParams;

  // Guard: só Admin
  const usuario = await getUsuarioPerfil();
  if (usuario?.perfil !== "Admin") {
    redirect("/inicio");
  }

  const supabase = await getServerSupabase();

  let q = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.tabela) q = q.eq("tabela", sp.tabela);
  if (sp.acao) q = q.eq("acao", sp.acao);
  if (sp.autor) q = q.ilike("autor_email", `%${sp.autor}%`);

  const { data } = await q;
  const entries = (data ?? []) as unknown as Entry[];

  return (
    <div>
      <PageHeader
        title="Logs de auditoria"
        subtitle="Trilha de mudanças no sistema (últimas 200)"
      />

      {/* Filtros — server-side via URL */}
      <form className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Tabela
          </label>
          <select name="tabela" defaultValue={sp.tabela ?? ""} className={inputClass}>
            <option value="">Todas</option>
            {TABELAS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Ação
          </label>
          <select name="acao" defaultValue={sp.acao ?? ""} className={inputClass}>
            <option value="">Todas</option>
            <option value="INSERT">Criação</option>
            <option value="UPDATE">Edição</option>
            <option value="DELETE">Exclusão</option>
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            E-mail do autor (contém)
          </label>
          <input
            name="autor"
            defaultValue={sp.autor ?? ""}
            className={inputClass}
            placeholder="parte do e-mail..."
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-verde-primary text-white text-sm font-medium rounded-lg hover:bg-verde-accent"
        >
          Aplicar
        </button>
        {(sp.tabela || sp.acao || sp.autor) && (
          <Link
            href="/logs"
            className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark"
          >
            Limpar
          </Link>
        )}
        <div className="ml-auto text-sm text-gray-500">
          {entries.length} registro{entries.length !== 1 && "s"}
        </div>
      </form>

      {/* Lista */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            Nenhum registro encontrado.
          </div>
        ) : (
          <div className="divide-y divide-card-border">
            {entries.map((e) => {
              const Icon = ACAO_ICON[e.acao];
              return (
                <div key={e.id} className="px-4 py-3 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 flex-shrink-0">
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ACAO_TONE[e.acao] ?? "bg-gray-100"}`}
                        >
                          {ACAO_LABEL[e.acao] ?? e.acao}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          {e.tabela}
                        </span>
                        {e.registro_id && (
                          <span className="font-mono text-xs text-gray-500">
                            {e.registro_id}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {formatTs(e.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        por{" "}
                        <span className="text-gray-700">
                          {e.autor_email ?? "(sistema)"}
                        </span>
                      </div>
                      <DiffRow
                        acao={e.acao}
                        antes={e.dados_antes}
                        depois={e.dados_depois}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

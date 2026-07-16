// NFs Recebidas — listagem de XMLs baixados pela Distribuição DFe.
//
// Server Component que lê nfe_dfe_recebidas com filtros via searchParams.
// Filtros: cliente, ambiente, período (data de emissão), busca por emitente.

import Link from "next/link";
import { ArrowLeft, Download, FileCode, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";
import { BaixarXmlButton } from "./BaixarXmlButton";

type Search = {
  cliente?: string;
  ambiente?: string;
  emit?: string;
  de?: string; // dh_emissao >= de
  ate?: string; // dh_emissao <= ate
  desde?: string; // atalho para baixado_em >= now-X (24h, 7d, 30d ou YYYY-MM-DD)
};

// Traduz `?desde=24h|7d|30d|YYYY-MM-DD` em um timestamp ISO comparável
function parseDesde(v: string | undefined): string | null {
  if (!v) return null;
  const now = Date.now();
  const m = /^(\d+)([hd])$/.exec(v);
  if (m) {
    const n = Number(m[1]);
    const ms = m[2] === "h" ? n * 3600_000 : n * 86400_000;
    return new Date(now - ms).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + "T00:00:00Z";
  return null;
}

type Recebida = {
  chave: string;
  id_cliente: string;
  ambiente: number;
  nsu: string | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  numero: string | null;
  serie: string | null;
  valor_total: number | null;
  dh_emissao: string | null;
  baixado_em: string;
  clientes: { razao_social: string } | null;
};

export default async function RecebidasPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await getServerSupabase();

  // Lista de clientes pro dropdown (RLS já filtra)
  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id_cliente, razao_social")
    .order("razao_social")
    .limit(500);
  const clientes = (clientesData ?? []) as Array<{
    id_cliente: string;
    razao_social: string;
  }>;

  // Query principal com filtros
  let q = supabase
    .from("nfe_dfe_recebidas")
    .select(
      "chave, id_cliente, ambiente, nsu, emitente_cnpj, emitente_nome, numero, serie, valor_total, dh_emissao, baixado_em, clientes(razao_social)"
    )
    .order("baixado_em", { ascending: false })
    .limit(200);

  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);
  if (sp.ambiente === "1" || sp.ambiente === "2") {
    q = q.eq("ambiente", Number(sp.ambiente));
  }
  if (sp.emit) q = q.ilike("emitente_nome", `%${sp.emit}%`);
  if (sp.de) q = q.gte("dh_emissao", sp.de);
  if (sp.ate) q = q.lte("dh_emissao", sp.ate + "T23:59:59");
  const desdeIso = parseDesde(sp.desde);
  if (desdeIso) q = q.gte("baixado_em", desdeIso);

  const { data, error } = await q;
  const recebidas = (data ?? []) as unknown as Recebida[];

  const totalValor = recebidas.reduce(
    (acc, r) => acc + (Number(r.valor_total) || 0),
    0
  );
  const totalEmitentes = new Set(
    recebidas.map((r) => r.emitente_cnpj).filter(Boolean)
  ).size;

  return (
    <div>
      <PageHeader
        title="NFs recebidas — Distribuição DFe"
        subtitle="XMLs baixados da SEFAZ e armazenados no bucket"
        actions={
          <Link href="/integracoes/notas-fiscais">
            <Button variant="secondary" className="flex items-center gap-2">
              <ArrowLeft size={16} /> Voltar ao painel NFs
            </Button>
          </Link>
        }
      />

      {sp.desde && desdeIso && (
        <div className="bg-verde-light border border-verde-primary/30 rounded-xl p-3 mb-4 text-xs text-verde-dark flex items-center justify-between">
          <span>
            Mostrando NFe <strong>baixadas nas últimas {sp.desde}</strong>
            {" · "}{recebidas.length} nota(s), {formatBRL(totalValor)} em valor
          </span>
          <Link
            href="/integracoes/notas-fiscais/recebidas"
            className="underline hover:text-verde-primary"
          >
            Ver todas
          </Link>
        </div>
      )}

      {/* Filtros */}
      <form
        method="get"
        className="bg-white border border-card-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select name="cliente" defaultValue={sp.cliente ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Ambiente
          </label>
          <select name="ambiente" defaultValue={sp.ambiente ?? ""} className={inputClass}>
            <option value="">Ambos</option>
            <option value="1">Produção</option>
            <option value="2">Homologação</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Emitente (busca)
          </label>
          <input
            name="emit"
            defaultValue={sp.emit ?? ""}
            placeholder="Razão social..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Emissão de
          </label>
          <input
            type="date"
            name="de"
            defaultValue={sp.de ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Emissão até
          </label>
          <input
            type="date"
            name="ate"
            defaultValue={sp.ate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-5 flex justify-end gap-2">
          <Link href="/integracoes/notas-fiscais/recebidas">
            <Button variant="secondary" type="button">
              Limpar
            </Button>
          </Link>
          <Button type="submit" className="flex items-center gap-2">
            <Search size={14} /> Filtrar
          </Button>
        </div>
      </form>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card label="NFs encontradas" value={`${recebidas.length}`} />
        <Card label="Emitentes únicos" value={`${totalEmitentes}`} />
        <Card label="Valor total" value={formatBRL(totalValor)} />
      </div>

      {/* Tabela */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-28">Emissão</th>
              <th className="px-4 py-3">Emitente</th>
              <th className="px-4 py-3 w-24">NF</th>
              <th className="px-4 py-3 w-32 text-right">Valor</th>
              <th className="px-4 py-3 w-32">Cliente</th>
              <th className="px-4 py-3 w-20">Amb</th>
              <th className="px-4 py-3 w-24">Baixado</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {error && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-red-alert text-sm">
                  Erro: {error.message}
                </td>
              </tr>
            )}
            {!error && recebidas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                  <FileCode size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhuma NF recebida com esses filtros.
                </td>
              </tr>
            )}
            {recebidas.map((r) => (
              <tr key={r.chave} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {r.dh_emissao ? formatDate(r.dh_emissao.slice(0, 10)) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-800">
                  <div className="truncate max-w-xs">
                    {r.emitente_nome ?? "—"}
                  </div>
                  {r.emitente_cnpj && (
                    <div className="text-[10px] text-gray-500 font-mono">
                      {formatCNPJ(r.emitente_cnpj)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {r.numero ?? "—"}
                  {r.serie && (
                    <span className="text-[10px] text-gray-500 ml-1">
                      /{r.serie}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-verde-dark whitespace-nowrap">
                  {r.valor_total != null ? formatBRL(Number(r.valor_total)) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[150px]">
                  {r.clientes?.razao_social ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      r.ambiente === 1
                        ? "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-verde-light text-verde-dark"
                        : "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                    }
                  >
                    {r.ambiente === 1 ? "Prod" : "Homol"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                  {formatDate(r.baixado_em.slice(0, 10))}
                </td>
                <td className="px-4 py-3 text-right">
                  <BaixarXmlButton chave={r.chave} numero={r.numero ?? r.chave.slice(-6)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recebidas.length === 200 && (
          <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-card-border">
            Mostrando os 200 mais recentes. Use os filtros pra refinar.
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-bold text-verde-dark">{value}</div>
    </div>
  );
}

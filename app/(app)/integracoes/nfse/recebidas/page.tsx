// NFSe Recebidas — listagem de NFSe baixadas via API do Emissor Nacional.
//
// Server Component que lê nfse_recebidas com filtros via searchParams.

import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeft, FileCode, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getServerSupabase } from "@/lib/supabase/server-cache";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/utils";
import { BaixarNfseXmlButton } from "./BaixarNfseXmlButton";
import { ImportarNfseManualButton } from "./ImportarNfseManualButton";

type Search = {
  cliente?: string;
  ambiente?: string;
  papel?: string;
  status?: string;
  prestador?: string;
  tomador?: string;
  de?: string;
  ate?: string;
  competencia?: string; // YYYY-MM
  ordem?: string; // emissao_desc | emissao_asc | valor_desc | valor_asc | numero_desc | numero_asc | tomador_asc
};

type Ordem = {
  campo: "dh_emissao" | "valor_servicos" | "numero_nfse" | "tomador_nome";
  asc: boolean;
};

const ORDENS: Record<string, Ordem> = {
  emissao_desc: { campo: "dh_emissao", asc: false },
  emissao_asc: { campo: "dh_emissao", asc: true },
  valor_desc: { campo: "valor_servicos", asc: false },
  valor_asc: { campo: "valor_servicos", asc: true },
  numero_desc: { campo: "numero_nfse", asc: false },
  numero_asc: { campo: "numero_nfse", asc: true },
  tomador_asc: { campo: "tomador_nome", asc: true },
  tomador_desc: { campo: "tomador_nome", asc: false },
};

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function formatCompetencia(yyyyMM: string): string {
  const m = yyyyMM.match(/^(\d{4})-(\d{2})$/);
  if (!m) return yyyyMM;
  const mes = MESES_PT[Number(m[2]) - 1] ?? m[2];
  return `${mes}/${m[1]}`;
}

type NfseRow = {
  chave: string;
  id_cliente: string;
  ambiente: number;
  papel: string | null;
  numero_nfse: string | null;
  serie: string | null;
  dh_emissao: string | null;
  status: string;
  prestador_cnpj: string | null;
  prestador_nome: string | null;
  tomador_cnpj: string | null;
  tomador_nome: string | null;
  valor_servicos: number | null;
  valor_iss: number | null;
  valor_liquido: number | null;
  discriminacao: string | null;
  baixado_em: string;
  clientes: { razao_social: string } | null;
};

const PAPEL_COR: Record<string, string> = {
  PRESTADOR: "bg-verde-light text-verde-dark",
  TOMADOR: "bg-blue-100 text-blue-700",
  INTERMEDIARIO: "bg-amber-100 text-amber-800",
};

const STATUS_COR: Record<string, string> = {
  AUTORIZADA: "bg-verde-light text-verde-dark",
  CANCELADA: "bg-red-100 text-red-alert",
  SUBSTITUIDA: "bg-gray-200 text-gray-700",
  REJEITADA: "bg-amber-100 text-amber-800",
};

export default async function NfseRecebidasPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await getServerSupabase();

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id_cliente, razao_social")
    .order("razao_social")
    .limit(500);
  const clientes = (clientesData ?? []) as Array<{
    id_cliente: string;
    razao_social: string;
  }>;

  let q = supabase
    .from("nfse_recebidas")
    .select(
      "chave, id_cliente, ambiente, papel, numero_nfse, serie, dh_emissao, status, prestador_cnpj, prestador_nome, tomador_cnpj, tomador_nome, valor_servicos, valor_iss, valor_liquido, discriminacao, baixado_em, clientes(razao_social)"
    )
    .order("dh_emissao", { ascending: false, nullsFirst: false })
    .limit(200);

  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);
  if (sp.ambiente === "1" || sp.ambiente === "2") {
    q = q.eq("ambiente", Number(sp.ambiente));
  }
  if (sp.papel) q = q.eq("papel", sp.papel);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.prestador) q = q.ilike("prestador_nome", `%${sp.prestador}%`);
  if (sp.tomador) q = q.ilike("tomador_nome", `%${sp.tomador}%`);
  if (sp.de) q = q.gte("dh_emissao", sp.de);
  if (sp.ate) q = q.lte("dh_emissao", sp.ate + "T23:59:59");
  if (sp.competencia && /^\d{4}-\d{2}$/.test(sp.competencia)) {
    const [anoStr, mesStr] = sp.competencia.split("-");
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const proxMes = mes === 12 ? 1 : mes + 1;
    const proxAno = mes === 12 ? ano + 1 : ano;
    const inicio = `${anoStr}-${mesStr}-01`;
    const fim = `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;
    q = q.gte("dh_emissao", inicio).lt("dh_emissao", fim);
  }

  const { data, error } = await q;
  const nfses = (data ?? []) as unknown as NfseRow[];

  const totalValor = nfses.reduce(
    (acc, r) => acc + (Number(r.valor_servicos) || 0),
    0
  );
  const totalIss = nfses.reduce((acc, r) => acc + (Number(r.valor_iss) || 0), 0);
  const totalCanceladas = nfses.filter((r) => r.status === "CANCELADA").length;

  // Agrupa por competência (YYYY-MM extraído de dh_emissao). A ordem dos
  // grupos vem sempre por competência desc. A ordem DENTRO de cada grupo é
  // definida por sp.ordem (default: emissão desc).
  const ordemAtual = ORDENS[sp.ordem ?? "emissao_desc"] ?? ORDENS.emissao_desc;
  const grupos = new Map<
    string,
    { itens: NfseRow[]; valor: number; iss: number; canceladas: number }
  >();
  for (const n of nfses) {
    const comp = n.dh_emissao ? n.dh_emissao.slice(0, 7) : "sem-data";
    const g = grupos.get(comp) ?? { itens: [], valor: 0, iss: 0, canceladas: 0 };
    g.itens.push(n);
    g.valor += Number(n.valor_servicos) || 0;
    g.iss += Number(n.valor_iss) || 0;
    if (n.status === "CANCELADA") g.canceladas++;
    grupos.set(comp, g);
  }
  // Ordena itens dentro de cada grupo conforme escolha do usuário
  for (const g of grupos.values()) {
    g.itens.sort((a, b) => {
      const va = a[ordemAtual.campo];
      const vb = b[ordemAtual.campo];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return ordemAtual.asc ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return ordemAtual.asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }

  return (
    <div>
      <PageHeader
        title="Notas Fiscais Emitidas"
        subtitle="NFSe importadas manualmente ou baixadas via API do Emissor Nacional"
        actions={
          <div className="flex items-center gap-2">
            <ImportarNfseManualButton />
            <Link href="/integracoes/prefeituras">
              <Button variant="secondary" className="flex items-center gap-2">
                <ArrowLeft size={16} /> Voltar a Prefeituras
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filtros */}
      <form
        method="get"
        className="bg-white border border-card-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select
            name="cliente"
            defaultValue={sp.cliente ?? ""}
            className={inputClass}
          >
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
            Papel
          </label>
          <select name="papel" defaultValue={sp.papel ?? ""} className={inputClass}>
            <option value="">Todos</option>
            <option value="PRESTADOR">Como prestador</option>
            <option value="TOMADOR">Como tomador</option>
            <option value="INTERMEDIARIO">Como intermediário</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Status
          </label>
          <select name="status" defaultValue={sp.status ?? ""} className={inputClass}>
            <option value="">Todos</option>
            <option value="AUTORIZADA">Autorizada</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="SUBSTITUIDA">Substituída</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Ambiente
          </label>
          <select
            name="ambiente"
            defaultValue={sp.ambiente ?? ""}
            className={inputClass}
          >
            <option value="">Ambos</option>
            <option value="1">Produção</option>
            <option value="2">Homologação</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Prestador (nome)
          </label>
          <input
            name="prestador"
            defaultValue={sp.prestador ?? ""}
            placeholder="razão social..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Tomador (nome)
          </label>
          <input
            name="tomador"
            defaultValue={sp.tomador ?? ""}
            placeholder="razão social..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Emitida de
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
            Emitida até
          </label>
          <input
            type="date"
            name="ate"
            defaultValue={sp.ate ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Competência
          </label>
          <input
            type="month"
            name="competencia"
            defaultValue={sp.competencia ?? ""}
            className={inputClass}
            title="Filtra pelo mês/ano de emissão"
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Ordenar por
          </label>
          <select
            name="ordem"
            defaultValue={sp.ordem ?? "emissao_desc"}
            className={inputClass}
            title="Ordem dentro de cada mês"
          >
            <option value="emissao_desc">Emissão (mais recente)</option>
            <option value="emissao_asc">Emissão (mais antiga)</option>
            <option value="valor_desc">Valor (maior primeiro)</option>
            <option value="valor_asc">Valor (menor primeiro)</option>
            <option value="numero_desc">Número (maior primeiro)</option>
            <option value="numero_asc">Número (menor primeiro)</option>
            <option value="tomador_asc">Tomador (A→Z)</option>
            <option value="tomador_desc">Tomador (Z→A)</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
          <Link href="/integracoes/nfse/recebidas">
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <Card label="NFSe encontradas" value={`${nfses.length}`} tone="neutral" />
        <Card label="Valor serviços" value={formatBRL(totalValor)} tone="verde" />
        <Card label="ISS total" value={formatBRL(totalIss)} tone="neutral" />
        <Card
          label="Canceladas"
          value={`${totalCanceladas}`}
          tone={totalCanceladas > 0 ? "red" : "neutral"}
        />
      </div>

      {/* Tabela */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-28">Data emissão</th>
              <th className="px-4 py-3 w-24">Nº NFSe</th>
              <th className="px-4 py-3">Tomador</th>
              <th className="px-4 py-3">Prestador</th>
              <th className="px-4 py-3 w-32 text-right">Valor serviços</th>
              <th className="px-4 py-3 w-24">Papel</th>
              <th className="px-4 py-3 w-28">Situação</th>
              <th className="px-4 py-3 w-24">Ambiente</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {error && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-red-alert text-sm"
                >
                  Erro: {error.message}
                </td>
              </tr>
            )}
            {!error && nfses.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  <FileCode
                    size={32}
                    className="mx-auto text-gray-300 mb-2"
                  />
                  Nenhuma NFSe encontrada com esses filtros.
                </td>
              </tr>
            )}
            {Array.from(grupos.entries()).map(([comp, g]) => (
              <Fragment key={comp}>
                <tr className="bg-app-bg/60">
                  <td
                    colSpan={9}
                    className="px-4 py-2 text-xs font-semibold text-verde-dark border-t-2 border-verde-primary/20"
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="uppercase tracking-wide">
                        {comp === "sem-data"
                          ? "Sem data de emissão"
                          : formatCompetencia(comp)}
                        <span className="ml-2 text-[10px] font-normal text-gray-500">
                          {g.itens.length} NFSe
                          {g.canceladas > 0 &&
                            ` · ${g.canceladas} cancelada${g.canceladas > 1 ? "s" : ""}`}
                        </span>
                      </span>
                      <span className="font-mono text-gray-700">
                        {formatBRL(g.valor)}
                        {g.iss > 0 && (
                          <span className="ml-3 text-[10px] text-gray-500">
                            ISS {formatBRL(g.iss)}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
                {g.itens.map((n) => (
                  <tr key={n.chave} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[11px]">
                      {n.dh_emissao
                        ? formatDate(n.dh_emissao.slice(0, 10))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {n.numero_nfse ?? "—"}
                      {n.serie && (
                        <span className="text-[10px] text-gray-500 ml-1">
                          /{n.serie}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-800 truncate max-w-[240px]">
                        {n.tomador_nome ?? "Sem tomador"}
                      </div>
                      {n.tomador_cnpj && (
                        <div className="text-[10px] text-gray-500 font-mono">
                          {formatCNPJ(n.tomador_cnpj)}
                        </div>
                      )}
                      {n.discriminacao && (
                        <div className="text-[10px] text-gray-400 italic truncate max-w-[240px] mt-0.5">
                          {n.discriminacao}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700 truncate max-w-[240px]">
                        {n.prestador_nome ?? "—"}
                      </div>
                      {n.prestador_cnpj && (
                        <div className="text-[10px] text-gray-500 font-mono">
                          {formatCNPJ(n.prestador_cnpj)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="text-sm font-medium text-verde-dark">
                        {n.valor_servicos != null
                          ? formatBRL(Number(n.valor_servicos))
                          : "—"}
                      </div>
                      {n.valor_iss != null && Number(n.valor_iss) > 0 && (
                        <div className="text-[10px] text-gray-500">
                          ISS {formatBRL(Number(n.valor_iss))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {n.papel && (
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            PAPEL_COR[n.papel] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {n.papel === "INTERMEDIARIO"
                            ? "Interm."
                            : n.papel.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          STATUS_COR[n.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          n.ambiente === 1
                            ? "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-verde-light text-verde-dark"
                            : "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                        }
                      >
                        {n.ambiente === 1 ? "Prod" : "Homol"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BaixarNfseXmlButton
                        chave={n.chave}
                        numero={n.numero_nfse ?? n.chave.slice(-6)}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {nfses.length === 200 && (
          <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-card-border">
            Mostrando as 200 mais recentes. Use os filtros pra refinar.
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "verde" | "red" | "neutral";
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "verde"
      ? "text-verde-dark"
      : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

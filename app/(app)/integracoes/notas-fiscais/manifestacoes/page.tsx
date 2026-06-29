// Histórico de Manifestações NF — listagem de eventos enviados à SEFAZ.
//
// Server Component que lê nfe_manifestacoes (Migration 21) com filtros.
// Cada linha = uma chamada de manifestação (Ciência/Confirmação/etc) feita
// pelo escritório. Cobre sucessos e erros (registro de tentativas).

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Search,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getServerSupabase } from "@/lib/supabase/server-cache";

type Search = {
  cliente?: string;
  ambiente?: string;
  tipo?: string;
  chave?: string;
  status?: string;
  de?: string;
  ate?: string;
};

type Manifestacao = {
  id_manifestacao: string;
  id_cliente: string;
  ambiente: number;
  chave_nfe: string;
  tipo_evento: string;
  protocolo: string | null;
  c_stat: string | null;
  x_motivo: string | null;
  dh_registrado: string | null;
  justificativa: string | null;
  ok: boolean;
  erro: string | null;
  enviado_por_email: string | null;
  created_at: string;
  clientes: { razao_social: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  "210210": "Ciência",
  "210200": "Confirmação",
  "210220": "Desconhece",
  "210240": "Não realizada",
};

const TIPO_COR: Record<string, string> = {
  "210210": "bg-blue-100 text-blue-700",
  "210200": "bg-verde-light text-verde-dark",
  "210220": "bg-red-100 text-red-alert",
  "210240": "bg-amber-100 text-amber-800",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

export default async function ManifestacoesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await getServerSupabase();

  // Lista de clientes pro dropdown (RLS filtra)
  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id_cliente, razao_social")
    .order("razao_social")
    .limit(500);
  const clientes = (clientesData ?? []) as Array<{
    id_cliente: string;
    razao_social: string;
  }>;

  // Query principal
  let q = supabase
    .from("nfe_manifestacoes")
    .select(
      "id_manifestacao, id_cliente, ambiente, chave_nfe, tipo_evento, protocolo, c_stat, x_motivo, dh_registrado, justificativa, ok, erro, enviado_por_email, created_at, clientes(razao_social)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.cliente) q = q.eq("id_cliente", sp.cliente);
  if (sp.ambiente === "1" || sp.ambiente === "2") {
    q = q.eq("ambiente", Number(sp.ambiente));
  }
  if (sp.tipo) q = q.eq("tipo_evento", sp.tipo);
  if (sp.chave) {
    const chaveLimpa = sp.chave.replace(/\D/g, "");
    if (chaveLimpa.length > 0) q = q.like("chave_nfe", `%${chaveLimpa}%`);
  }
  if (sp.status === "ok") q = q.eq("ok", true);
  else if (sp.status === "erro") q = q.eq("ok", false);
  if (sp.de) q = q.gte("created_at", sp.de);
  if (sp.ate) q = q.lte("created_at", sp.ate + "T23:59:59");

  const { data, error } = await q;
  const manifestacoes = (data ?? []) as unknown as Manifestacao[];

  const totalOk = manifestacoes.filter((m) => m.ok).length;
  const totalErro = manifestacoes.length - totalOk;
  const totalChaves = new Set(manifestacoes.map((m) => m.chave_nfe)).size;

  return (
    <div>
      <PageHeader
        title="Histórico de manifestações"
        subtitle="Eventos enviados à SEFAZ (Ciência, Confirmação, Desconhecimento, Não realizada)"
        actions={
          <Link href="/integracoes/notas-fiscais">
            <Button variant="secondary" className="flex items-center gap-2">
              <ArrowLeft size={16} /> Voltar ao painel NFs
            </Button>
          </Link>
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
            Tipo evento
          </label>
          <select name="tipo" defaultValue={sp.tipo ?? ""} className={inputClass}>
            <option value="">Todos</option>
            <option value="210210">Ciência</option>
            <option value="210200">Confirmação</option>
            <option value="210220">Desconhecimento</option>
            <option value="210240">Não realizada</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Status
          </label>
          <select name="status" defaultValue={sp.status ?? ""} className={inputClass}>
            <option value="">Todos</option>
            <option value="ok">Apenas sucesso</option>
            <option value="erro">Apenas erros</option>
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
        <div className="sm:col-span-2">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Chave NF-e (busca parcial)
          </label>
          <input
            name="chave"
            defaultValue={sp.chave ?? ""}
            placeholder="últimos dígitos da chave..."
            className={inputClass}
            maxLength={44}
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            De
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
            Até
          </label>
          <input
            type="date"
            name="ate"
            defaultValue={sp.ate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
          <Link href="/integracoes/notas-fiscais/manifestacoes">
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
        <Card label="Total" value={manifestacoes.length.toString()} tone="neutral" />
        <Card label="Sucesso" value={totalOk.toString()} tone="verde" />
        <Card label="Erros" value={totalErro.toString()} tone="red" />
        <Card label="NFs únicas" value={totalChaves.toString()} tone="neutral" />
      </div>

      {/* Tabela */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-32">Quando</th>
              <th className="px-4 py-3 w-28">Evento</th>
              <th className="px-4 py-3">Chave NF / Cliente</th>
              <th className="px-4 py-3 w-32">Resultado</th>
              <th className="px-4 py-3 w-40">Protocolo</th>
              <th className="px-4 py-3 w-20">Amb</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {error && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-red-alert text-sm"
                >
                  Erro: {error.message}
                </td>
              </tr>
            )}
            {!error && manifestacoes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  <AlertTriangle
                    size={32}
                    className="mx-auto text-gray-300 mb-2"
                  />
                  Nenhuma manifestação registrada com esses filtros.
                </td>
              </tr>
            )}
            {manifestacoes.map((m) => (
              <tr key={m.id_manifestacao} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[11px]">
                  {formatDateTime(m.created_at)}
                  {m.enviado_por_email && (
                    <div className="text-gray-400 truncate max-w-[150px]">
                      {m.enviado_por_email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      TIPO_COR[m.tipo_evento] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {TIPO_LABEL[m.tipo_evento] ?? m.tipo_evento}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-[10px] text-gray-700 truncate max-w-xs">
                    …{m.chave_nfe.slice(-20)}
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-xs">
                    {m.clientes?.razao_social ?? "—"}
                  </div>
                  {m.justificativa && (
                    <div className="text-[10px] text-gray-400 italic mt-0.5 truncate max-w-xs">
                      Just: {m.justificativa}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.ok ? (
                    <div className="flex items-center gap-1.5 text-verde-dark">
                      <CheckCircle2 size={14} />
                      <div>
                        <div className="text-xs font-medium">
                          {m.c_stat ?? "OK"}
                        </div>
                        {m.x_motivo && (
                          <div className="text-[10px] text-gray-500 truncate max-w-[140px]">
                            {m.x_motivo}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-red-alert">
                      <XCircle size={14} />
                      <div>
                        <div className="text-xs font-medium">
                          {m.c_stat ?? "ERRO"}
                        </div>
                        {m.erro && (
                          <div
                            className="text-[10px] text-gray-500 truncate max-w-[140px]"
                            title={m.erro}
                          >
                            {m.erro}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] font-mono text-gray-500">
                  {m.protocolo ?? "—"}
                  {m.dh_registrado && (
                    <div className="text-[10px] text-gray-400">
                      {formatDateTime(m.dh_registrado)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      m.ambiente === 1
                        ? "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-verde-light text-verde-dark"
                        : "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                    }
                  >
                    {m.ambiente === 1 ? "Prod" : "Homol"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {manifestacoes.length === 200 && (
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

"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Coins, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { GraficoDistribuicao } from "@/components/distribuicao-lucros/GraficoDistribuicao";
import { useClientes } from "@/lib/hooks/useClientes";
import { useSocios } from "@/lib/hooks/useSocios";
import {
  useDistribuicoesLucros,
  type DistribuicaoComCliente,
} from "@/lib/hooks/useDistribuicoesLucros";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { csvMoeda } from "@/lib/csv";
import {
  MESES_CURTOS,
  indicePeriodo,
  periodoDe,
  rotulosPeriodo,
  type Visao,
} from "@/lib/distribuicao-lucros";
import { formatBRL, formatCNPJ, formatCPF, formatDate } from "@/lib/utils";
import type { DistribuicaoLucro } from "@/lib/supabase/types";

const DistribuicaoFormModal = dynamic(
  () =>
    import("@/components/distribuicao-lucros/DistribuicaoFormModal").then((m) => ({
      default: m.DistribuicaoFormModal,
    })),
  { ssr: false }
);
const ImportarDistribuicoesModal = dynamic(
  () =>
    import("@/components/distribuicao-lucros/ImportarDistribuicoesModal").then((m) => ({
      default: m.ImportarDistribuicoesModal,
    })),
  { ssr: false }
);

type LinhaResumo = {
  chave: string;
  empresa: string;
  socio: string;
  cpf: string | null;
  periodos: number[];
  total: number;
};

export default function DistribuicaoLucrosPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [idCliente, setIdCliente] = useState("");
  const [idSocio, setIdSocio] = useState("");
  const [trimestre, setTrimestre] = useState(0); // 0 = todos
  const [mes, setMes] = useState(0); // 0 = todos
  const [visao, setVisao] = useState<Visao>("mensal");

  const { data: clientes = [] } = useClientes();
  const { data: socios = [] } = useSocios();
  const { data: doAno = [], isLoading } = useDistribuicoesLucros({
    ano,
    idCliente: idCliente || undefined,
    idSocio: idSocio || undefined,
  });

  const sociosFiltro = useMemo(
    () => (idCliente ? socios.filter((s) => s.id_cliente === idCliente) : socios),
    [socios, idCliente]
  );

  // Recorte de mês/trimestre aplicado sobre o ano carregado
  const lancamentos = useMemo(
    () =>
      doAno.filter((d) => {
        const p = periodoDe(d.data_distribuicao);
        if (trimestre && p.trimestre !== trimestre) return false;
        if (mes && p.mes !== mes) return false;
        return true;
      }),
    [doAno, trimestre, mes]
  );

  const kpis = useMemo(() => {
    const total = lancamentos.reduce((s, d) => s + Number(d.valor), 0);
    const empresas = new Set(lancamentos.map((d) => d.id_cliente));
    const porSocio = new Map<string, { nome: string; total: number }>();
    for (const d of lancamentos) {
      const atual = porSocio.get(d.id_socio) ?? { nome: d.nome_socio, total: 0 };
      atual.total += Number(d.valor);
      porSocio.set(d.id_socio, atual);
    }
    const maior = [...porSocio.values()].sort((a, b) => b.total - a.total)[0];
    return {
      total,
      qtd: lancamentos.length,
      mediaEmpresa: empresas.size ? total / empresas.size : 0,
      empresas: empresas.size,
      maior,
    };
  }, [lancamentos]);

  // Gráfico sempre mostra o ano inteiro na visão escolhida (contexto da evolução)
  const grafico = useMemo(() => {
    const rotulos = rotulosPeriodo(visao);
    const valores = rotulos.map(() => 0);
    for (const d of doAno) valores[indicePeriodo(d.data_distribuicao, visao)] += Number(d.valor);
    return rotulos.map((periodo, i) => ({ periodo, valor: valores[i] }));
  }, [doAno, visao]);

  const resumo = useMemo(() => {
    const n = visao === "mensal" ? 12 : 4;
    const mapa = new Map<string, LinhaResumo>();
    for (const d of lancamentos) {
      const chave = `${d.id_cliente}|${d.id_socio}`;
      let l = mapa.get(chave);
      if (!l) {
        l = {
          chave,
          empresa: d.clientes?.razao_social ?? "—",
          socio: d.nome_socio,
          cpf: d.cpf_socio,
          periodos: Array(n).fill(0),
          total: 0,
        };
        mapa.set(chave, l);
      }
      l.periodos[indicePeriodo(d.data_distribuicao, visao)] += Number(d.valor);
      l.total += Number(d.valor);
    }
    return [...mapa.values()].sort(
      (a, b) => a.empresa.localeCompare(b.empresa) || b.total - a.total
    );
  }, [lancamentos, visao]);

  const totaisPeriodo = useMemo(() => {
    const n = visao === "mensal" ? 12 : 4;
    const t = Array(n).fill(0) as number[];
    for (const l of resumo) l.periodos.forEach((v, i) => (t[i] += v));
    return t;
  }, [resumo, visao]);

  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [edit, setEdit] = useState<DistribuicaoLucro | null>(null);

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("distribuicoes_lucros")
        .delete()
        .eq("id_distribuicao", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["distribuicoes-lucros"] });
      toast.success("Distribuição removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Distribuição de lucros" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode gerenciar distribuição de lucros.
        </div>
      </div>
    );
  }

  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - i);
  const rotulos = rotulosPeriodo(visao);
  const recorte =
    mes > 0
      ? `${MESES_CURTOS[mes - 1]}/${ano}`
      : trimestre > 0
      ? `${trimestre}º trimestre/${ano}`
      : String(ano);

  return (
    <div>
      <PageHeader
        title="Distribuição de lucros"
        subtitle="Retiradas de lucros por empresa e sócio — visão mensal e trimestral"
        actions={
          <>
            <ExportCsvButton
              rows={lancamentos}
              filename={`distribuicao-lucros-${recorte.replace("/", "-")}.csv`}
              columns={[
                { header: "Data", value: (d: DistribuicaoComCliente) => formatDate(d.data_distribuicao) },
                { header: "Empresa", value: (d) => d.clientes?.razao_social ?? "" },
                { header: "CNPJ", value: (d) => (d.clientes?.cnpj ? formatCNPJ(d.clientes.cnpj) : "") },
                { header: "Sócio", value: (d) => d.nome_socio },
                { header: "CPF", value: (d) => (d.cpf_socio ? formatCPF(d.cpf_socio) : "") },
                { header: "Mês/Ano", value: (d) => { const p = periodoDe(d.data_distribuicao); return `${MESES_CURTOS[p.mes - 1]}/${p.ano}`; } },
                { header: "Trimestre", value: (d) => `${periodoDe(d.data_distribuicao).trimestre}º Trimestre` },
                { header: "Valor", value: (d) => csvMoeda(Number(d.valor)) },
                { header: "Forma de pagamento", value: (d) => d.forma_pagamento ?? "" },
                { header: "Observações", value: (d) => d.observacoes ?? "" },
              ]}
            />
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2"
            >
              <Upload size={16} /> Importar planilha
            </Button>
            <Button
              onClick={() => {
                setEdit(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Nova distribuição
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filtro label="Empresa" className="min-w-[240px] flex-1">
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => {
              setIdCliente(e.target.value);
              setIdSocio("");
            }}
          >
            <option value="">Todas as empresas</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Sócio" className="min-w-[200px] flex-1">
          <select
            className={inputClass}
            value={idSocio}
            onChange={(e) => setIdSocio(e.target.value)}
          >
            <option value="">Todos os sócios</option>
            {sociosFiltro.map((s) => (
              <option key={s.id_socio} value={s.id_socio}>
                {s.nome}
                {!idCliente && s.clientes ? ` — ${s.clientes.razao_social}` : ""}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Ano">
          <select
            className={inputClass}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Trimestre">
          <select
            className={inputClass}
            value={trimestre}
            onChange={(e) => {
              setTrimestre(Number(e.target.value));
              setMes(0);
            }}
          >
            <option value={0}>Todos</option>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}º trimestre
              </option>
            ))}
          </select>
        </Filtro>
        <Filtro label="Mês">
          <select
            className={inputClass}
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
          >
            <option value={0}>Todos</option>
            {MESES_CURTOS.map((m, i) =>
              trimestre && Math.ceil((i + 1) / 3) !== trimestre ? null : (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              )
            )}
          </select>
        </Filtro>
        <div className="flex items-center gap-1 border border-gray-300 rounded-lg p-1">
          <VisaoBtn ativo={visao === "mensal"} onClick={() => setVisao("mensal")}>
            Mensal
          </VisaoBtn>
          <VisaoBtn ativo={visao === "trimestral"} onClick={() => setVisao("trimestral")}>
            Trimestral
          </VisaoBtn>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label={`Total distribuído — ${recorte}`} value={formatBRL(kpis.total)} highlight />
        <Stat label="Lançamentos" value={String(kpis.qtd)} />
        <Stat
          label={`Média por empresa (${kpis.empresas})`}
          value={formatBRL(kpis.mediaEmpresa)}
        />
        <Stat
          label="Maior beneficiário"
          value={kpis.maior ? formatBRL(kpis.maior.total) : "—"}
          sub={kpis.maior?.nome}
        />
      </div>

      {/* Evolução */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold text-gray-700 mb-3">
          Evolução {visao === "mensal" ? "mês a mês" : "por trimestre"} — {ano}
        </div>
        <GraficoDistribuicao data={grafico} />
      </div>

      {/* Resumo por empresa / sócio */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto mb-4">
        <div className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">
          Por empresa e sócio
        </div>
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-3 py-3">Empresa</th>
              <th className="px-3 py-3">Sócio</th>
              {rotulos.map((r) => (
                <th key={r} className="px-2 py-3 text-right whitespace-nowrap">
                  {r}
                </th>
              ))}
              <th className="px-3 py-3 text-right bg-gold/10">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {!isLoading && resumo.length === 0 && (
              <tr>
                <td
                  colSpan={rotulos.length + 3}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  <Coins size={32} className="mx-auto text-gray-300 mb-2" />
                  Nenhuma distribuição no período.
                </td>
              </tr>
            )}
            {resumo.map((l) => (
              <tr key={l.chave} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-600">{l.empresa}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800">{l.socio}</div>
                  {l.cpf && (
                    <div className="text-[11px] text-gray-500 font-mono">
                      {formatCPF(l.cpf)}
                    </div>
                  )}
                </td>
                {l.periodos.map((v, i) => (
                  <td
                    key={i}
                    className="px-2 py-2 text-right text-xs whitespace-nowrap text-gray-600"
                  >
                    {v ? formatBRL(v) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold text-verde-dark whitespace-nowrap bg-gold/5">
                  {formatBRL(l.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {resumo.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-xs">
                <td colSpan={2} className="px-3 py-3 text-right text-gray-700">
                  Total
                </td>
                {totaisPeriodo.map((v, i) => (
                  <td key={i} className="px-2 py-3 text-right whitespace-nowrap">
                    {v ? formatBRL(v) : "—"}
                  </td>
                ))}
                <td className="px-3 py-3 text-right text-verde-dark whitespace-nowrap">
                  {formatBRL(kpis.total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Lançamentos */}
      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <div className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">
          Lançamentos
        </div>
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Sócio</th>
              <th className="px-4 py-3">Mês / Trimestre</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && lancamentos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhum lançamento no período.
                </td>
              </tr>
            )}
            {lancamentos.map((d) => {
              const p = periodoDe(d.data_distribuicao);
              return (
                <tr key={d.id_distribuicao} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(d.data_distribuicao)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {d.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{d.nome_socio}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {MESES_CURTOS[p.mes - 1]}/{p.ano} · {p.trimestre}º tri
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(d.valor))}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {d.forma_pagamento ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEdit(d);
                          setModalOpen(true);
                        }}
                        className="p-1 text-gray-400 hover:text-verde-dark"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Remover distribuição de ${formatBRL(Number(d.valor))} para ${d.nome_socio} em ${formatDate(d.data_distribuicao)}?`
                            )
                          )
                            excluir.mutate(d.id_distribuicao);
                        }}
                        className="p-1 text-gray-400 hover:text-red-alert"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DistribuicaoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        distribuicao={edit}
        clientes={clientes}
        socios={socios}
        idClienteDefault={idCliente || undefined}
      />
      <ImportarDistribuicoesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clientes={clientes}
        socios={socios}
      />
    </div>
  );
}

function Filtro({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs uppercase text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function VisaoBtn({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        ativo
          ? "px-3 py-1 rounded-md bg-verde-primary text-white text-sm font-medium"
          : "px-3 py-1 rounded-md text-gray-600 hover:bg-gray-50 text-sm"
      }
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "border border-gold/40 rounded-lg p-3 bg-gold/5"
          : "border border-card-border rounded-lg p-3 bg-white"
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={
          highlight
            ? "text-lg font-bold text-verde-dark mt-1"
            : "text-base font-semibold text-gray-800 mt-1"
        }
      >
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

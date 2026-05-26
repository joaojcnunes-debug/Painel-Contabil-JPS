"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileText, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDate } from "@/lib/utils";

export type LancamentoView = {
  id_lancamento: string;
  data_lancamento: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  descricao: string;
  documento_ref: string | null;
  id_cliente: string;
  clientes: { razao_social: string } | null;
  plano_contas: {
    id_conta: string;
    codigo: string;
    nome: string;
    tipo: string;
    grupo: string | null;
  } | null;
};

type Aba = "diario" | "razao" | "balancete";

type Props = {
  lancamentos: LancamentoView[];
  dataInicio: string;
  dataFim: string;
  clienteNome: string | null;
};

export function DemonstracoesView({
  lancamentos,
  dataInicio,
  dataFim,
  clienteNome,
}: Props) {
  const [aba, setAba] = useState<Aba>("diario");

  return (
    <div>
      {/* Tabs */}
      <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit print:hidden">
        <TabBtn ativo={aba === "diario"} onClick={() => setAba("diario")}>
          <ScrollText size={14} /> Livro Diário
        </TabBtn>
        <TabBtn ativo={aba === "razao"} onClick={() => setAba("razao")}>
          <BookOpen size={14} /> Livro Razão
        </TabBtn>
        <TabBtn
          ativo={aba === "balancete"}
          onClick={() => setAba("balancete")}
        >
          <FileText size={14} /> Balancete
        </TabBtn>
      </div>

      <div className="bg-white border border-card-border rounded-xl print:border-0 print:shadow-none">
        {/* Cabeçalho (visível em todas + na impressão) */}
        <div className="px-5 py-4 border-b border-card-border print:border-b-2 print:border-verde-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-base font-bold text-verde-dark uppercase tracking-wider">
                {aba === "diario"
                  ? "Livro Diário"
                  : aba === "razao"
                  ? "Livro Razão"
                  : "Balancete de Verificação"}
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {clienteNome ?? "Consolidado de todos os clientes"} •{" "}
                {formatDate(dataInicio)} a {formatDate(dataFim)}
              </p>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold print:block hidden">
              JSP Contabilidade
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Sistema simplificado — não substitui ECD/ECF oficial. Use como
            relatório gerencial.
          </p>
        </div>

        {lancamentos.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            Nenhum lançamento no período.
          </div>
        ) : aba === "diario" ? (
          <DiarioView lancs={lancamentos} />
        ) : aba === "razao" ? (
          <RazaoView lancs={lancamentos} />
        ) : (
          <BalanceteView lancs={lancamentos} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
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
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition",
        ativo
          ? "bg-verde-primary text-white"
          : "text-gray-600 hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  );
}

// ─── Diário ─────────────────────────────────────────────────────────────────
function DiarioView({ lancs }: { lancs: LancamentoView[] }) {
  // Lista cronológica. Por convenção: RECEITA vai em crédito, DESPESA em débito.
  const totalDeb = lancs
    .filter((l) => l.tipo === "DESPESA")
    .reduce((s, l) => s + Number(l.valor), 0);
  const totalCre = lancs
    .filter((l) => l.tipo === "RECEITA")
    .reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr className="text-gray-600 uppercase">
            <th className="px-3 py-2 text-left w-24">Data</th>
            <th className="px-3 py-2 text-left">Conta</th>
            <th className="px-3 py-2 text-left">Histórico</th>
            <th className="px-3 py-2 text-right w-32">Débito</th>
            <th className="px-3 py-2 text-right w-32">Crédito</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {lancs.map((l) => (
            <tr key={l.id_lancamento}>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                {formatDate(l.data_lancamento)}
              </td>
              <td className="px-3 py-2 text-gray-700">
                <span className="font-mono text-verde-dark">
                  {l.plano_contas?.codigo ?? "—"}
                </span>{" "}
                {l.plano_contas?.nome ?? ""}
              </td>
              <td className="px-3 py-2 text-gray-700">
                {l.descricao.replace(/\s*\[recorrente:[^\]]+\]/g, "")}
                {l.documento_ref && (
                  <span className="text-gray-500"> — Doc: {l.documento_ref}</span>
                )}
                {!l.clientes ? null : (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {l.clientes.razao_social}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {l.tipo === "DESPESA" ? formatBRL(Number(l.valor)) : ""}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {l.tipo === "RECEITA" ? formatBRL(Number(l.valor)) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-verde-light font-bold text-verde-dark">
            <td colSpan={3} className="px-3 py-3 text-right uppercase text-xs">
              Totais
            </td>
            <td className="px-3 py-3 text-right">{formatBRL(totalDeb)}</td>
            <td className="px-3 py-3 text-right">{formatBRL(totalCre)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Razão ──────────────────────────────────────────────────────────────────
function RazaoView({ lancs }: { lancs: LancamentoView[] }) {
  type ContaAgg = {
    id_conta: string;
    codigo: string;
    nome: string;
    tipo: "RECEITA" | "DESPESA";
    grupo: string | null;
    movimentos: LancamentoView[];
    total: number;
  };

  const porConta = useMemo(() => {
    const m = new Map<string, ContaAgg>();
    for (const l of lancs) {
      const c = l.plano_contas;
      if (!c) continue;
      if (!m.has(c.id_conta)) {
        m.set(c.id_conta, {
          id_conta: c.id_conta,
          codigo: c.codigo,
          nome: c.nome,
          tipo: c.tipo as "RECEITA" | "DESPESA",
          grupo: c.grupo,
          movimentos: [],
          total: 0,
        });
      }
      const conta = m.get(c.id_conta)!;
      conta.movimentos.push(l);
      conta.total += Number(l.valor);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo)
    );
  }, [lancs]);

  return (
    <div className="divide-y divide-card-border">
      {porConta.map((c) => (
        <div key={c.id_conta} className="px-5 py-4 print:break-inside-avoid">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-bold text-verde-dark">
                <span className="font-mono mr-2">{c.codigo}</span>
                {c.nome}
              </div>
              {c.grupo && (
                <div className="text-[10px] uppercase tracking-wider text-gray-500">
                  {c.grupo}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-gray-500">Saldo</div>
              <div
                className={
                  c.tipo === "RECEITA"
                    ? "text-lg font-bold text-verde-dark"
                    : "text-lg font-bold text-red-alert"
                }
              >
                {formatBRL(c.total)}
              </div>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 uppercase border-b border-card-border">
                <th className="px-2 py-1 text-left w-24">Data</th>
                <th className="px-2 py-1 text-left">Histórico</th>
                <th className="px-2 py-1 text-right w-32">Valor</th>
              </tr>
            </thead>
            <tbody>
              {c.movimentos
                .sort((a, b) =>
                  a.data_lancamento.localeCompare(b.data_lancamento)
                )
                .map((l) => (
                  <tr key={l.id_lancamento} className="text-gray-700">
                    <td className="px-2 py-1 whitespace-nowrap">
                      {formatDate(l.data_lancamento)}
                    </td>
                    <td className="px-2 py-1">
                      {l.descricao.replace(/\s*\[recorrente:[^\]]+\]/g, "")}
                      {l.clientes && (
                        <span className="text-gray-400">
                          {" "}— {l.clientes.razao_social}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {formatBRL(Number(l.valor))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Balancete ──────────────────────────────────────────────────────────────
function BalanceteView({ lancs }: { lancs: LancamentoView[] }) {
  type ContaAgg = {
    id_conta: string;
    codigo: string;
    nome: string;
    tipo: "RECEITA" | "DESPESA";
    grupo: string | null;
    qtd: number;
    total: number;
  };

  const porConta = useMemo(() => {
    const m = new Map<string, ContaAgg>();
    for (const l of lancs) {
      const c = l.plano_contas;
      if (!c) continue;
      if (!m.has(c.id_conta)) {
        m.set(c.id_conta, {
          id_conta: c.id_conta,
          codigo: c.codigo,
          nome: c.nome,
          tipo: c.tipo as "RECEITA" | "DESPESA",
          grupo: c.grupo,
          qtd: 0,
          total: 0,
        });
      }
      const conta = m.get(c.id_conta)!;
      conta.qtd += 1;
      conta.total += Number(l.valor);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo)
    );
  }, [lancs]);

  const receitas = porConta.filter((c) => c.tipo === "RECEITA");
  const despesas = porConta.filter((c) => c.tipo === "DESPESA");
  const totalReceitas = receitas.reduce((s, c) => s + c.total, 0);
  const totalDespesas = despesas.reduce((s, c) => s + c.total, 0);
  const resultado = totalReceitas - totalDespesas;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600 uppercase">
          <tr>
            <th className="px-3 py-2 text-left w-24">Código</th>
            <th className="px-3 py-2 text-left">Conta</th>
            <th className="px-3 py-2 text-left">Grupo</th>
            <th className="px-3 py-2 text-right w-20">Mov.</th>
            <th className="px-3 py-2 text-right w-32">Saldo (R$)</th>
            <th className="px-3 py-2 text-left w-12">D/C</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {/* Receitas */}
          <tr className="bg-verde-light/50">
            <td colSpan={6} className="px-3 py-2 text-verde-dark font-bold text-xs uppercase tracking-wider">
              Contas de Receita
            </td>
          </tr>
          {receitas.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-center text-gray-400 italic">
                Sem movimento
              </td>
            </tr>
          ) : (
            receitas.map((c) => (
              <tr key={c.id_conta}>
                <td className="px-3 py-2 font-mono text-gray-600">{c.codigo}</td>
                <td className="px-3 py-2 text-gray-800">{c.nome}</td>
                <td className="px-3 py-2 text-gray-500">{c.grupo ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-500">{c.qtd}</td>
                <td className="px-3 py-2 text-right text-verde-dark font-medium">
                  {formatBRL(c.total)}
                </td>
                <td className="px-3 py-2 text-center text-verde-dark font-bold">C</td>
              </tr>
            ))
          )}
          <tr className="bg-verde-light font-semibold text-verde-dark">
            <td colSpan={4} className="px-3 py-2 text-right uppercase text-xs">
              Total receitas
            </td>
            <td className="px-3 py-2 text-right">{formatBRL(totalReceitas)}</td>
            <td className="px-3 py-2 text-center">C</td>
          </tr>

          {/* Despesas */}
          <tr className="bg-red-50">
            <td colSpan={6} className="px-3 py-2 text-red-alert font-bold text-xs uppercase tracking-wider">
              Contas de Despesa
            </td>
          </tr>
          {despesas.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-center text-gray-400 italic">
                Sem movimento
              </td>
            </tr>
          ) : (
            despesas.map((c) => (
              <tr key={c.id_conta}>
                <td className="px-3 py-2 font-mono text-gray-600">{c.codigo}</td>
                <td className="px-3 py-2 text-gray-800">{c.nome}</td>
                <td className="px-3 py-2 text-gray-500">{c.grupo ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-500">{c.qtd}</td>
                <td className="px-3 py-2 text-right text-red-alert font-medium">
                  {formatBRL(c.total)}
                </td>
                <td className="px-3 py-2 text-center text-red-alert font-bold">D</td>
              </tr>
            ))
          )}
          <tr className="bg-red-50 font-semibold text-red-alert">
            <td colSpan={4} className="px-3 py-2 text-right uppercase text-xs">
              Total despesas
            </td>
            <td className="px-3 py-2 text-right">{formatBRL(totalDespesas)}</td>
            <td className="px-3 py-2 text-center">D</td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="bg-verde-dark text-white">
            <td colSpan={4} className="px-3 py-3 text-right font-bold uppercase">
              Resultado do período
            </td>
            <td
              className={
                resultado >= 0
                  ? "px-3 py-3 text-right font-bold text-lg"
                  : "px-3 py-3 text-right font-bold text-lg"
              }
            >
              {formatBRL(resultado)}
            </td>
            <td className="px-3 py-3 text-center font-bold">
              {resultado >= 0 ? "C" : "D"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

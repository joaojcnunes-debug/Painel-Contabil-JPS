"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  EyeOff,
  Link2,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { usePlanoContas } from "@/lib/hooks/useLancamentos";
import {
  useBancoMovimentos,
  useLancamentosLivres,
  type CandidatoLancamento,
} from "@/lib/hooks/useBancoMovimentos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { Sparkles, Wand2 } from "lucide-react";
import type { BancoMovimento, Lancamento } from "@/lib/supabase/types";
import { melhorCandidato, type MatchResult } from "@/lib/conciliacao-match";

const ImportarExtratoModal = dynamic(
  () =>
    import("@/components/conciliacao/ImportarExtratoModal").then((m) => ({
      default: m.ImportarExtratoModal,
    })),
  { ssr: false }
);
const VincularLancamentoModal = dynamic(
  () =>
    import("@/components/conciliacao/VincularLancamentoModal").then((m) => ({
      default: m.VincularLancamentoModal,
    })),
  { ssr: false }
);
const LancamentoFormModal = dynamic(
  () =>
    import("@/components/lancamentos/LancamentoFormModal").then((m) => ({
      default: m.LancamentoFormModal,
    })),
  { ssr: false }
);

type Estado = "pendentes" | "conciliados" | "ignorados";

export default function ConciliacaoPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const { data: contas = [] } = usePlanoContas(true);

  const [idCliente, setIdCliente] = useState("");
  const [estado, setEstado] = useState<Estado>("pendentes");

  const { data: movimentos = [], isLoading } = useBancoMovimentos(
    idCliente,
    estado
  );
  const { data: lancsLivres = [] } = useLancamentosLivres(
    estado === "pendentes" ? idCliente : ""
  );

  // Indexa lançamentos livres por (tipo, valor absoluto) pra match O(1)
  const indexLanc = useMemo(() => {
    const m = new Map<string, CandidatoLancamento[]>();
    for (const l of lancsLivres) {
      const key = `${l.tipo}::${Math.abs(Number(l.valor)).toFixed(2)}`;
      const arr = m.get(key) ?? [];
      arr.push(l);
      m.set(key, arr);
    }
    return m;
  }, [lancsLivres]);

  // Pra um movimento, retorna o melhor candidato com score/nível de confiança.
  function sugerirCandidato(mov: BancoMovimento): MatchResult | null {
    const tipo: "RECEITA" | "DESPESA" =
      Number(mov.valor) >= 0 ? "RECEITA" : "DESPESA";
    const key = `${tipo}::${Math.abs(Number(mov.valor)).toFixed(2)}`;
    const candidatos = indexLanc.get(key) ?? [];
    if (candidatos.length === 0) return null;
    return melhorCandidato(mov, candidatos);
  }

  const [importarOpen, setImportarOpen] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [movSelecionado, setMovSelecionado] = useState<BancoMovimento | null>(
    null
  );

  // Lançamento pré-preenchido a partir do movimento
  const [lancPreenchido, setLancPreenchido] = useState<Partial<Lancamento> | null>(
    null
  );

  const qc = useQueryClient();
  const clienteSel = clientes.find((c) => c.id_cliente === idCliente) ?? null;

  const stats = useMemo(() => {
    let creditos = 0;
    let debitos = 0;
    for (const m of movimentos) {
      const v = Number(m.valor);
      if (v >= 0) creditos += v;
      else debitos += Math.abs(v);
    }
    return { creditos, debitos };
  }, [movimentos]);

  // Pré-calcula sugestões dos pendentes (só roda em "pendentes") pra:
  //   1) Mostrar contador "Auto-conciliar (N)" no header
  //   2) Reutilizar o resultado por linha (evita recomputar)
  const sugestoes = useMemo(() => {
    if (estado !== "pendentes") return new Map<string, MatchResult>();
    const m = new Map<string, MatchResult>();
    for (const mov of movimentos) {
      const r = sugerirCandidato(mov);
      if (r) m.set(mov.id_movimento, r);
    }
    return m;
  }, [estado, movimentos, indexLanc]); // eslint-disable-line react-hooks/exhaustive-deps

  const qtdAutoAlta = useMemo(
    () =>
      [...sugestoes.values()].filter((r) => r.level === "alto").length,
    [sugestoes]
  );

  // Ações
  const ignorar = useMutation({
    mutationFn: async (mov: BancoMovimento) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("banco_movimentos")
        .update({
          ignorado: true,
          motivo_ignorado: "Marcado pelo usuário",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_movimento", mov.id_movimento);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      toast.success("Movimento ignorado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vincularRapido = useMutation({
    mutationFn: async ({
      mov,
      idLancamento,
    }: {
      mov: BancoMovimento;
      idLancamento: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("banco_movimentos")
        .update({
          conciliado: true,
          id_lancamento: idLancamento,
          ignorado: false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_movimento", mov.id_movimento);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-livres"] });
      toast.success("Vinculado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoConciliar = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const altas: Array<{ id_movimento: string; id_lancamento: string }> = [];
      for (const mov of movimentos) {
        const r = sugestoes.get(mov.id_movimento);
        if (r && r.level === "alto") {
          altas.push({
            id_movimento: mov.id_movimento,
            id_lancamento: r.candidato.id_lancamento,
          });
        }
      }
      // Garante que cada lançamento só seja usado 1x neste batch
      const usados = new Set<string>();
      let ok = 0;
      for (const { id_movimento, id_lancamento } of altas) {
        if (usados.has(id_lancamento)) continue;
        const { error } = await supabase
          .from("banco_movimentos")
          .update({
            conciliado: true,
            id_lancamento,
            ignorado: false,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id_movimento", id_movimento);
        if (!error) {
          usados.add(id_lancamento);
          ok++;
        }
      }
      return ok;
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-livres"] });
      toast.success(
        ok > 0
          ? `${ok} movimento(s) conciliado(s) automaticamente`
          : "Nenhum movimento com confiança alta pra auto-conciliar"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverter = useMutation({
    mutationFn: async (mov: BancoMovimento) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("banco_movimentos")
        .update({
          conciliado: false,
          id_lancamento: null,
          ignorado: false,
          motivo_ignorado: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_movimento", mov.id_movimento);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      toast.success("Movimento voltou para pendentes");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function lancarNovo(mov: BancoMovimento) {
    setMovSelecionado(mov);
    const valor = Math.abs(Number(mov.valor));
    const tipo = Number(mov.valor) >= 0 ? "RECEITA" : "DESPESA";
    setLancPreenchido({
      id_cliente: mov.id_cliente,
      data_lancamento: mov.data_movimento,
      tipo,
      valor,
      descricao: mov.descricao,
      documento_ref: null,
    } as Partial<Lancamento>);
    setLancarOpen(true);
  }

  function abrirVincular(mov: BancoMovimento) {
    setMovSelecionado(mov);
    setVincularOpen(true);
  }

  // Quando o modal de lançamento fecha após sucesso, vincula o movimento
  async function aoSalvarLancamento() {
    if (!movSelecionado) return;
    // Busca o último lançamento desse cliente com mesmo valor/data
    const supabase = createSupabaseBrowserClient();
    const valor = Math.abs(Number(movSelecionado.valor));
    const { data } = await supabase
      .from("lancamentos")
      .select("id_lancamento")
      .eq("id_cliente", movSelecionado.id_cliente)
      .eq("valor", valor)
      .eq("data_lancamento", movSelecionado.data_movimento)
      .order("created_at", { ascending: false })
      .limit(1);
    const lancRecente = (data ?? [])[0] as { id_lancamento: string } | undefined;
    if (lancRecente) {
      await supabase
        .from("banco_movimentos")
        .update({
          conciliado: true,
          id_lancamento: lancRecente.id_lancamento,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_movimento", movSelecionado.id_movimento);
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
    }
    setLancPreenchido(null);
    setMovSelecionado(null);
  }

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Conciliação bancária" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode usar a conciliação bancária.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        subtitle="Casa movimentos do extrato com lançamentos contábeis"
        actions={
          idCliente && (
            <div className="flex items-center gap-2">
              {estado === "pendentes" && qtdAutoAlta > 0 && (
                <Button
                  onClick={() => {
                    if (
                      confirm(
                        `Conciliar automaticamente ${qtdAutoAlta} movimento(s) com confiança alta?`
                      )
                    )
                      autoConciliar.mutate();
                  }}
                  disabled={autoConciliar.isPending}
                  className="flex items-center gap-2 bg-gold hover:bg-amber-700"
                >
                  <Wand2 size={16} /> Auto-conciliar ({qtdAutoAlta})
                </Button>
              )}
              <Button
                onClick={() => setImportarOpen(true)}
                className="flex items-center gap-2"
              >
                <Upload size={16} /> Importar extrato
              </Button>
            </div>
          )
        }
      />

      {/* Seletor de cliente */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[260px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Cliente
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
          >
            <option value="">Selecione o cliente…</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!idCliente ? (
        <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
          Selecione um cliente acima pra começar a conciliação.
        </div>
      ) : (
        <>
          {/* Stats + Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <Card
              icon={ArrowUpCircle}
              label="Créditos"
              value={stats.creditos}
              tone="verde"
            />
            <Card
              icon={ArrowDownCircle}
              label="Débitos"
              value={stats.debitos}
              tone="red"
            />
            <Card
              label="Movimentos"
              value={movimentos.length}
              tone="neutral"
              raw
            />
          </div>

          {/* Tabs */}
          <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit">
            <TabBtn ativo={estado === "pendentes"} onClick={() => setEstado("pendentes")}>
              Pendentes
            </TabBtn>
            <TabBtn
              ativo={estado === "conciliados"}
              onClick={() => setEstado("conciliados")}
            >
              Conciliados
            </TabBtn>
            <TabBtn
              ativo={estado === "ignorados"}
              onClick={() => setEstado("ignorados")}
            >
              Ignorados
            </TabBtn>
          </div>

          <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-28">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 w-32">Banco/Conta</th>
                  <th className="px-4 py-3 text-right w-32">Valor</th>
                  <th className="px-4 py-3 w-44"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!isLoading && movimentos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      {estado === "pendentes"
                        ? "Nada pendente — importe um extrato pra começar."
                        : estado === "conciliados"
                        ? "Nenhum movimento conciliado ainda."
                        : "Nenhum movimento ignorado."}
                    </td>
                  </tr>
                )}
                {movimentos.map((m) => {
                  const sugestao =
                    estado === "pendentes"
                      ? sugestoes.get(m.id_movimento) ?? null
                      : null;
                  return (
                  <tr key={m.id_movimento} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(m.data_movimento)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {m.descricao}
                      {m.observacoes && (
                        <div className="text-xs text-gray-500">
                          {m.observacoes}
                        </div>
                      )}
                      {sugestao && (
                        <div
                          className={
                            sugestao.level === "alto"
                              ? "mt-1 inline-flex items-center gap-1.5 text-xs bg-verde-light text-verde-dark rounded px-2 py-1 border border-verde-primary/30"
                              : "mt-1 inline-flex items-center gap-1.5 text-xs bg-gold/10 text-amber-800 rounded px-2 py-1 border border-gold/20"
                          }
                          title={`Confiança: ${sugestao.score}% · ${sugestao.deltaDias} dia(s) de diferença`}
                        >
                          <Sparkles
                            size={11}
                            className={
                              sugestao.level === "alto"
                                ? "text-verde-primary flex-shrink-0"
                                : "text-gold flex-shrink-0"
                            }
                          />
                          <span
                            className={
                              sugestao.level === "alto"
                                ? "px-1.5 py-0.5 rounded bg-verde-primary text-white text-[9px] font-bold uppercase"
                                : "px-1.5 py-0.5 rounded bg-gold text-white text-[9px] font-bold uppercase"
                            }
                          >
                            {sugestao.level === "alto" ? "Alta" : "Média"}
                          </span>
                          <span className="truncate">
                            <strong>{sugestao.candidato.descricao}</strong>{" "}
                            <span className="text-gray-500">
                              ({formatDate(sugestao.candidato.data_lancamento)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              vincularRapido.mutate({
                                mov: m,
                                idLancamento: sugestao.candidato.id_lancamento,
                              })
                            }
                            disabled={vincularRapido.isPending}
                            className={
                              sugestao.level === "alto"
                                ? "ml-1 px-2 py-0.5 rounded bg-verde-primary text-white text-[10px] font-semibold hover:bg-verde-accent"
                                : "ml-1 px-2 py-0.5 rounded bg-gold text-white text-[10px] font-semibold hover:bg-amber-700"
                            }
                          >
                            Aceitar
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {m.banco && <div>{m.banco}</div>}
                      {m.conta_bancaria && <div>{m.conta_bancaria}</div>}
                    </td>
                    <td
                      className={
                        Number(m.valor) >= 0
                          ? "px-4 py-3 text-right font-medium text-verde-dark whitespace-nowrap"
                          : "px-4 py-3 text-right font-medium text-red-alert whitespace-nowrap"
                      }
                    >
                      {formatBRL(Number(m.valor))}
                    </td>
                    <td className="px-4 py-3">
                      {estado === "pendentes" && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={() => lancarNovo(m)}
                            className="px-2 py-1 rounded bg-verde-primary text-white text-xs font-medium hover:bg-verde-accent flex items-center gap-1"
                            title="Criar novo lançamento contábil"
                          >
                            <Plus size={12} /> Lançar
                          </button>
                          <button
                            onClick={() => abrirVincular(m)}
                            className="px-2 py-1 rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-50 flex items-center gap-1"
                            title="Vincular a lançamento existente"
                          >
                            <Link2 size={12} /> Vincular
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Ignorar este movimento?"))
                                ignorar.mutate(m);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Ignorar"
                          >
                            <EyeOff size={14} />
                          </button>
                        </div>
                      )}
                      {(estado === "conciliados" || estado === "ignorados") && (
                        <button
                          onClick={() => reverter.mutate(m)}
                          disabled={reverter.isPending}
                          className="px-2 py-1 rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-50 flex items-center gap-1"
                          title="Voltar para pendentes"
                        >
                          <RotateCcw size={12} /> Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {clienteSel && (
        <ImportarExtratoModal
          open={importarOpen}
          onClose={() => setImportarOpen(false)}
          cliente={clienteSel}
        />
      )}
      <VincularLancamentoModal
        open={vincularOpen}
        onClose={() => setVincularOpen(false)}
        movimento={movSelecionado}
      />
      <LancamentoFormModal
        open={lancarOpen}
        onClose={() => {
          setLancarOpen(false);
          if (movSelecionado) {
            // Tenta vincular automaticamente o lançamento que acabou de ser criado
            void aoSalvarLancamento();
          }
        }}
        lancamento={lancPreenchido as Lancamento | null}
        clientes={clientes}
        contas={contas}
      />
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  tone,
  raw,
}: {
  icon?: React.ElementType;
  label: string;
  value: number;
  tone: "verde" | "red" | "neutral";
  raw?: boolean;
}) {
  const cls =
    tone === "red"
      ? "text-red-alert"
      : tone === "verde"
      ? "text-verde-dark"
      : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        {Icon && <Icon size={16} className="text-gold" />}
      </div>
      <div className={`mt-2 text-2xl font-bold ${cls}`}>
        {raw ? value : formatBRL(value)}
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
      className={
        ativo
          ? "px-4 py-1.5 rounded-md bg-verde-primary text-white text-sm font-medium"
          : "px-4 py-1.5 rounded-md text-gray-600 hover:bg-gray-50 text-sm"
      }
    >
      {children}
    </button>
  );
}

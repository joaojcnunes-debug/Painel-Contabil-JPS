"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { Cliente, ObrigacaoCatalogo } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  catalogo: ObrigacaoCatalogo[];
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function venctoDoMes(comp: string, dia: number | null): string | null {
  if (!comp || !dia) return null;
  const [y, m] = comp.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

const PERIOD_LABEL: Record<string, string> = {
  MENSAL: "mensal",
  TRIMESTRAL: "trimestral",
  ANUAL: "anual",
  EVENTUAL: "eventual",
};

export function GeradorMesModal({ open, onClose, clientes, catalogo }: Props) {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [idsClientes, setIdsClientes] = useState<Set<string>>(new Set());
  const [idsCatalogo, setIdsCatalogo] = useState<Set<string>>(new Set());

  const clientesAtivos = useMemo(
    () => clientes.filter((c) => c.status === "Ativo"),
    [clientes]
  );

  const catAtivo = useMemo(
    () =>
      catalogo
        .filter((c) => c.ativo && c.periodicidade !== "EVENTUAL")
        .sort((a, b) => {
          // mensais primeiro, depois trimestrais, depois anuais
          const ord = { MENSAL: 0, TRIMESTRAL: 1, ANUAL: 2 };
          const da = ord[a.periodicidade as keyof typeof ord] ?? 9;
          const db = ord[b.periodicidade as keyof typeof ord] ?? 9;
          if (da !== db) return da - db;
          return a.sigla.localeCompare(b.sigla);
        }),
    [catalogo]
  );

  // Init quando o modal abre: pré-seleciona todos os clientes ativos +
  // só os itens MENSAIS do catálogo.
  useEffect(() => {
    if (!open) return;
    setCompetencia(competenciaAtual());
    setIdsClientes(new Set(clientesAtivos.map((c) => c.id_cliente)));
    setIdsCatalogo(
      new Set(
        catAtivo
          .filter((c) => c.periodicidade === "MENSAL")
          .map((c) => c.id_obrigacao_catalogo)
      )
    );
  }, [open, clientesAtivos, catAtivo]);

  function toggleCliente(id: string) {
    setIdsClientes((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleCatalogo(id: string) {
    setIdsCatalogo((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function setTodosClientes(marcar: boolean) {
    if (marcar) {
      setIdsClientes(new Set(clientesAtivos.map((c) => c.id_cliente)));
    } else {
      setIdsClientes(new Set());
    }
  }

  function marcarPorPeriodicidade(
    periodicidade: "MENSAL" | "TRIMESTRAL" | "ANUAL",
    marcar: boolean
  ) {
    setIdsCatalogo((prev) => {
      const n = new Set(prev);
      for (const c of catAtivo) {
        if (c.periodicidade === periodicidade) {
          if (marcar) n.add(c.id_obrigacao_catalogo);
          else n.delete(c.id_obrigacao_catalogo);
        }
      }
      return n;
    });
  }

  const totalEstimado = idsClientes.size * idsCatalogo.size;
  const itensSelecionados = catAtivo.filter((c) =>
    idsCatalogo.has(c.id_obrigacao_catalogo)
  );

  const gerar = useMutation({
    mutationFn: async () => {
      if (!competencia) throw new Error("Informe a competência");
      if (idsClientes.size === 0)
        throw new Error("Selecione ao menos 1 cliente");
      if (idsCatalogo.size === 0)
        throw new Error("Selecione ao menos 1 obrigação");

      const supabase = createSupabaseBrowserClient();

      const { data: existentes, error: errEx } = await supabase
        .from("obrigacoes")
        .select("id_cliente, id_obrigacao_catalogo")
        .eq("competencia", competencia)
        .in("id_cliente", Array.from(idsClientes))
        .in("id_obrigacao_catalogo", Array.from(idsCatalogo));
      if (errEx) throw errEx;
      const jaTem = new Set(
        ((existentes ?? []) as Array<{
          id_cliente: string;
          id_obrigacao_catalogo: string;
        }>).map((e) => `${e.id_cliente}::${e.id_obrigacao_catalogo}`)
      );

      const novos: Array<Record<string, unknown>> = [];
      let semDia = 0;
      for (const cli of clientesAtivos) {
        if (!idsClientes.has(cli.id_cliente)) continue;
        for (const item of itensSelecionados) {
          const chave = `${cli.id_cliente}::${item.id_obrigacao_catalogo}`;
          if (jaTem.has(chave)) continue;
          const venc = venctoDoMes(competencia, item.dia_vencimento_padrao);
          if (!venc) {
            semDia++;
            continue;
          }
          novos.push({
            id_obrigacao: gerarId("OBR"),
            id_cliente: cli.id_cliente,
            id_obrigacao_catalogo: item.id_obrigacao_catalogo,
            competencia,
            data_vencimento: venc,
            status: "PENDENTE",
          });
        }
      }

      if (novos.length === 0) {
        return {
          criadas: 0,
          puladas: totalEstimado,
          semDia,
        };
      }

      const { error } = await supabase
        .from("obrigacoes")
        .insert(novos as never);
      if (error) throw error;
      return {
        criadas: novos.length,
        puladas: totalEstimado - novos.length - semDia,
        semDia,
      };
    },
    onSuccess: ({ criadas, puladas, semDia }) => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      if (criadas === 0) {
        toast.success(`Nada a gerar — ${puladas} já existiam`);
      } else {
        let msg = `${criadas} obrigaç${criadas === 1 ? "ão criada" : "ões criadas"}`;
        if (puladas > 0)
          msg += ` (${puladas} já existi${puladas === 1 ? "a" : "am"})`;
        if (semDia > 0)
          msg += `. ${semDia} item${semDia === 1 ? "" : "s"} sem dia padrão configurado.`;
        toast.success(msg);
      }
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Agrupa por periodicidade pra exibição
  const mensais = catAtivo.filter((c) => c.periodicidade === "MENSAL");
  const trimestrais = catAtivo.filter((c) => c.periodicidade === "TRIMESTRAL");
  const anuais = catAtivo.filter((c) => c.periodicidade === "ANUAL");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar obrigações do mês"
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={gerar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || totalEstimado === 0}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            {gerar.isPending
              ? "Gerando..."
              : `Gerar até ${totalEstimado} obrigaç${totalEstimado === 1 ? "ão" : "ões"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Competência" required>
          <input
            type="month"
            className={inputClass}
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </Field>

        {/* Resumo */}
        <div className="bg-verde-light border border-verde-border rounded-lg p-3 text-sm text-verde-dark flex items-center justify-between">
          <div>
            <strong>{idsClientes.size}</strong> cliente
            {idsClientes.size !== 1 && "s"} ×{" "}
            <strong>{idsCatalogo.size}</strong> obrigaç
            {idsCatalogo.size === 1 ? "ão" : "ões"}
          </div>
          <div className="font-serif text-lg font-bold">
            Até {totalEstimado} novas
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Clientes */}
          <div className="border border-card-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-card-border">
              <h4 className="font-serif text-sm font-semibold text-verde-dark">
                Clientes ({clientesAtivos.length} ativos)
              </h4>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTodosClientes(true)}
                  className="text-gold hover:text-verde-dark"
                >
                  Todos
                </button>
                <span className="text-gray-300">/</span>
                <button
                  type="button"
                  onClick={() => setTodosClientes(false)}
                  className="text-gold hover:text-verde-dark"
                >
                  Nenhum
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-card-border">
              {clientesAtivos.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-gray-500">
                  Nenhum cliente ativo
                </div>
              )}
              {clientesAtivos.map((c) => (
                <label
                  key={c.id_cliente}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={idsClientes.has(c.id_cliente)}
                    onChange={() => toggleCliente(c.id_cliente)}
                    className="rounded border-gray-300 text-verde-primary"
                  />
                  <span className="truncate text-gray-800">{c.razao_social}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Obrigações */}
          <div className="border border-card-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-card-border">
              <h4 className="font-serif text-sm font-semibold text-verde-dark">
                Obrigações do catálogo
              </h4>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {/* Grupos */}
              <GrupoCatalogo
                titulo="Mensais"
                itens={mensais}
                selecionados={idsCatalogo}
                onToggle={toggleCatalogo}
                onTodos={(m) => marcarPorPeriodicidade("MENSAL", m)}
              />
              <GrupoCatalogo
                titulo="Trimestrais"
                itens={trimestrais}
                selecionados={idsCatalogo}
                onToggle={toggleCatalogo}
                onTodos={(m) => marcarPorPeriodicidade("TRIMESTRAL", m)}
              />
              <GrupoCatalogo
                titulo="Anuais"
                itens={anuais}
                selecionados={idsCatalogo}
                onToggle={toggleCatalogo}
                onTodos={(m) => marcarPorPeriodicidade("ANUAL", m)}
              />
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500 leading-relaxed">
          Itens sem <strong>dia de vencimento padrão</strong> configurado no
          catálogo são pulados (lançamento manual). Itens que já existem na
          competência também são pulados (idempotente).
        </div>
      </div>
    </Modal>
  );
}

function GrupoCatalogo({
  titulo,
  itens,
  selecionados,
  onToggle,
  onTodos,
}: {
  titulo: string;
  itens: ObrigacaoCatalogo[];
  selecionados: Set<string>;
  onToggle: (id: string) => void;
  onTodos: (marcar: boolean) => void;
}) {
  if (itens.length === 0) return null;
  const todosMarcados = itens.every((i) =>
    selecionados.has(i.id_obrigacao_catalogo)
  );
  const algumMarcado = itens.some((i) =>
    selecionados.has(i.id_obrigacao_catalogo)
  );
  return (
    <div className="border-b border-card-border last:border-b-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/60 text-xs">
        <span className="uppercase tracking-wider text-gray-500 font-medium">
          {titulo} ({itens.length})
        </span>
        <button
          type="button"
          onClick={() => onTodos(!todosMarcados)}
          className="text-gold hover:text-verde-dark text-[11px]"
        >
          {todosMarcados ? "Desmarcar grupo" : algumMarcado ? "Marcar todos" : "Marcar todos"}
        </button>
      </div>
      {itens.map((it) => (
        <label
          key={it.id_obrigacao_catalogo}
          className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selecionados.has(it.id_obrigacao_catalogo)}
            onChange={() => onToggle(it.id_obrigacao_catalogo)}
            className="rounded border-gray-300 text-verde-primary"
          />
          <span className="font-mono text-xs text-verde-dark font-bold w-16 flex-shrink-0">
            {it.sigla}
          </span>
          <span className="text-gray-700 truncate flex-1">{it.nome}</span>
          {it.dia_vencimento_padrao && (
            <span className="text-[10px] text-gray-400 whitespace-nowrap">
              dia {it.dia_vencimento_padrao}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

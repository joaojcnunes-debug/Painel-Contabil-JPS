"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Link2,
  Loader2,
  Search,
  Unlink,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onVinculado?: () => void;
  chave: string;
  idCliente: string;
  valorNfe: number | null;
  dhEmissao: string | null;
  idLancamentoAtual: string | null;
};

type Lanc = {
  id_lancamento: string;
  data_lancamento: string;
  competencia: string | null;
  tipo: string;
  valor: number;
  descricao: string;
  documento_ref: string | null;
  // Contagem de NFe já vinculadas (via relação FK reversa) — 0 = disponível
  ja_vinculadas: number;
};

export function VincularLancamentoModal({
  open,
  onClose,
  onVinculado,
  chave,
  idCliente,
  valorNfe,
  dhEmissao,
  idLancamentoAtual,
}: Props) {
  const [busca, setBusca] = useState("");
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const competenciaNfe = dhEmissao ? dhEmissao.slice(0, 7) : null;

  useEffect(() => {
    if (!open) return;
    async function carrega() {
      setCarregando(true);
      try {
        const supabase = createSupabaseBrowserClient();
        // Puxa lançamentos DESPESA do mesmo cliente (NFe recebida costuma
        // corresponder a despesa/compra). Amplia janela: ±60 dias em torno
        // da emissão.
        let q = supabase
          .from("lancamentos")
          .select(
            "id_lancamento, data_lancamento, competencia, tipo, valor, descricao, documento_ref"
          )
          .eq("id_cliente", idCliente)
          .eq("tipo", "DESPESA")
          .order("data_lancamento", { ascending: false })
          .limit(150);
        if (dhEmissao) {
          const de = new Date(dhEmissao);
          de.setDate(de.getDate() - 60);
          const ate = new Date(dhEmissao);
          ate.setDate(ate.getDate() + 60);
          q = q
            .gte("data_lancamento", de.toISOString().slice(0, 10))
            .lte("data_lancamento", ate.toISOString().slice(0, 10));
        }
        const { data } = await q;
        const base = (data ?? []) as Array<{
          id_lancamento: string;
          data_lancamento: string;
          competencia: string | null;
          tipo: string;
          valor: number;
          descricao: string;
          documento_ref: string | null;
        }>;

        if (base.length === 0) {
          setLancs([]);
          return;
        }

        // Verifica quais IDs já estão vinculados a alguma NFe (pra
        // priorizar os disponíveis)
        const ids = base.map((l) => l.id_lancamento);
        const { data: vinculadosData } = await supabase
          .from("nfe_dfe_recebidas")
          .select("id_lancamento")
          .in("id_lancamento", ids);
        const vinculadosSet = new Set(
          ((vinculadosData ?? []) as Array<{ id_lancamento: string | null }>)
            .map((r) => r.id_lancamento)
            .filter((v): v is string => v !== null)
        );

        setLancs(
          base.map((l) => ({
            ...l,
            ja_vinculadas: vinculadosSet.has(l.id_lancamento) ? 1 : 0,
          }))
        );
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setCarregando(false);
      }
    }
    carrega();
  }, [open, idCliente, dhEmissao]);

  // Filtra por busca e ordena: sem NFe primeiro, valor mais próximo primeiro
  const lancsOrdenados = useMemo(() => {
    const filtrados = busca.trim()
      ? lancs.filter((l) => {
          const t = busca.toLowerCase();
          return (
            l.descricao.toLowerCase().includes(t) ||
            l.documento_ref?.toLowerCase().includes(t) ||
            l.competencia?.toLowerCase().includes(t)
          );
        })
      : lancs;
    return filtrados.sort((a, b) => {
      // Sem NFe vinculada primeiro
      if (a.ja_vinculadas !== b.ja_vinculadas) {
        return a.ja_vinculadas - b.ja_vinculadas;
      }
      // Valor mais próximo primeiro (se temos valor da NFe)
      if (valorNfe != null && valorNfe > 0) {
        const da = Math.abs(Number(a.valor) - valorNfe);
        const db = Math.abs(Number(b.valor) - valorNfe);
        if (da !== db) return da - db;
      }
      // Mais recente primeiro
      return b.data_lancamento.localeCompare(a.data_lancamento);
    });
  }, [lancs, busca, valorNfe]);

  async function vincular(id_lancamento: string | null) {
    setSalvando(true);
    try {
      const res = await fetch("/api/nfe/vincular-lancamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, id_lancamento }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.erro ?? "Falha ao vincular");
        return;
      }
      toast.success(id_lancamento ? "NFe vinculada ao lançamento" : "Vínculo removido");
      onVinculado?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular NFe a lançamento contábil"
      size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="text-[11px] text-gray-500">
            {valorNfe != null && (
              <>
                NFe: <strong>{formatBRL(valorNfe)}</strong>
                {dhEmissao && ` · ${formatDate(dhEmissao.slice(0, 10))}`}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {idLancamentoAtual && (
              <Button
                variant="secondary"
                onClick={() => vincular(null)}
                disabled={salvando}
                className="flex items-center gap-1"
              >
                <Unlink size={14} /> Desvincular
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={salvando}>
              Fechar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900 flex items-start gap-2">
          <Link2 size={12} className="flex-shrink-0 mt-0.5" />
          <div>
            Mostra lançamentos de <strong>DESPESA</strong> do mesmo cliente,
            no período ±60 dias da emissão. Ordem: lançamentos ainda{" "}
            <strong>sem NFe</strong> primeiro, depois valor mais próximo.
            Competência da NFe:{" "}
            {competenciaNfe ? (
              <strong>{competenciaNfe}</strong>
            ) : (
              <em>desconhecida</em>
            )}
            .
          </div>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            className={inputClass + " pl-9"}
            placeholder="Buscar por descrição, doc ref ou competência…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {carregando ? (
          <div className="py-10 text-center">
            <Loader2 size={20} className="animate-spin text-verde-primary mx-auto" />
          </div>
        ) : lancsOrdenados.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Nenhum lançamento de despesa encontrado. Crie o lançamento em{" "}
            <a href="/lancamentos" className="text-verde-primary underline">
              /lancamentos
            </a>{" "}
            e volte aqui.
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto border border-card-border rounded divide-y divide-card-border">
            {lancsOrdenados.map((l) => (
              <LancRow
                key={l.id_lancamento}
                l={l}
                valorNfe={valorNfe}
                ehAtual={l.id_lancamento === idLancamentoAtual}
                onSelecionar={() => vincular(l.id_lancamento)}
                salvando={salvando}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function LancRow({
  l,
  valorNfe,
  ehAtual,
  onSelecionar,
  salvando,
}: {
  l: Lanc;
  valorNfe: number | null;
  ehAtual: boolean;
  onSelecionar: () => void;
  salvando: boolean;
}) {
  const diff =
    valorNfe != null && valorNfe > 0
      ? Number(l.valor) - valorNfe
      : null;
  const bateExato = diff !== null && Math.abs(diff) < 0.01;
  return (
    <div
      className={`px-3 py-2.5 flex items-start gap-3 text-xs hover:bg-gray-50 ${
        ehAtual ? "bg-verde-light/40" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-800">{l.descricao}</span>
          {l.ja_vinculadas > 0 && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              já com NFe
            </span>
          )}
          {ehAtual && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-verde-light text-verde-dark">
              vinculada agora
            </span>
          )}
          {bateExato && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-verde-light text-verde-dark flex items-center gap-0.5">
              <CheckCircle2 size={9} /> bate
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {formatDate(l.data_lancamento)}
          {l.competencia && ` · ${l.competencia}`}
          {l.documento_ref && ` · doc ${l.documento_ref}`}
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="text-sm font-medium text-gray-800">
          {formatBRL(Number(l.valor))}
        </div>
        {diff !== null && !bateExato && (
          <div
            className={`text-[10px] ${
              Math.abs(diff) < Number(l.valor) * 0.05
                ? "text-amber-700"
                : "text-gray-500"
            }`}
          >
            {diff > 0 ? "+" : ""}
            {formatBRL(diff)}
          </div>
        )}
      </div>
      <button
        onClick={onSelecionar}
        disabled={salvando || ehAtual}
        className="p-1.5 rounded border border-verde-primary/30 text-verde-primary hover:bg-verde-primary hover:text-white disabled:opacity-40"
        title={ehAtual ? "Já vinculada" : "Vincular esta"}
      >
        {salvando ? (
          <Loader2 size={12} className="animate-spin" />
        ) : ehAtual ? (
          <X size={12} />
        ) : (
          <Link2 size={12} />
        )}
      </button>
    </div>
  );
}

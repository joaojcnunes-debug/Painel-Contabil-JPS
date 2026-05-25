"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ObrigacaoComJoin } from "@/lib/hooks/useObrigacoes";
import Modal from "@/components/ui/Modal";

const STATUS_DOT: Record<string, string> = {
  PENDENTE: "bg-gray-400",
  EM_ANDAMENTO: "bg-amber-500",
  ENTREGUE: "bg-verde-primary",
  ATRASADA: "bg-red-alert",
  DISPENSADA: "bg-gray-300",
};

const STATUS_TONE: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-700",
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  ENTREGUE: "bg-verde-light text-verde-dark",
  ATRASADA: "bg-red-100 text-red-700",
  DISPENSADA: "bg-gray-100 text-gray-500",
};

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Props = {
  year: number;
  month: number; // 1-12
  obrigacoes: ObrigacaoComJoin[];
  onChangeMonth: (year: number, month: number) => void;
};

export function CalendarMonth({ year, month, obrigacoes, onChangeMonth }: Props) {
  const [selDia, setSelDia] = useState<string | null>(null);

  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const startOffset = first.getDay(); // 0=domingo
    const days: Array<{ date: Date | null; iso: string | null }> = [];

    // Espaços antes do dia 1
    for (let i = 0; i < startOffset; i++) days.push({ date: null, iso: null });
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month - 1, d);
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date, iso });
    }
    // Preenche pra fechar a linha
    while (days.length % 7 !== 0) days.push({ date: null, iso: null });
    return days;
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, ObrigacaoComJoin[]>();
    for (const o of obrigacoes) {
      const arr = map.get(o.data_vencimento) ?? [];
      arr.push(o);
      map.set(o.data_vencimento, arr);
    }
    return map;
  }, [obrigacoes]);

  function prevMonth() {
    const m = month - 1;
    if (m < 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, m);
  }
  function nextMonth() {
    const m = month + 1;
    if (m > 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, m);
  }

  const hojeIso = new Date().toISOString().slice(0, 10);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const itensSel = selDia ? byDay.get(selDia) ?? [] : [];

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-base font-semibold text-verde-dark capitalize">
          {monthLabel}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              onChangeMonth(d.getFullYear(), d.getMonth() + 1);
            }}
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
          >
            Hoje
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-card-border bg-gray-50">
        {DOW.map((d) => (
          <div
            key={d}
            className="text-xs uppercase tracking-wider text-gray-500 text-center py-2"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((cell, i) => {
          if (!cell.iso) {
            return (
              <div
                key={i}
                className="min-h-[110px] border-r border-b border-card-border bg-gray-50/40"
              />
            );
          }
          const items = byDay.get(cell.iso) ?? [];
          const isHoje = cell.iso === hojeIso;
          return (
            <button
              key={i}
              onClick={() => items.length > 0 && setSelDia(cell.iso)}
              className={cn(
                "min-h-[110px] border-r border-b border-card-border p-1.5 text-left align-top flex flex-col gap-1 transition",
                items.length > 0 && "hover:bg-verde-light/40 cursor-pointer",
                items.length === 0 && "cursor-default"
              )}
            >
              <div
                className={cn(
                  "text-xs font-medium leading-none",
                  isHoje
                    ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-verde-primary text-white"
                    : "text-gray-700"
                )}
              >
                {cell.date!.getDate()}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {items.slice(0, 3).map((o) => (
                  <div
                    key={o.id_obrigacao}
                    className="flex items-center gap-1 text-[10px] text-gray-700 truncate"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[o.status] ?? "bg-gray-300"}`}
                    />
                    <span className="font-mono text-verde-dark mr-0.5">
                      {o.obrigacoes_catalogo?.sigla}
                    </span>
                    <span className="truncate">
                      {o.clientes?.razao_social}
                    </span>
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-gold font-medium">
                    +{items.length - 3} mais
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-card-border flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <Legenda cor="bg-gray-400" label="Pendente" />
        <Legenda cor="bg-amber-500" label="Em andamento" />
        <Legenda cor="bg-verde-primary" label="Entregue" />
        <Legenda cor="bg-red-alert" label="Atrasada" />
      </div>

      <Modal
        open={!!selDia}
        onClose={() => setSelDia(null)}
        title={
          selDia
            ? `Vencimentos em ${new Date(selDia + "T12:00").toLocaleDateString("pt-BR")}`
            : ""
        }
        size="md"
      >
        <div className="divide-y divide-card-border -mx-5 -my-4">
          {itensSel.map((o) => (
            <div key={o.id_obrigacao} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">
                    <span className="font-mono text-xs text-verde-dark mr-2">
                      {o.obrigacoes_catalogo?.sigla}
                    </span>
                    {o.clientes?.razao_social}
                  </div>
                  <div className="text-xs text-gray-500">
                    {o.obrigacoes_catalogo?.nome} • Comp. {o.competencia}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_TONE[o.status] ?? "bg-gray-100"}`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setSelDia(null)}
            className="text-sm text-gray-600 hover:text-verde-dark inline-flex items-center gap-1"
          >
            <X size={14} /> Fechar
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Legenda({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cor}`} />
      {label}
    </span>
  );
}

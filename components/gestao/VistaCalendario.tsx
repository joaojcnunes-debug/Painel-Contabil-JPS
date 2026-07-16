"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CORES_PRIORIDADE,
  type GestaoTarefa,
} from "@/lib/gestao/types";

type Props = {
  tarefas: GestaoTarefa[];
  onAbrirTarefa: (t: GestaoTarefa) => void;
};

const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOMES_MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

export function VistaCalendario({ tarefas, onAbrirTarefa }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth()); // 0-11

  // Agrupa tarefas por data (YYYY-MM-DD)
  const porData = useMemo(() => {
    const m = new Map<string, GestaoTarefa[]>();
    for (const t of tarefas) {
      if (!t.prazo) continue;
      const arr = m.get(t.prazo) ?? [];
      arr.push(t);
      m.set(t.prazo, arr);
    }
    return m;
  }, [tarefas]);

  const dias = useMemo(() => {
    const primeiro = new Date(ano, mes, 1);
    const inicio = new Date(primeiro);
    inicio.setDate(1 - primeiro.getDay()); // recuando pra domingo anterior
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [ano, mes]);

  function isoDia(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const hojeIso = isoDia(hoje);
  const semPrazo = tarefas.filter((t) => !t.prazo);

  function mudarMes(delta: number) {
    let m2 = mes + delta;
    let a2 = ano;
    if (m2 < 0) { m2 = 11; a2 -= 1; }
    if (m2 > 11) { m2 = 0; a2 += 1; }
    setAno(a2);
    setMes(m2);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => mudarMes(-1)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="text-sm font-medium text-gray-800 min-w-[120px] text-center">
            {NOMES_MESES[mes]} {ano}
          </div>
          <button
            onClick={() => mudarMes(1)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={() => {
            setAno(hoje.getFullYear());
            setMes(hoje.getMonth());
          }}
          className="text-xs text-verde-primary hover:text-verde-dark"
        >
          Hoje
        </button>
      </div>

      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-card-border bg-gray-50">
          {NOMES_DIAS.map((n) => (
            <div key={n} className="px-2 py-1.5 text-[10px] uppercase text-gray-500 text-center">
              {n}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((d, i) => {
            const iso = isoDia(d);
            const noMes = d.getMonth() === mes;
            const eHoje = iso === hojeIso;
            const tarefasDoDia = porData.get(iso) ?? [];
            return (
              <div
                key={i}
                className={cn(
                  "border-r border-b border-card-border p-1.5 min-h-[92px] flex flex-col gap-1",
                  !noMes && "bg-gray-50/50",
                  i % 7 === 6 && "border-r-0"
                )}
              >
                <div
                  className={cn(
                    "text-[11px] self-end",
                    eHoje
                      ? "font-bold text-white bg-verde-primary w-5 h-5 rounded-full flex items-center justify-center"
                      : noMes
                        ? "text-gray-700"
                        : "text-gray-400"
                  )}
                >
                  {d.getDate()}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {tarefasDoDia.slice(0, 3).map((t) => (
                    <button
                      key={t.id_tarefa}
                      onClick={() => onAbrirTarefa(t)}
                      className={cn(
                        "w-full text-left px-1 py-0.5 text-[10px] rounded truncate",
                        CORES_PRIORIDADE[t.prioridade],
                        "hover:opacity-80"
                      )}
                      title={t.titulo}
                    >
                      {t.titulo}
                    </button>
                  ))}
                  {tarefasDoDia.length > 3 && (
                    <div className="text-[9px] text-gray-500 text-center">
                      +{tarefasDoDia.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {semPrazo.length > 0 && (
        <div className="bg-white border border-card-border rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
            Sem prazo ({semPrazo.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {semPrazo.map((t) => (
              <button
                key={t.id_tarefa}
                onClick={() => onAbrirTarefa(t)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded",
                  CORES_PRIORIDADE[t.prioridade],
                  "hover:opacity-80"
                )}
              >
                {t.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

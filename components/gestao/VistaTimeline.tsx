"use client";

import { useMemo } from "react";
import { cn, formatDate } from "@/lib/utils";
import { CORES_PRIORIDADE, type GestaoTarefa } from "@/lib/gestao/types";

type Props = {
  tarefas: GestaoTarefa[];
  onAbrirTarefa: (t: GestaoTarefa) => void;
};

// Timeline (Gantt básico) — usa data_inicio → prazo. Tarefas sem uma das
// duas datas viram barra pontual no dia com dado disponível.
export function VistaTimeline({ tarefas, onAbrirTarefa }: Props) {
  const comDatas = useMemo(
    () => tarefas.filter((t) => t.prazo || t.data_inicio),
    [tarefas]
  );

  const { inicio, dias } = useMemo(() => {
    if (comDatas.length === 0)
      return { inicio: new Date(), dias: 30 };
    let min = Infinity;
    let max = -Infinity;
    for (const t of comDatas) {
      if (t.data_inicio) {
        const v = new Date(t.data_inicio).getTime();
        if (v < min) min = v;
      }
      if (t.prazo) {
        const v = new Date(t.prazo).getTime();
        if (v > max) max = v;
        if (!t.data_inicio && v < min) min = v;
      }
    }
    if (max === -Infinity) max = min + 30 * 86400000;
    if (min === Infinity) min = max - 30 * 86400000;
    // Padding de 3 dias em cada lado
    const inicio = new Date(min - 3 * 86400000);
    const fim = new Date(max + 3 * 86400000);
    const dias = Math.max(
      14,
      Math.round((fim.getTime() - inicio.getTime()) / 86400000)
    );
    return { inicio, dias };
  }, [comDatas]);

  const larguraCelula = 28; // px por dia
  const larguraGrid = dias * larguraCelula;

  if (comDatas.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">
        Nenhuma tarefa com data (data_inicio ou prazo) pra mostrar na timeline.
      </div>
    );
  }

  function offsetDias(iso: string): number {
    const d = new Date(iso).getTime();
    return Math.max(
      0,
      Math.round((d - inicio.getTime()) / 86400000)
    );
  }

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${larguraGrid + 220}px` }}>
          {/* Cabeçalho de dias */}
          <div className="flex border-b border-card-border sticky top-0 bg-white">
            <div className="w-52 flex-shrink-0 px-3 py-2 text-[10px] uppercase text-gray-500">
              Tarefa
            </div>
            <div className="flex" style={{ width: `${larguraGrid}px` }}>
              {Array.from({ length: dias }).map((_, i) => {
                const d = new Date(inicio);
                d.setDate(inicio.getDate() + i);
                const primeiroDoMes = d.getDate() === 1 || i === 0;
                return (
                  <div
                    key={i}
                    className="text-[9px] text-gray-500 text-center border-r border-card-border/50 py-1"
                    style={{ width: `${larguraCelula}px` }}
                  >
                    {primeiroDoMes && (
                      <div className="text-[9px] font-medium text-gray-700 uppercase">
                        {d.toLocaleDateString("pt-BR", { month: "short" })}
                      </div>
                    )}
                    <div>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Linhas de tarefas */}
          <div className="divide-y divide-card-border">
            {comDatas.map((t) => {
              const ini = t.data_inicio ?? t.prazo!;
              const fim = t.prazo ?? t.data_inicio!;
              const offsetInicio = offsetDias(ini);
              const offsetFim = offsetDias(fim);
              const larg = Math.max(
                larguraCelula,
                (offsetFim - offsetInicio + 1) * larguraCelula
              );
              const left = offsetInicio * larguraCelula;
              return (
                <div key={t.id_tarefa} className="flex items-center hover:bg-gray-50">
                  <div className="w-52 flex-shrink-0 px-3 py-2">
                    <button
                      onClick={() => onAbrirTarefa(t)}
                      className="text-xs text-gray-800 truncate max-w-full text-left hover:text-verde-dark"
                    >
                      {t.titulo}
                    </button>
                    <div className="text-[10px] text-gray-500">
                      {t.data_inicio ? formatDate(t.data_inicio) : "—"} →{" "}
                      {t.prazo ? formatDate(t.prazo) : "—"}
                    </div>
                  </div>
                  <div
                    className="relative"
                    style={{ width: `${larguraGrid}px`, height: "38px" }}
                  >
                    <button
                      onClick={() => onAbrirTarefa(t)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 h-5 rounded shadow-sm hover:brightness-95 border",
                        CORES_PRIORIDADE[t.prioridade]
                      )}
                      style={{ left: `${left}px`, width: `${larg}px` }}
                      title={t.titulo}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

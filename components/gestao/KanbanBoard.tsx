"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TarefaCard } from "./TarefaCard";
import type { GestaoStatus, GestaoTarefa } from "@/lib/gestao/types";

type Props = {
  status: GestaoStatus[];
  tarefas: GestaoTarefa[];
  loading?: boolean;
  onMover: (input: {
    id_tarefa: string;
    id_quadro: string;
    novo_status: string;
  }) => void;
  onAbrirTarefa: (t: GestaoTarefa) => void;
  onNovaTarefa: (slugStatus: string) => void;
};

export function KanbanBoard({
  status,
  tarefas,
  loading,
  onMover,
  onAbrirTarefa,
  onNovaTarefa,
}: Props) {
  const [dragOverSlug, setDragOverSlug] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const porStatus = useMemo(() => {
    const m = new Map<string, GestaoTarefa[]>();
    for (const s of status) m.set(s.slug, []);
    for (const t of tarefas) {
      const arr = m.get(t.status);
      if (arr) arr.push(t);
      else m.set(t.status, [t]);
    }
    return m;
  }, [status, tarefas]);

  function handleDrop(e: React.DragEvent, slug: string) {
    e.preventDefault();
    setDragOverSlug(null);
    const id_tarefa = e.dataTransfer.getData("text/tarefa-id");
    const id_quadro = e.dataTransfer.getData("text/quadro-id");
    if (!id_tarefa || !id_quadro) return;
    // Não faz nada se largou na mesma coluna
    const original = tarefas.find((t) => t.id_tarefa === id_tarefa);
    if (original && original.status === slug) return;
    onMover({ id_tarefa, id_quadro, novo_status: slug });
    setDraggingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando quadro…
      </div>
    );
  }

  if (status.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">
        Este quadro não tem colunas de status ainda.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
      {status.map((s) => {
        const lista = porStatus.get(s.slug) ?? [];
        const active = dragOverSlug === s.slug;
        return (
          <div
            key={s.slug}
            className={cn(
              "flex-shrink-0 w-72 bg-app-bg/60 border border-card-border rounded-xl flex flex-col",
              active && "border-verde-primary ring-2 ring-verde-primary/20"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverSlug(s.slug);
            }}
            onDragLeave={() => setDragOverSlug(null)}
            onDrop={(e) => handleDrop(e, s.slug)}
          >
            {/* Header da coluna */}
            <div className="flex items-center justify-between p-3 border-b border-card-border">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: s.cor }}
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-700 truncate">
                  {s.nome}
                </span>
                <span className="text-[10px] text-gray-500 flex-shrink-0">
                  {lista.length}
                </span>
              </div>
              <button
                onClick={() => onNovaTarefa(s.slug)}
                className="p-1 rounded hover:bg-white text-gray-400 hover:text-verde-primary"
                title="Nova tarefa"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 flex-1 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto">
              {lista.length === 0 && (
                <div className="text-[11px] text-gray-400 text-center py-6 italic">
                  Solte tarefas aqui
                </div>
              )}
              {lista.map((t) => (
                <div
                  key={t.id_tarefa}
                  className={cn(
                    "transition-opacity",
                    draggingId === t.id_tarefa && "opacity-40"
                  )}
                >
                  <TarefaCard
                    tarefa={t}
                    onClick={() => onAbrirTarefa(t)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/tarefa-id", t.id_tarefa);
                      e.dataTransfer.setData("text/quadro-id", t.id_quadro);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(t.id_tarefa);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

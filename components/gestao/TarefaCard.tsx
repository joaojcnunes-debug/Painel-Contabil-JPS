"use client";

import { Calendar, CircleDot, User } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  CORES_PRIORIDADE,
  iniciais,
  corAvatar,
  type GestaoTarefa,
} from "@/lib/gestao/types";

type Props = {
  tarefa: GestaoTarefa;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
};

export function TarefaCard({ tarefa, onClick, onDragStart }: Props) {
  const atrasada =
    !!tarefa.prazo &&
    tarefa.prazo < new Date().toISOString().slice(0, 10);
  const subtarefasTotal = tarefa.subtarefas?.length ?? 0;
  const subtarefasFeitas =
    tarefa.subtarefas?.filter((s) => s.concluida).length ?? 0;

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "w-full bg-white border border-card-border rounded-lg p-3 text-left cursor-grab active:cursor-grabbing",
        "hover:border-verde-primary hover:shadow-sm transition-all",
        "flex flex-col gap-2"
      )}
    >
      {/* Etiquetas */}
      {tarefa.etiquetas && tarefa.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tarefa.etiquetas.slice(0, 3).map((et) => (
            <span
              key={et}
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-verde-light text-verde-dark"
            >
              {et}
            </span>
          ))}
          {tarefa.etiquetas.length > 3 && (
            <span className="text-[9px] text-gray-500">
              +{tarefa.etiquetas.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Título */}
      <div className="text-sm font-medium text-gray-800 line-clamp-2">
        {tarefa.titulo}
      </div>

      {/* Descrição (curta) */}
      {tarefa.descricao && (
        <div className="text-xs text-gray-500 line-clamp-2">
          {tarefa.descricao}
        </div>
      )}

      {/* Rodapé: prioridade + prazo + responsável */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
          <span
            className={cn(
              "px-1.5 py-0.5 rounded uppercase tracking-wide font-medium",
              CORES_PRIORIDADE[tarefa.prioridade]
            )}
          >
            {tarefa.prioridade}
          </span>
          {tarefa.prazo && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5",
                atrasada ? "text-red-alert font-medium" : "text-gray-500"
              )}
              title={atrasada ? "Prazo vencido" : "Prazo"}
            >
              <Calendar size={10} />
              {formatDate(tarefa.prazo)}
            </span>
          )}
          {subtarefasTotal > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-gray-500"
              title="Subtarefas"
            >
              <CircleDot size={10} />
              {subtarefasFeitas}/{subtarefasTotal}
            </span>
          )}
        </div>
        {tarefa.responsavel ? (
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ background: corAvatar(tarefa.responsavel) }}
            title={tarefa.responsavel}
          >
            {iniciais(tarefa.responsavel)}
          </span>
        ) : (
          <User size={14} className="text-gray-300 flex-shrink-0" />
        )}
      </div>
    </button>
  );
}

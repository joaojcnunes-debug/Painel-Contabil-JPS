"use client";

import { useMemo } from "react";
import { Calendar, User } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  CORES_PRIORIDADE,
  corAvatar,
  iniciais,
  type AgruparPor,
  type GestaoStatus,
  type GestaoTarefa,
} from "@/lib/gestao/types";

type Props = {
  status: GestaoStatus[];
  tarefas: GestaoTarefa[];
  agruparPor: AgruparPor;
  onAbrirTarefa: (t: GestaoTarefa) => void;
};

export function VistaLista({ status, tarefas, agruparPor, onAbrirTarefa }: Props) {
  const grupos = useMemo(() => {
    const m = new Map<string, GestaoTarefa[]>();
    const keyOf = (t: GestaoTarefa): string => {
      switch (agruparPor) {
        case "status":
          return t.status;
        case "responsavel":
          return t.responsavel ?? "(sem responsável)";
        case "prioridade":
          return t.prioridade;
        case "etiqueta":
          return t.etiquetas[0] ?? "(sem etiqueta)";
      }
    };
    for (const t of tarefas) {
      const k = keyOf(t);
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [tarefas, agruparPor]);

  // Rótulo do grupo: se agrupou por status, usa nome do status
  const statusPorSlug = useMemo(() => {
    const m = new Map<string, GestaoStatus>();
    for (const s of status) m.set(s.slug, s);
    return m;
  }, [status]);

  function labelGrupo(k: string): { label: string; cor?: string } {
    if (agruparPor === "status") {
      const s = statusPorSlug.get(k);
      return { label: s?.nome ?? k, cor: s?.cor };
    }
    return { label: k };
  }

  if (tarefas.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">
        Nenhuma tarefa nos filtros atuais.
      </div>
    );
  }

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-2.5">Tarefa</th>
            <th className="px-4 py-2.5 w-24">Prioridade</th>
            <th className="px-4 py-2.5 w-32">Prazo</th>
            <th className="px-4 py-2.5 w-40">Responsável</th>
            <th className="px-4 py-2.5 w-40">Etiquetas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {grupos.map(([k, itens]) => {
            const lg = labelGrupo(k);
            return (
              <>
                <tr key={`g-${k}`} className="bg-app-bg/60">
                  <td colSpan={5} className="px-4 py-2 text-[11px] uppercase tracking-wide font-semibold text-gray-700">
                    <span className="inline-flex items-center gap-2">
                      {lg.cor && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: lg.cor }}
                        />
                      )}
                      {lg.label}
                      <span className="text-gray-400 font-normal">({itens.length})</span>
                    </span>
                  </td>
                </tr>
                {itens.map((t) => {
                  const atrasada =
                    !!t.prazo && t.prazo < new Date().toISOString().slice(0, 10);
                  return (
                    <tr
                      key={t.id_tarefa}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => onAbrirTarefa(t)}
                    >
                      <td className="px-4 py-2.5 text-gray-800">{t.titulo}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium",
                            CORES_PRIORIDADE[t.prioridade]
                          )}
                        >
                          {t.prioridade}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {t.prazo ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              atrasada ? "text-red-alert font-medium" : "text-gray-600"
                            )}
                          >
                            <Calendar size={11} />
                            {formatDate(t.prazo)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {t.responsavel ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ background: corAvatar(t.responsavel) }}
                            >
                              {iniciais(t.responsavel)}
                            </span>
                            <span className="text-gray-700 truncate">{t.responsavel}</span>
                          </span>
                        ) : (
                          <User size={12} className="text-gray-300" />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {t.etiquetas.slice(0, 3).map((et) => (
                            <span
                              key={et}
                              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-verde-light text-verde-dark"
                            >
                              {et}
                            </span>
                          ))}
                          {t.etiquetas.length > 3 && (
                            <span className="text-[9px] text-gray-400">
                              +{t.etiquetas.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

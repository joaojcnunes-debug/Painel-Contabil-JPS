"use client";

import { useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  useDependencias,
  useAddDependencia,
  useExcluirDependencia,
  useTarefas,
} from "@/lib/gestao/hooks";
import type { GestaoStatus, GestaoTarefa } from "@/lib/gestao/types";

type Props = {
  idTarefa: string;
  idQuadro: string;
  status: GestaoStatus[];
};

export function DependenciasSection({ idTarefa, idQuadro, status }: Props) {
  const { data: deps = [] } = useDependencias(idTarefa);
  const { data: outrasTarefas = [] } = useTarefas(idQuadro);
  const add = useAddDependencia();
  const excluir = useExcluirDependencia();

  const [novaDep, setNovaDep] = useState("");
  const [busca, setBusca] = useState("");

  const statusConcluidos = useMemo(
    () => new Set(status.filter((s) => s.tipo === "concluido").map((s) => s.slug)),
    [status]
  );

  const depsResolvidas = useMemo(() => {
    const m = new Map<string, GestaoTarefa>();
    for (const t of outrasTarefas) m.set(t.id_tarefa, t);
    return deps.map((d) => ({
      dep: d,
      alvo: m.get(d.depende_de) ?? null,
      concluida: (() => {
        const t = m.get(d.depende_de);
        return !!t && statusConcluidos.has(t.status);
      })(),
    }));
  }, [deps, outrasTarefas, statusConcluidos]);

  const candidatas = useMemo(() => {
    const idsExistentes = new Set([idTarefa, ...deps.map((d) => d.depende_de)]);
    const q = busca.trim().toLowerCase();
    return outrasTarefas
      .filter((t) => !idsExistentes.has(t.id_tarefa))
      .filter((t) => (q ? t.titulo.toLowerCase().includes(q) : true))
      .slice(0, 20);
  }, [outrasTarefas, deps, idTarefa, busca]);

  const abertas = depsResolvidas.filter((d) => d.alvo && !d.concluida);
  const podeConcluir = abertas.length === 0;

  return (
    <div className="space-y-3">
      {deps.length > 0 && (
        <div
          className={cn(
            "border rounded-lg p-3 text-xs",
            podeConcluir
              ? "border-verde-primary/30 bg-verde-light/40 text-verde-dark"
              : "border-amber-300 bg-amber-50 text-amber-900"
          )}
        >
          {podeConcluir
            ? `Todas as ${deps.length} dependência(s) concluídas — esta tarefa pode ser finalizada.`
            : `${abertas.length} dependência(s) ainda aberta(s). Concluir estas antes.`}
        </div>
      )}

      {depsResolvidas.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-2 italic">
          Sem dependências. Adicione abaixo pra bloquear a conclusão até que
          outras tarefas fiquem prontas.
        </div>
      ) : (
        <div className="border border-card-border rounded-lg divide-y divide-card-border">
          {depsResolvidas.map((d) => (
            <div key={d.dep.id} className="px-3 py-2 flex items-center gap-2 text-xs">
              <Link2
                size={12}
                className={d.concluida ? "text-verde-primary" : "text-amber-600"}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">
                  {d.alvo?.titulo ?? d.dep.depende_de}
                </div>
                {d.alvo && (
                  <div className="text-[10px] text-gray-500">
                    Status: {d.alvo.status}
                    {d.concluida && " · concluída ✓"}
                  </div>
                )}
              </div>
              <button
                onClick={() =>
                  excluir.mutate({ id: d.dep.id, id_tarefa: idTarefa })
                }
                className="p-1 text-gray-400 hover:text-red-alert"
                title="Remover dependência"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-dashed border-card-border rounded-lg p-3">
        <div className="text-xs uppercase text-gray-500 mb-2">
          Adicionar dependência
        </div>
        <input
          className={inputClass}
          placeholder="Buscar tarefa deste quadro…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
          {candidatas.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic">
              Nenhuma outra tarefa disponível.
            </div>
          ) : (
            candidatas.map((t) => (
              <button
                key={t.id_tarefa}
                onClick={() => {
                  add.mutate(
                    { id_tarefa: idTarefa, depende_de: t.id_tarefa },
                    { onSuccess: () => setBusca("") }
                  );
                }}
                className={cn(
                  "w-full text-left text-xs px-2 py-1.5 rounded hover:bg-verde-light flex items-center gap-2",
                  novaDep === t.id_tarefa && "bg-verde-light"
                )}
              >
                <Plus size={11} className="text-verde-primary" />
                <span className="truncate flex-1">{t.titulo}</span>
                <span className="text-[10px] text-gray-500">{t.status}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

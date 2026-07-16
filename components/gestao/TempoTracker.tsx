"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Play, Plus, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass, Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  useTempoTarefa,
  useIniciarTempo,
  usePararTempo,
  useAddTempoManual,
  useExcluirTempo,
} from "@/lib/gestao/hooks";
import { formatarDuracao, totalSegundos } from "@/lib/gestao/types";

type Props = {
  idTarefa: string;
  usuarioEmail: string | null;
};

export function TempoTracker({ idTarefa, usuarioEmail }: Props) {
  const { data: regs = [] } = useTempoTarefa(idTarefa);
  const iniciar = useIniciarTempo();
  const parar = usePararTempo();
  const addManual = useAddTempoManual();
  const excluir = useExcluirTempo();

  const [manualOpen, setManualOpen] = useState(false);
  const [manualIni, setManualIni] = useState("");
  const [manualFim, setManualFim] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  // Tick a cada 30s pra atualizar tempo em curso
  const [_now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const meuAtivo = useMemo(() => {
    if (!usuarioEmail) return null;
    return (
      regs.find(
        (r) => !r.fim && r.usuario_email.toLowerCase() === usuarioEmail.toLowerCase()
      ) ?? null
    );
  }, [regs, usuarioEmail]);

  const total = useMemo(() => totalSegundos(regs), [regs]);

  function submitManual() {
    if (!usuarioEmail || !manualIni || !manualFim) return;
    addManual.mutate(
      {
        id_tarefa: idTarefa,
        usuario_email: usuarioEmail,
        inicio: new Date(manualIni).toISOString(),
        fim: new Date(manualFim).toISOString(),
        descricao: manualDesc || undefined,
      },
      {
        onSuccess: () => {
          setManualOpen(false);
          setManualIni("");
          setManualFim("");
          setManualDesc("");
        },
      }
    );
  }

  return (
    <div className="space-y-3">
      {/* Timer control + total */}
      <div className="flex items-center justify-between bg-app-bg/60 border border-card-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-verde-primary" />
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Total</div>
            <div className="text-lg font-bold text-gray-800">
              {formatarDuracao(total)}
            </div>
          </div>
        </div>
        {meuAtivo ? (
          <Button
            variant="secondary"
            onClick={() =>
              parar.mutate({
                id: meuAtivo.id,
                id_tarefa: idTarefa,
                usuario_email: usuarioEmail!,
              })
            }
            disabled={parar.isPending}
            className="flex items-center gap-1.5"
          >
            <Square size={12} /> Parar cronômetro
          </Button>
        ) : (
          <Button
            onClick={() =>
              iniciar.mutate({
                id_tarefa: idTarefa,
                usuario_email: usuarioEmail!,
              })
            }
            disabled={!usuarioEmail || iniciar.isPending}
            className="flex items-center gap-1.5"
          >
            <Play size={12} /> Iniciar cronômetro
          </Button>
        )}
      </div>

      {/* Add manual */}
      <div>
        {!manualOpen ? (
          <button
            onClick={() => setManualOpen(true)}
            className="text-xs text-verde-primary hover:text-verde-dark inline-flex items-center gap-1"
          >
            <Plus size={11} /> Adicionar tempo manual
          </button>
        ) : (
          <div className="border border-card-border rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Início">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={manualIni}
                  onChange={(e) => setManualIni(e.target.value)}
                />
              </Field>
              <Field label="Fim">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={manualFim}
                  onChange={(e) => setManualFim(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Descrição (opcional)">
              <input
                className={inputClass}
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                placeholder="O que foi feito neste período"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setManualOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={submitManual}
                disabled={!manualIni || !manualFim || addManual.isPending}
              >
                Salvar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de registros */}
      {regs.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-4 italic">
          Nenhum registro de tempo ainda.
        </div>
      ) : (
        <div className="border border-card-border rounded-lg divide-y divide-card-border">
          {regs.map((r) => {
            const rodando = !r.fim;
            const seg = r.segundos ?? (rodando
              ? Math.floor((Date.now() - new Date(r.inicio).getTime()) / 1000)
              : 0);
            const eMeuAtivo = meuAtivo && r.id === meuAtivo.id;
            return (
              <div
                key={r.id}
                className={cn(
                  "px-3 py-2 flex items-center gap-3 text-xs",
                  rodando && "bg-verde-light/30"
                )}
              >
                <Clock
                  size={12}
                  className={rodando ? "text-verde-primary animate-pulse" : "text-gray-400"}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">
                    {formatarDuracao(seg)}
                    {rodando && (
                      <span className="ml-2 text-[10px] text-verde-primary uppercase font-bold">
                        rodando
                      </span>
                    )}
                    {r.manual && (
                      <span className="ml-2 text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-100 text-amber-800">
                        manual
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {new Date(r.inicio).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {r.fim && (
                      <>
                        {" → "}
                        {new Date(r.fim).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </>
                    )}
                    {" · "}
                    {r.usuario_email}
                    {r.descricao && ` — ${r.descricao}`}
                  </div>
                </div>
                {!eMeuAtivo &&
                  usuarioEmail &&
                  r.usuario_email.toLowerCase() === usuarioEmail.toLowerCase() && (
                    <button
                      onClick={() => {
                        if (confirm("Excluir este registro de tempo?")) {
                          excluir.mutate({ id: r.id, id_tarefa: idTarefa });
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-red-alert"
                      title="Excluir"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

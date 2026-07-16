"use client";

import { useState } from "react";
import { Filter, Save, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  contarFiltros,
  PRIORIDADES,
  type FiltrosGestao,
  type GestaoStatus,
  type PrioridadeTarefa,
} from "@/lib/gestao/types";

type FiltroSalvo = {
  id: string;
  nome: string;
  criterios: FiltrosGestao;
};

type Props = {
  status: GestaoStatus[];
  filtros: FiltrosGestao;
  onChange: (f: FiltrosGestao) => void;
  filtrosSalvos: FiltroSalvo[];
  onSalvar: (nome: string) => void;
  onExcluir: (id: string) => void;
  onCarregar: (f: FiltrosGestao) => void;
};

export function FiltrosPanel({
  status,
  filtros,
  onChange,
  filtrosSalvos,
  onSalvar,
  onExcluir,
  onCarregar,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [nomeSalvar, setNomeSalvar] = useState("");

  const total = contarFiltros(filtros);

  function limpar() {
    onChange({});
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 max-w-xs">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          className={cn(inputClass, "pl-8")}
          placeholder="Buscar tarefa…"
          value={filtros.busca ?? ""}
          onChange={(e) => onChange({ ...filtros, busca: e.target.value })}
        />
      </div>

      <button
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "px-2.5 py-1.5 rounded border text-xs inline-flex items-center gap-1.5",
          total > 0
            ? "border-verde-primary bg-verde-light text-verde-dark"
            : "border-card-border text-gray-700 hover:bg-gray-50"
        )}
      >
        <Filter size={12} /> Filtros{total > 0 && ` (${total})`}
      </button>

      {filtrosSalvos.length > 0 && (
        <select
          className={cn(inputClass, "text-xs py-1.5 max-w-[180px]")}
          value=""
          onChange={(e) => {
            const f = filtrosSalvos.find((x) => x.id === e.target.value);
            if (f) onCarregar(f.criterios);
          }}
        >
          <option value="">Filtros salvos…</option>
          {filtrosSalvos.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      )}

      {total > 0 && (
        <button
          onClick={limpar}
          className="text-xs text-gray-500 hover:text-red-alert inline-flex items-center gap-1"
        >
          <X size={11} /> Limpar
        </button>
      )}

      {aberto && (
        <div className="w-full bg-white border border-card-border rounded-xl p-3 mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] uppercase text-gray-500 block mb-1">
              Status
            </label>
            <select
              className={inputClass}
              value={filtros.status ?? ""}
              onChange={(e) =>
                onChange({ ...filtros, status: e.target.value || undefined })
              }
            >
              <option value="">Todos</option>
              {status.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-gray-500 block mb-1">
              Prioridade
            </label>
            <select
              className={inputClass}
              value={filtros.prioridade ?? ""}
              onChange={(e) =>
                onChange({
                  ...filtros,
                  prioridade: (e.target.value || undefined) as
                    | PrioridadeTarefa
                    | undefined,
                })
              }
            >
              <option value="">Todas</option>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-gray-500 block mb-1">
              Responsável
            </label>
            <input
              className={inputClass}
              placeholder="email…"
              value={filtros.responsavel ?? ""}
              onChange={(e) =>
                onChange({
                  ...filtros,
                  responsavel: e.target.value || undefined,
                })
              }
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-gray-500 block mb-1">
              Prazo
            </label>
            <select
              className={inputClass}
              value={filtros.prazo ?? ""}
              onChange={(e) =>
                onChange({
                  ...filtros,
                  prazo:
                    (e.target.value ||
                      undefined) as FiltrosGestao["prazo"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="hoje">Hoje</option>
              <option value="semana">Próximos 7 dias</option>
              <option value="sem-prazo">Sem prazo</option>
            </select>
          </div>

          {/* Salvar filtro */}
          <div className="col-span-2 lg:col-span-4 border-t border-card-border pt-3 flex items-center gap-2">
            <input
              className={cn(inputClass, "max-w-xs")}
              placeholder="Nome do filtro pra salvar…"
              value={nomeSalvar}
              onChange={(e) => setNomeSalvar(e.target.value)}
            />
            <Button
              onClick={() => {
                if (!nomeSalvar.trim()) return;
                onSalvar(nomeSalvar.trim());
                setNomeSalvar("");
              }}
              disabled={!nomeSalvar.trim() || total === 0}
              className="text-xs inline-flex items-center gap-1"
            >
              <Save size={11} /> Salvar filtro
            </Button>
            {filtrosSalvos.length > 0 && (
              <div className="text-[11px] text-gray-500">
                Excluir salvos:
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {filtrosSalvos.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onExcluir(f.id)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:border-red-alert hover:text-red-alert inline-flex items-center gap-1"
                  title="Excluir"
                >
                  {f.nome} <X size={9} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

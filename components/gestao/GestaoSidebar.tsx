"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Layout,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GestaoEspaco, GestaoPasta, GestaoQuadro } from "@/lib/gestao/types";

type Props = {
  espacos: GestaoEspaco[];
  pastas: GestaoPasta[];
  quadros: GestaoQuadro[];
  quadroSel: string | null;
  souGestor: boolean;
  onSelectQuadro: (id_quadro: string) => void;
  onNovoEspaco: () => void;
  onNovaPasta: (idEspaco: string) => void;
  onNovoQuadro: (dados: { idEspaco?: string; idPasta?: string }) => void;
  onExcluirEspaco?: (id: string) => void;
  onExcluirPasta?: (id: string) => void;
  onExcluirQuadro?: (id_quadro: string) => void;
};

export function GestaoSidebar({
  espacos,
  pastas,
  quadros,
  quadroSel,
  souGestor,
  onSelectQuadro,
  onNovoEspaco,
  onNovaPasta,
  onNovoQuadro,
  onExcluirEspaco,
  onExcluirPasta,
  onExcluirQuadro,
}: Props) {
  // Todos os espaços expandidos por default na primeira renderização
  const [expandidos, setExpandidos] = useState<Set<string>>(
    new Set(espacos.map((e) => e.id))
  );
  const [expandidasPastas, setExpandidasPastas] = useState<Set<string>>(new Set());

  const pastasPorEspaco = useMemo(() => {
    const m = new Map<string, GestaoPasta[]>();
    for (const p of pastas) {
      const arr = m.get(p.id_espaco) ?? [];
      arr.push(p);
      m.set(p.id_espaco, arr);
    }
    return m;
  }, [pastas]);

  // Quadros: separados por espaço (fora de pasta) e por pasta
  const quadrosSoltos = useMemo(() => {
    const m = new Map<string, GestaoQuadro[]>();
    for (const q of quadros) {
      if (q.id_pasta || !q.id_espaco) continue;
      const arr = m.get(q.id_espaco) ?? [];
      arr.push(q);
      m.set(q.id_espaco, arr);
    }
    return m;
  }, [quadros]);

  const quadrosPorPasta = useMemo(() => {
    const m = new Map<string, GestaoQuadro[]>();
    for (const q of quadros) {
      if (!q.id_pasta) continue;
      const arr = m.get(q.id_pasta) ?? [];
      arr.push(q);
      m.set(q.id_pasta, arr);
    }
    return m;
  }, [quadros]);

  const quadrosOrfaos = quadros.filter((q) => !q.id_espaco && !q.id_pasta);

  function toggleEspaco(id: string) {
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function togglePasta(id: string) {
    setExpandidasPastas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <aside className="w-64 shrink-0 bg-white border border-card-border rounded-xl overflow-hidden flex flex-col">
      <div className="p-3 border-b border-card-border flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Meus Quadros
        </div>
        {souGestor && (
          <button
            onClick={onNovoEspaco}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-verde-primary"
            title="Novo espaço"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {espacos.length === 0 && quadrosOrfaos.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-6 px-2">
            {souGestor
              ? "Sem espaços ainda. Clique no + acima pra criar o primeiro."
              : "Você ainda não tem acesso a nenhum espaço/quadro."}
          </div>
        )}

        {espacos.map((esp) => {
          const aberto = expandidos.has(esp.id);
          const pastasDoEsp = pastasPorEspaco.get(esp.id) ?? [];
          const quadrosLivres = quadrosSoltos.get(esp.id) ?? [];
          return (
            <div key={esp.id} className="mb-1">
              <div className="flex items-center gap-1 px-1 py-1 hover:bg-gray-50 rounded group">
                <button
                  onClick={() => toggleEspaco(esp.id)}
                  className="p-0.5 text-gray-400 hover:text-gray-700"
                >
                  <ChevronRight
                    size={12}
                    className={cn("transition-transform", aberto && "rotate-90")}
                  />
                </button>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: esp.cor }}
                />
                <span className="text-xs font-medium text-gray-800 flex-1 truncate">
                  {esp.nome}
                </span>
                {souGestor && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                    <button
                      onClick={() => onNovaPasta(esp.id)}
                      className="p-0.5 text-gray-400 hover:text-verde-primary"
                      title="Nova pasta neste espaço"
                    >
                      <Folder size={11} />
                    </button>
                    <button
                      onClick={() => onNovoQuadro({ idEspaco: esp.id })}
                      className="p-0.5 text-gray-400 hover:text-verde-primary"
                      title="Novo quadro neste espaço"
                    >
                      <Layout size={11} />
                    </button>
                    {onExcluirEspaco && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir espaço "${esp.nome}" e tudo dentro?`
                            )
                          ) {
                            onExcluirEspaco(esp.id);
                          }
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-alert"
                        title="Excluir espaço"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {aberto && (
                <div className="ml-4">
                  {pastasDoEsp.map((pa) => {
                    const pastaAberta = expandidasPastas.has(pa.id);
                    const quadrosDaPasta = quadrosPorPasta.get(pa.id) ?? [];
                    return (
                      <div key={pa.id}>
                        <div className="flex items-center gap-1 px-1 py-1 hover:bg-gray-50 rounded group">
                          <button
                            onClick={() => togglePasta(pa.id)}
                            className="p-0.5 text-gray-400 hover:text-gray-700"
                          >
                            {pastaAberta ? (
                              <FolderOpen size={11} className="text-gold" />
                            ) : (
                              <Folder size={11} className="text-gold" />
                            )}
                          </button>
                          <span className="text-xs text-gray-700 flex-1 truncate">
                            {pa.nome}
                          </span>
                          {souGestor && (
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                              <button
                                onClick={() =>
                                  onNovoQuadro({ idEspaco: esp.id, idPasta: pa.id })
                                }
                                className="p-0.5 text-gray-400 hover:text-verde-primary"
                                title="Novo quadro nesta pasta"
                              >
                                <Layout size={11} />
                              </button>
                              {onExcluirPasta && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Excluir pasta "${pa.nome}"?`)) {
                                      onExcluirPasta(pa.id);
                                    }
                                  }}
                                  className="p-0.5 text-gray-400 hover:text-red-alert"
                                  title="Excluir pasta"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {pastaAberta && (
                          <div className="ml-4">
                            {quadrosDaPasta.map((q) => (
                              <QuadroItem
                                key={q.id_quadro}
                                q={q}
                                selecionado={quadroSel === q.id_quadro}
                                onSelect={() => onSelectQuadro(q.id_quadro)}
                                onExcluir={onExcluirQuadro}
                                gestor={souGestor}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {quadrosLivres.map((q) => (
                    <QuadroItem
                      key={q.id_quadro}
                      q={q}
                      selecionado={quadroSel === q.id_quadro}
                      onSelect={() => onSelectQuadro(q.id_quadro)}
                      onExcluir={onExcluirQuadro}
                      gestor={souGestor}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Quadros sem espaço nem pasta */}
        {quadrosOrfaos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-card-border">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 px-1">
              Sem espaço
            </div>
            {quadrosOrfaos.map((q) => (
              <QuadroItem
                key={q.id_quadro}
                q={q}
                selecionado={quadroSel === q.id_quadro}
                onSelect={() => onSelectQuadro(q.id_quadro)}
                onExcluir={onExcluirQuadro}
                gestor={souGestor}
              />
            ))}
          </div>
        )}
      </div>

      {souGestor && (
        <div className="p-2 border-t border-card-border">
          <button
            onClick={() => onNovoQuadro({})}
            className="w-full inline-flex items-center gap-1.5 justify-center text-xs text-verde-primary hover:text-verde-dark px-2 py-1.5 rounded hover:bg-verde-light"
          >
            <Layout size={12} /> Novo quadro
          </button>
        </div>
      )}
    </aside>
  );
}

function QuadroItem({
  q,
  selecionado,
  onSelect,
  onExcluir,
  gestor,
}: {
  q: GestaoQuadro;
  selecionado: boolean;
  onSelect: () => void;
  onExcluir?: (id: string) => void;
  gestor: boolean;
}) {
  return (
    <div className="group flex items-center gap-1">
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 flex items-center gap-1.5 text-left px-2 py-1 rounded text-xs truncate",
          selecionado
            ? "bg-verde-light text-verde-dark font-medium"
            : "text-gray-700 hover:bg-gray-50"
        )}
      >
        <Layout size={11} className={selecionado ? "text-verde-primary" : "text-gray-400"} />
        <span className="truncate">{q.nome}</span>
        {q.restrito && (
          <Lock size={9} className="text-amber-600 flex-shrink-0" />
        )}
      </button>
      {gestor && onExcluir && (
        <button
          onClick={() => {
            if (confirm(`Excluir quadro "${q.nome}"?`)) onExcluir(q.id_quadro);
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-alert"
          title="Excluir quadro"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}

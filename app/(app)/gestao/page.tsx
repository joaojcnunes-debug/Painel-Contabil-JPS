"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalIcon,
  LayoutGrid,
  LineChart,
  List,
  Loader2,
  Lock,
  Plus,
  ShieldOff,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { GestaoSidebar } from "@/components/gestao/GestaoSidebar";
import { KanbanBoard } from "@/components/gestao/KanbanBoard";
import { VistaLista } from "@/components/gestao/VistaLista";
import { VistaCalendario } from "@/components/gestao/VistaCalendario";
import { VistaTimeline } from "@/components/gestao/VistaTimeline";
import { PainelGestao } from "@/components/gestao/PainelGestao";
import { FiltrosPanel } from "@/components/gestao/FiltrosPanel";
import { TarefaModal } from "@/components/gestao/TarefaModal";
import { NovoRecursoModal } from "@/components/gestao/NovoRecursoModal";
import {
  useEspacos,
  usePastas,
  useQuadros,
  useStatusQuadro,
  useTarefas,
  useMeuPapelGestao,
  useSalvarEspaco,
  useSalvarPasta,
  useSalvarQuadro,
  useExcluirEspaco,
  useExcluirPasta,
  useExcluirQuadro,
  useMoverTarefa,
  usePreferenciaVisao,
  useSalvarPreferenciaVisao,
  useFiltrosSalvos,
  useSalvarFiltro,
  useExcluirFiltro,
} from "@/lib/gestao/hooks";
import {
  filtrarTarefas,
  VISTAS,
  VISTAS_LABEL,
  type AgruparPor,
  type FiltrosGestao,
  type GestaoTarefa,
  type VistaGestao,
} from "@/lib/gestao/types";
import { useUserStore } from "@/lib/store";

const ICONES_VISTA: Record<VistaGestao, React.ElementType> = {
  quadro: LayoutGrid,
  lista: List,
  calendario: CalIcon,
  timeline: LineChart,
  painel: BarChart3,
};

export default function GestaoPage() {
  const user = useUserStore((s) => s.user);
  const email = user?.email ?? null;
  const { data: papel, isLoading: papelLoading } = useMeuPapelGestao();
  const naoMembro = !papelLoading && !papel;
  const souGestor = papel === "owner" || papel === "admin";

  const { data: espacos = [] } = useEspacos();
  const { data: pastas = [] } = usePastas();
  const { data: quadros = [] } = useQuadros();

  const [quadroSel, setQuadroSel] = useState<string | null>(null);

  useEffect(() => {
    if (!quadroSel && quadros.length > 0) {
      setQuadroSel(quadros[0].id_quadro);
    }
    if (quadroSel && !quadros.find((q) => q.id_quadro === quadroSel)) {
      setQuadroSel(quadros[0]?.id_quadro ?? null);
    }
  }, [quadros, quadroSel]);

  const { data: status = [], isLoading: statusLoading } = useStatusQuadro(quadroSel);
  const { data: tarefas = [], isLoading: tarefasLoading } = useTarefas(quadroSel);

  const { data: pref } = usePreferenciaVisao(quadroSel, email);
  const salvarPref = useSalvarPreferenciaVisao();

  const [vista, setVista] = useState<VistaGestao>("quadro");
  const [agruparPor, setAgruparPor] = useState<AgruparPor>("status");
  const [filtros, setFiltros] = useState<FiltrosGestao>({});

  // Sincroniza com preferência persistida
  useEffect(() => {
    if (pref) {
      setVista(pref.vista);
      if (pref.agrupar_por) setAgruparPor(pref.agrupar_por);
    }
  }, [pref, quadroSel]);

  const { data: filtrosSalvos = [] } = useFiltrosSalvos(quadroSel, email);
  const salvarFiltro = useSalvarFiltro();
  const excluirFiltro = useExcluirFiltro();

  const salvarEspaco = useSalvarEspaco();
  const salvarPasta = useSalvarPasta();
  const salvarQuadro = useSalvarQuadro();
  const excluirEspaco = useExcluirEspaco();
  const excluirPasta = useExcluirPasta();
  const excluirQuadro = useExcluirQuadro();
  const moverTarefa = useMoverTarefa();

  const [tarefaModal, setTarefaModal] = useState<{
    aberta: boolean;
    tarefa: GestaoTarefa | null;
    statusInicial?: string;
  }>({ aberta: false, tarefa: null });

  const [novoRecurso, setNovoRecurso] = useState<
    | null
    | { tipo: "espaco" | "pasta" | "quadro"; idEspaco?: string; idPasta?: string }
  >(null);

  const quadroAtual = useMemo(
    () => quadros.find((q) => q.id_quadro === quadroSel) ?? null,
    [quadros, quadroSel]
  );

  const tarefasFiltradas = useMemo(
    () => filtrarTarefas(tarefas, filtros),
    [tarefas, filtros]
  );

  function persistirVista(v: VistaGestao) {
    setVista(v);
    if (email && quadroSel) {
      salvarPref.mutate({
        id_quadro: quadroSel,
        usuario_email: email,
        vista: v,
        agrupar_por: agruparPor,
      });
    }
  }
  function persistirAgrupamento(a: AgruparPor) {
    setAgruparPor(a);
    if (email && quadroSel) {
      salvarPref.mutate({
        id_quadro: quadroSel,
        usuario_email: email,
        vista,
        agrupar_por: a,
      });
    }
  }

  if (papelLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando módulo Gestão…
      </div>
    );
  }

  if (naoMembro) {
    return (
      <div>
        <PageHeader title="Gestão" subtitle="Módulo interno de tarefas do escritório" />
        <div className="bg-white border border-card-border rounded-xl p-8 text-center">
          <ShieldOff size={32} className="mx-auto text-gray-300 mb-3" />
          <div className="font-medium text-gray-800 mb-1">Sem acesso ao módulo</div>
          <div className="text-sm text-gray-500 max-w-md mx-auto">
            Peça pra um Admin ou owner do módulo Gestão te adicionar como
            membro. Admins do sistema já entram automaticamente.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Gestão"
        subtitle="Espaços → Pastas → Quadros → Tarefas · Kanban do escritório"
        actions={
          souGestor && (
            <Button
              onClick={() => setNovoRecurso({ tipo: "quadro" })}
              className="flex items-center gap-1.5"
            >
              <Plus size={14} /> Novo quadro
            </Button>
          )
        }
      />

      <div className="flex gap-4 items-start">
        <GestaoSidebar
          espacos={espacos}
          pastas={pastas}
          quadros={quadros}
          quadroSel={quadroSel}
          souGestor={souGestor}
          onSelectQuadro={setQuadroSel}
          onNovoEspaco={() => setNovoRecurso({ tipo: "espaco" })}
          onNovaPasta={(idEspaco) => setNovoRecurso({ tipo: "pasta", idEspaco })}
          onNovoQuadro={(dados) =>
            setNovoRecurso({
              tipo: "quadro",
              idEspaco: dados.idEspaco,
              idPasta: dados.idPasta,
            })
          }
          onExcluirEspaco={(id) => excluirEspaco.mutate(id)}
          onExcluirPasta={(id) => excluirPasta.mutate(id)}
          onExcluirQuadro={(id) => excluirQuadro.mutate(id)}
        />

        <div className="flex-1 min-w-0">
          {!quadroSel && (
            <div className="bg-white border border-card-border rounded-xl p-10 text-center text-sm text-gray-500">
              Selecione ou crie um quadro no menu esquerdo pra começar.
            </div>
          )}

          {quadroSel && quadroAtual && (
            <>
              {/* Header do quadro */}
              <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="font-serif text-xl text-verde-dark flex items-center gap-2">
                    {quadroAtual.nome}
                    {quadroAtual.restrito && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium"
                        title="Quadro restrito"
                      >
                        <Lock size={9} /> Restrito
                      </span>
                    )}
                  </h2>
                  {quadroAtual.descricao && (
                    <p className="text-xs text-gray-500 mt-1">{quadroAtual.descricao}</p>
                  )}
                </div>
                <div className="text-[11px] text-gray-500">
                  {tarefas.length} tarefa(s) · {status.length} status
                </div>
              </div>

              {/* Toolbar: vistas + agrupar + filtros */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-1 border-b border-card-border">
                  {VISTAS.map((v) => {
                    const Icon = ICONES_VISTA[v];
                    return (
                      <button
                        key={v}
                        onClick={() => persistirVista(v)}
                        className={cn(
                          "px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px",
                          vista === v
                            ? "border-verde-primary text-verde-dark"
                            : "border-transparent text-gray-500 hover:text-gray-800"
                        )}
                      >
                        <Icon size={13} />
                        {VISTAS_LABEL[v]}
                      </button>
                    );
                  })}
                  {vista === "lista" && (
                    <div className="ml-auto flex items-center gap-2 pb-1">
                      <span className="text-[10px] uppercase text-gray-500">
                        Agrupar por:
                      </span>
                      <select
                        className="text-xs bg-transparent border-none focus:outline-none text-verde-primary"
                        value={agruparPor}
                        onChange={(e) =>
                          persistirAgrupamento(e.target.value as AgruparPor)
                        }
                      >
                        <option value="status">Status</option>
                        <option value="responsavel">Responsável</option>
                        <option value="prioridade">Prioridade</option>
                        <option value="etiqueta">Etiqueta</option>
                      </select>
                    </div>
                  )}
                </div>

                <FiltrosPanel
                  status={status}
                  filtros={filtros}
                  onChange={setFiltros}
                  filtrosSalvos={filtrosSalvos}
                  onSalvar={(nome) => {
                    if (!email || !quadroSel) return;
                    salvarFiltro.mutate({
                      id_quadro: quadroSel,
                      usuario_email: email,
                      nome,
                      criterios: filtros,
                    });
                  }}
                  onExcluir={(id) => {
                    if (!email || !quadroSel) return;
                    excluirFiltro.mutate({
                      id,
                      id_quadro: quadroSel,
                      usuario_email: email,
                    });
                  }}
                  onCarregar={(f) => setFiltros(f)}
                />
              </div>

              {/* Conteúdo por vista */}
              {vista === "quadro" && (
                <KanbanBoard
                  status={status}
                  tarefas={tarefasFiltradas}
                  loading={statusLoading || tarefasLoading}
                  onMover={(input) => moverTarefa.mutate(input)}
                  onAbrirTarefa={(t) => setTarefaModal({ aberta: true, tarefa: t })}
                  onNovaTarefa={(slug) =>
                    setTarefaModal({ aberta: true, tarefa: null, statusInicial: slug })
                  }
                />
              )}
              {vista === "lista" && (
                <VistaLista
                  status={status}
                  tarefas={tarefasFiltradas}
                  agruparPor={agruparPor}
                  onAbrirTarefa={(t) => setTarefaModal({ aberta: true, tarefa: t })}
                />
              )}
              {vista === "calendario" && (
                <VistaCalendario
                  tarefas={tarefasFiltradas}
                  onAbrirTarefa={(t) => setTarefaModal({ aberta: true, tarefa: t })}
                />
              )}
              {vista === "timeline" && (
                <VistaTimeline
                  tarefas={tarefasFiltradas}
                  onAbrirTarefa={(t) => setTarefaModal({ aberta: true, tarefa: t })}
                />
              )}
              {vista === "painel" && (
                <PainelGestao status={status} tarefas={tarefasFiltradas} />
              )}

              {tarefaModal.aberta && (
                <TarefaModal
                  open={tarefaModal.aberta}
                  onClose={() =>
                    setTarefaModal({ aberta: false, tarefa: null })
                  }
                  idQuadro={quadroSel}
                  status={status}
                  tarefa={tarefaModal.tarefa}
                  statusInicial={tarefaModal.statusInicial}
                />
              )}
            </>
          )}
        </div>
      </div>

      {novoRecurso && (
        <NovoRecursoModal
          tipo={novoRecurso.tipo}
          idEspaco={novoRecurso.idEspaco}
          idPasta={novoRecurso.idPasta}
          espacos={espacos}
          pastas={pastas}
          onClose={() => setNovoRecurso(null)}
          onSubmit={(dados) => {
            if (novoRecurso.tipo === "espaco") {
              salvarEspaco.mutate(
                { nome: dados.nome, cor: dados.cor },
                { onSuccess: () => setNovoRecurso(null) }
              );
            } else if (novoRecurso.tipo === "pasta") {
              if (!dados.idEspaco) return;
              salvarPasta.mutate(
                { nome: dados.nome, id_espaco: dados.idEspaco },
                { onSuccess: () => setNovoRecurso(null) }
              );
            } else {
              salvarQuadro.mutate(
                {
                  nome: dados.nome,
                  descricao: dados.descricao,
                  id_espaco: dados.idEspaco ?? null,
                  id_pasta: dados.idPasta ?? null,
                  restrito: dados.restrito,
                },
                { onSuccess: () => setNovoRecurso(null) }
              );
            }
          }}
        />
      )}
    </div>
  );
}

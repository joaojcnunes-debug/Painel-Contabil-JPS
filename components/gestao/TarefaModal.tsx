"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Clock,
  Download,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  Settings2,
  Tag,
  Trash2,
  Upload,
  User as UserIcon,
  Info,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { cn, formatDate } from "@/lib/utils";
import { PRIORIDADES } from "@/lib/gestao/types";
import {
  useSalvarTarefa,
  useExcluirTarefa,
  useCamposQuadro,
  useEtiquetasQuadro,
  useComentarios,
  useAddComentario,
  useExcluirComentario,
  useAnexos,
  useUploadAnexo,
  useExcluirAnexo,
  urlAssinadaAnexo,
} from "@/lib/gestao/hooks";
import type {
  GestaoStatus,
  GestaoTarefa,
  PrioridadeTarefa,
  GestaoComentario,
  GestaoAnexo,
} from "@/lib/gestao/types";
import { formatarBytes, iniciais, corAvatar } from "@/lib/gestao/types";
import { CampoInput } from "./CampoInput";
import { TempoTracker } from "./TempoTracker";
import { DependenciasSection } from "./DependenciasSection";
import { useUserStore } from "@/lib/store";
import { useDependencias, checaPodeConcluir } from "@/lib/gestao/hooks";

type Aba = "detalhes" | "campos" | "tempo" | "deps" | "comentarios" | "anexos";

type Props = {
  open: boolean;
  onClose: () => void;
  idQuadro: string;
  status: GestaoStatus[];
  tarefa?: GestaoTarefa | null;
  statusInicial?: string;
};

export function TarefaModal({
  open,
  onClose,
  idQuadro,
  status,
  tarefa,
  statusInicial,
}: Props) {
  const user = useUserStore((s) => s.user);
  const salvar = useSalvarTarefa();
  const excluir = useExcluirTarefa();

  const { data: campos = [] } = useCamposQuadro(idQuadro);
  const { data: etiquetasCatalogo = [] } = useEtiquetasQuadro(idQuadro);
  const { data: comentarios = [] } = useComentarios(tarefa?.id_tarefa ?? null);
  const { data: anexos = [] } = useAnexos(tarefa?.id_tarefa ?? null);
  const { data: dependencias = [] } = useDependencias(tarefa?.id_tarefa ?? null);

  const [aba, setAba] = useState<Aba>("detalhes");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [statusSel, setStatusSel] = useState<string>("A_FAZER");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>("Media");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [camposValores, setCamposValores] = useState<Record<string, unknown>>({});

  const isEdit = !!tarefa;

  useEffect(() => {
    if (!open) return;
    setAba("detalhes");
    setTitulo(tarefa?.titulo ?? "");
    setDescricao(tarefa?.descricao ?? "");
    setStatusSel(tarefa?.status ?? statusInicial ?? status[0]?.slug ?? "A_FAZER");
    setPrioridade(tarefa?.prioridade ?? "Media");
    setResponsavel(tarefa?.responsavel ?? "");
    setPrazo(tarefa?.prazo ?? "");
    setEtiquetas(tarefa?.etiquetas ?? []);
    setCamposValores((tarefa?.campos as Record<string, unknown>) ?? {});
  }, [open, tarefa, statusInicial, status]);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titulo.trim()) return;

    // Bloqueia mudar pra status "concluido" se houver dependência aberta
    const virarConcluido = status.find((s) => s.slug === statusSel)?.tipo === "concluido";
    const jaEraConcluido = tarefa
      ? status.find((s) => s.slug === tarefa.status)?.tipo === "concluido"
      : false;
    if (virarConcluido && !jaEraConcluido && tarefa?.id_tarefa) {
      const pode = await checaPodeConcluir(tarefa.id_tarefa);
      if (!pode) {
        setAba("deps");
        // toast direto pra ficar óbvio o motivo do bloqueio
        const { default: toast } = await import("react-hot-toast");
        toast.error(
          "Não é possível concluir — há dependências abertas nesta tarefa"
        );
        return;
      }
    }

    salvar.mutate(
      {
        id_tarefa: tarefa?.id_tarefa,
        id_quadro: idQuadro,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        status: statusSel,
        prioridade,
        responsavel: responsavel.trim() || null,
        prazo: prazo || null,
        etiquetas,
        campos: camposValores,
      },
      { onSuccess: () => onClose() }
    );
  }

  function onDelete() {
    if (!tarefa) return;
    if (!confirm(`Excluir "${tarefa.titulo}"?`)) return;
    excluir.mutate(
      { id_tarefa: tarefa.id_tarefa, id_quadro: idQuadro },
      { onSuccess: () => onClose() }
    );
  }

  const abaLabel: Record<Aba, string> = {
    detalhes: isEdit ? "Detalhes" : "Nova tarefa",
    campos: `Campos${campos.length > 0 ? ` (${campos.length})` : ""}`,
    tempo: "Tempo",
    deps: `Depend.${dependencias.length > 0 ? ` (${dependencias.length})` : ""}`,
    comentarios: `Comentários${comentarios.length > 0 ? ` (${comentarios.length})` : ""}`,
    anexos: `Anexos${anexos.length > 0 ? ` (${anexos.length})` : ""}`,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar tarefa" : "Nova tarefa"}
      size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          {isEdit ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={excluir.isPending}
              className="text-xs text-red-alert hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={12} /> Excluir
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={salvar.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => onSubmit()} disabled={salvar.isPending || !titulo.trim()}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-card-border -mx-6 px-6 mb-4">
        <TabBtn ativa={aba === "detalhes"} onClick={() => setAba("detalhes")} icon={Info}>
          {abaLabel.detalhes}
        </TabBtn>
        <TabBtn
          ativa={aba === "campos"}
          onClick={() => setAba("campos")}
          icon={Settings2}
          disabled={campos.length === 0 && !isEdit}
        >
          {abaLabel.campos}
        </TabBtn>
        <TabBtn
          ativa={aba === "tempo"}
          onClick={() => setAba("tempo")}
          icon={Clock}
          disabled={!isEdit}
        >
          {abaLabel.tempo}
        </TabBtn>
        <TabBtn
          ativa={aba === "deps"}
          onClick={() => setAba("deps")}
          icon={Link2}
          disabled={!isEdit}
        >
          {abaLabel.deps}
        </TabBtn>
        <TabBtn
          ativa={aba === "comentarios"}
          onClick={() => setAba("comentarios")}
          icon={MessageSquare}
          disabled={!isEdit}
        >
          {abaLabel.comentarios}
        </TabBtn>
        <TabBtn
          ativa={aba === "anexos"}
          onClick={() => setAba("anexos")}
          icon={Paperclip}
          disabled={!isEdit}
        >
          {abaLabel.anexos}
        </TabBtn>
      </div>

      {aba === "detalhes" && (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Título" required>
            <input
              className={inputClass}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Descrição" hint="Aceita menções @email nos comentários">
            <textarea
              className={`${inputClass} min-h-[100px] font-mono text-[13px]`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição da tarefa. Suporta quebras de linha simples."
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status">
              <select
                className={inputClass}
                value={statusSel}
                onChange={(e) => setStatusSel(e.target.value)}
              >
                {status.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridade">
              <select
                className={inputClass}
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Responsável (email)">
              <input
                type="email"
                className={inputClass}
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="colaborador@jsp.com.br"
              />
            </Field>
            <Field label="Prazo">
              <input
                type="date"
                className={inputClass}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Etiquetas"
            hint={
              etiquetasCatalogo.length > 0
                ? "Selecione do catálogo do quadro"
                : "Nenhuma etiqueta no catálogo — digite abaixo (separadas por vírgula)"
            }
          >
            {etiquetasCatalogo.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {etiquetasCatalogo.map((et) => {
                  const ativa = etiquetas.includes(et.nome);
                  return (
                    <button
                      key={et.id}
                      type="button"
                      onClick={() =>
                        setEtiquetas(
                          ativa
                            ? etiquetas.filter((n) => n !== et.nome)
                            : [...etiquetas, et.nome]
                        )
                      }
                      className="text-xs px-2 py-0.5 rounded border transition-all"
                      style={{
                        background: ativa ? et.cor : "transparent",
                        borderColor: et.cor,
                        color: ativa ? "#fff" : et.cor,
                      }}
                    >
                      {et.nome}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                className={inputClass}
                value={etiquetas.join(", ")}
                onChange={(e) =>
                  setEtiquetas(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
              />
            )}
          </Field>
        </form>
      )}

      {aba === "campos" && (
        <div className="space-y-3">
          {campos.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              <Tag size={24} className="mx-auto text-gray-300 mb-2" />
              Nenhum campo personalizado neste quadro.
              <div className="text-xs mt-2">
                Configure em <em>Configurações do quadro</em> (em breve na Fase 4).
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {campos.map((c) => (
                <Field key={c.id} label={c.nome}>
                  <CampoInput
                    campo={c}
                    valor={camposValores[c.nome]}
                    onChange={(v) =>
                      setCamposValores((prev) => ({ ...prev, [c.nome]: v }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "tempo" && tarefa && (
        <TempoTracker idTarefa={tarefa.id_tarefa} usuarioEmail={user?.email ?? null} />
      )}

      {aba === "deps" && tarefa && (
        <DependenciasSection
          idTarefa={tarefa.id_tarefa}
          idQuadro={idQuadro}
          status={status}
        />
      )}

      {aba === "comentarios" && tarefa && (
        <ListaComentarios
          idTarefa={tarefa.id_tarefa}
          comentarios={comentarios}
          usuarioAtual={user?.email ?? null}
        />
      )}

      {aba === "anexos" && tarefa && (
        <ListaAnexos
          idTarefa={tarefa.id_tarefa}
          anexos={anexos}
          usuarioAtual={user?.email ?? null}
        />
      )}
    </Modal>
  );
}

function TabBtn({
  ativa,
  onClick,
  icon: Icon,
  disabled,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  icon: React.ElementType;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px",
        ativa
          ? "border-verde-primary text-verde-dark"
          : "border-transparent text-gray-500 hover:text-gray-800",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

function ListaComentarios({
  idTarefa,
  comentarios,
  usuarioAtual,
}: {
  idTarefa: string;
  comentarios: GestaoComentario[];
  usuarioAtual: string | null;
}) {
  const [texto, setTexto] = useState("");
  const addC = useAddComentario();
  const delC = useExcluirComentario();

  function enviar() {
    if (!texto.trim() || !usuarioAtual) return;
    addC.mutate(
      { id_tarefa: idTarefa, autor: usuarioAtual, texto: texto.trim() },
      { onSuccess: () => setTexto("") }
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
        {comentarios.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 italic">
            Sem comentários ainda. Marque alguém com @email pra notificar.
          </div>
        ) : (
          comentarios.map((c) => (
            <div key={c.id_comentario} className="flex gap-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: corAvatar(c.autor) }}
                title={c.autor}
              >
                {iniciais(c.autor)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-gray-800">{c.autor}</span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(c.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">
                  {c.texto}
                </div>
              </div>
              {usuarioAtual &&
                c.autor.toLowerCase() === usuarioAtual.toLowerCase() && (
                  <button
                    onClick={() =>
                      delC.mutate({
                        id_comentario: c.id_comentario,
                        id_tarefa: idTarefa,
                      })
                    }
                    className="p-1 text-gray-400 hover:text-red-alert opacity-0 group-hover:opacity-100"
                    title="Excluir comentário"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-card-border pt-3">
        <textarea
          className={`${inputClass} min-h-[70px]`}
          placeholder="Escreva um comentário… use @email pra mencionar alguém"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={enviar}
            disabled={!texto.trim() || !usuarioAtual || addC.isPending}
          >
            {addC.isPending ? "Enviando…" : "Comentar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ListaAnexos({
  idTarefa,
  anexos,
  usuarioAtual,
}: {
  idTarefa: string;
  anexos: GestaoAnexo[];
  usuarioAtual: string | null;
}) {
  const up = useUploadAnexo();
  const del = useExcluirAnexo();
  const [dragging, setDragging] = useState(false);

  async function baixar(a: GestaoAnexo) {
    try {
      const url = await urlAssinadaAnexo(a.storage_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      console.error(e);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      await up.mutateAsync({
        id_tarefa: idTarefa,
        file: f,
        autor: usuarioAtual,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragging
            ? "border-verde-primary bg-verde-light/30"
            : "border-card-border bg-gray-50"
        )}
      >
        <Upload size={22} className="mx-auto text-gray-400 mb-2" />
        <div className="text-sm text-gray-700">
          Arraste arquivos aqui ou{" "}
          <label className="text-verde-primary underline cursor-pointer">
            clique pra selecionar
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </div>
        <div className="text-[11px] text-gray-500 mt-1">Máx 25MB por arquivo</div>
        {up.isPending && (
          <div className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Enviando…
          </div>
        )}
      </div>

      {anexos.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-2 italic">
          Nenhum anexo ainda.
        </div>
      ) : (
        <div className="space-y-1.5">
          {anexos.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 border border-card-border rounded p-2 hover:bg-gray-50 group"
            >
              <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">{a.nome}</div>
                <div className="text-[10px] text-gray-500">
                  {formatarBytes(a.tamanho_bytes)}
                  {a.created_by && ` · ${a.created_by}`}
                  {` · ${formatDate(a.created_at.slice(0, 10))}`}
                </div>
              </div>
              <button
                onClick={() => baixar(a)}
                className="p-1 text-gray-500 hover:text-verde-primary"
                title="Baixar"
              >
                <Download size={12} />
              </button>
              {usuarioAtual &&
                (a.created_by?.toLowerCase() === usuarioAtual.toLowerCase()) && (
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${a.nome}"?`)) {
                        del.mutate({
                          id: a.id,
                          id_tarefa: idTarefa,
                          storage_path: a.storage_path,
                        });
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-alert opacity-0 group-hover:opacity-100"
                    title="Excluir anexo"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import toast from "react-hot-toast";
import {
  useFormulariosQuadro,
  useSalvarFormulario,
  useExcluirFormulario,
} from "@/lib/gestao/hooks";
import { novoToken, type GestaoFormulario } from "@/lib/gestao/types";

type Props = {
  open: boolean;
  onClose: () => void;
  idQuadro: string;
};

export function FormulariosManagerModal({ open, onClose, idQuadro }: Props) {
  const { data: forms = [] } = useFormulariosQuadro(idQuadro);
  const salvar = useSalvarFormulario();
  const excluir = useExcluirFormulario();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<GestaoFormulario | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Formulários públicos"
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900">
          Cada formulário tem uma URL pública <code>/f/{"{token}"}</code>{" "}
          que qualquer pessoa (sem login) pode acessar pra abrir uma tarefa
          neste quadro. Útil pra receber demandas de clientes, colaboradores
          externos ou fornecedores.
        </div>

        {forms.length === 0 && !criando && (
          <div className="text-center py-6 text-sm text-gray-500">
            Nenhum formulário criado ainda.
          </div>
        )}

        {!criando &&
          !editando &&
          forms.map((f) => (
            <FormularioLinha
              key={f.id}
              f={f}
              onEditar={() => setEditando(f)}
              onExcluir={() => {
                if (confirm(`Excluir formulário "${f.titulo}"?`))
                  excluir.mutate({ id: f.id, id_quadro: idQuadro });
              }}
              onToggle={() =>
                salvar.mutate({ ...f, ativo: !f.ativo })
              }
            />
          ))}

        {(criando || editando) && (
          <EditorFormulario
            atual={editando}
            idQuadro={idQuadro}
            onCancel={() => {
              setCriando(false);
              setEditando(null);
            }}
            onSalvo={() => {
              setCriando(false);
              setEditando(null);
            }}
          />
        )}

        {!criando && !editando && (
          <button
            onClick={() => setCriando(true)}
            className="w-full text-xs text-verde-primary hover:text-verde-dark py-2 border border-dashed border-verde-primary/40 rounded-lg inline-flex items-center justify-center gap-1"
          >
            <Plus size={12} /> Novo formulário
          </button>
        )}
      </div>
    </Modal>
  );
}

function FormularioLinha({
  f,
  onEditar,
  onExcluir,
  onToggle,
}: {
  f: GestaoFormulario;
  onEditar: () => void;
  onExcluir: () => void;
  onToggle: () => void;
}) {
  const url = useMemo(() => {
    if (typeof window === "undefined") return `/f/${f.token}`;
    return `${window.location.origin}/f/${f.token}`;
  }, [f.token]);

  return (
    <div className="border border-card-border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className="text-verde-primary" title={f.ativo ? "Desativar" : "Ativar"}>
          {f.ativo ? <Eye size={14} /> : <EyeOff size={14} className="text-gray-400" />}
        </button>
        <button onClick={onEditar} className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">{f.titulo}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {f.perguntas?.length ?? 0} pergunta(s) · {f.etiquetas_padrao?.length ?? 0} etiqueta(s) padrão
          </div>
        </button>
        <button
          onClick={onExcluir}
          className="p-1 text-gray-400 hover:text-red-alert"
          title="Excluir"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
        <code className="text-[10px] font-mono text-gray-700 flex-1 truncate">
          {url}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("URL copiada");
          }}
          className="p-1 text-gray-500 hover:text-verde-primary"
          title="Copiar"
        >
          <Copy size={11} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="p-1 text-gray-500 hover:text-verde-primary"
          title="Abrir em nova aba"
        >
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

function EditorFormulario({
  atual,
  idQuadro,
  onCancel,
  onSalvo,
}: {
  atual: GestaoFormulario | null;
  idQuadro: string;
  onCancel: () => void;
  onSalvo: () => void;
}) {
  const salvar = useSalvarFormulario();
  const [titulo, setTitulo] = useState(atual?.titulo ?? "");
  const [descricao, setDescricao] = useState(atual?.descricao ?? "");
  const [mostraDescricao, setMostraDescricao] = useState(atual?.mostra_descricao ?? true);
  const [mostraPrazo, setMostraPrazo] = useState(atual?.mostra_prazo ?? false);
  const [mostraPrio, setMostraPrio] = useState(atual?.mostra_prioridade ?? false);
  const [etiquetas, setEtiquetas] = useState((atual?.etiquetas_padrao ?? []).join(", "));

  function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titulo.trim()) return;
    const etiquetasArr = etiquetas
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    salvar.mutate(
      {
        id: atual?.id,
        id_quadro: idQuadro,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        token: atual?.token ?? novoToken(),
        mostra_descricao: mostraDescricao,
        mostra_prazo: mostraPrazo,
        mostra_prioridade: mostraPrio,
        etiquetas_padrao: etiquetasArr,
      },
      { onSuccess: () => onSalvo() }
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-verde-primary/30 rounded-lg p-3 space-y-3 bg-verde-light/20"
    >
      <div className="text-xs font-semibold text-verde-dark uppercase tracking-wide">
        {atual ? "Editar formulário" : "Novo formulário"}
      </div>

      <Field label="Título público" required>
        <input
          className={inputClass}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex: Solicitar novo lançamento"
          autoFocus
        />
      </Field>

      <Field label="Descrição">
        <textarea
          className={`${inputClass} min-h-[60px]`}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Instrução mostrada no topo da página pública"
        />
      </Field>

      <div className="text-[10px] uppercase text-gray-500 tracking-wide">
        Campos visíveis no formulário público
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="text-xs flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={mostraDescricao}
            onChange={(e) => setMostraDescricao(e.target.checked)}
          />
          Descrição
        </label>
        <label className="text-xs flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={mostraPrazo}
            onChange={(e) => setMostraPrazo(e.target.checked)}
          />
          Prazo
        </label>
        <label className="text-xs flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={mostraPrio}
            onChange={(e) => setMostraPrio(e.target.checked)}
          />
          Prioridade
        </label>
      </div>

      <Field label="Etiquetas padrão" hint="Aplicadas automaticamente. Separe por vírgula.">
        <input
          className={inputClass}
          value={etiquetas}
          onChange={(e) => setEtiquetas(e.target.value)}
          placeholder="cliente, formulário-web"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} type="button">
          Cancelar
        </Button>
        <Button type="submit" disabled={!titulo.trim() || salvar.isPending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

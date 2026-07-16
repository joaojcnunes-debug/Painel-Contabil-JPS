"use client";

import { useState, type FormEvent } from "react";
import {
  Bell,
  ChevronsRight,
  Plus,
  Power,
  Trash2,
  Zap,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import {
  useAutomacoes,
  useSalvarAutomacao,
  useExcluirAutomacao,
  useStatusQuadro,
} from "@/lib/gestao/hooks";
import {
  ACOES_LABEL,
  GATILHOS_LABEL,
  PRIORIDADES,
  type AcaoAutomacaoTipo,
  type GatilhoAutomacao,
  type GestaoAutomacao,
  type PrioridadeTarefa,
} from "@/lib/gestao/types";

type Props = {
  open: boolean;
  onClose: () => void;
  idQuadro: string;
};

export function AutomacoesManagerModal({ open, onClose, idQuadro }: Props) {
  const { data: automacoes = [] } = useAutomacoes(idQuadro);
  const { data: status = [] } = useStatusQuadro(idQuadro);
  const salvar = useSalvarAutomacao();
  const excluir = useExcluirAutomacao();

  const [editando, setEditando] = useState<GestaoAutomacao | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Automações do quadro"
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
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900 flex items-start gap-2">
          <Zap size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Regras &quot;Quando X acontece → Então Y é feito&quot;. Aplicadas
            automaticamente pelo banco (triggers). Gatilhos temporais rodam
            todo dia às 3h05 da manhã (Brasília).
          </div>
        </div>

        {automacoes.length === 0 && !criando && (
          <div className="text-center py-6 text-sm text-gray-500">
            Nenhuma automação configurada.
          </div>
        )}

        {!criando &&
          automacoes.map((a) => (
            <AutomacaoLinha
              key={a.id}
              a={a}
              onEditar={() => setEditando(a)}
              onExcluir={() =>
                confirm(`Excluir "${a.nome}"?`) &&
                excluir.mutate({ id: a.id, id_quadro: idQuadro })
              }
              onToggle={() =>
                salvar.mutate({ ...a, ativo: !a.ativo })
              }
            />
          ))}

        {(criando || editando) && (
          <EditorAutomacao
            atual={editando}
            idQuadro={idQuadro}
            status={status}
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
            <Plus size={12} /> Nova automação
          </button>
        )}
      </div>
    </Modal>
  );
}

function AutomacaoLinha({
  a,
  onEditar,
  onExcluir,
  onToggle,
}: {
  a: GestaoAutomacao;
  onEditar: () => void;
  onExcluir: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "border rounded-lg p-3 flex items-center gap-3",
        a.ativo ? "bg-white border-card-border" : "bg-gray-50 border-gray-200 opacity-60"
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "p-1.5 rounded",
          a.ativo ? "text-verde-primary" : "text-gray-400 hover:text-gray-700"
        )}
        title={a.ativo ? "Desativar" : "Ativar"}
      >
        <Power size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onEditar} className="text-left w-full">
          <div className="text-sm font-medium text-gray-800 truncate">{a.nome}</div>
          <div className="text-[11px] text-gray-500 truncate flex items-center gap-1">
            {GATILHOS_LABEL[a.gatilho]}
            <ChevronsRight size={10} />
            {ACOES_LABEL[a.acao.tipo]}
            {a.acao.valor != null && ` (${String(a.acao.valor).slice(0, 30)})`}
          </div>
        </button>
      </div>
      <button
        onClick={onExcluir}
        className="p-1 text-gray-400 hover:text-red-alert"
        title="Excluir"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function EditorAutomacao({
  atual,
  idQuadro,
  status,
  onCancel,
  onSalvo,
}: {
  atual: GestaoAutomacao | null;
  idQuadro: string;
  status: Array<{ slug: string; nome: string }>;
  onCancel: () => void;
  onSalvo: () => void;
}) {
  const salvar = useSalvarAutomacao();
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [gatilho, setGatilho] = useState<GatilhoAutomacao>(
    atual?.gatilho ?? "status_muda"
  );
  const [diasAntes, setDiasAntes] = useState<number>(
    Number(atual?.condicao?.dias_antes ?? 3)
  );
  const [statusDe, setStatusDe] = useState<string>(
    String(atual?.condicao?.de ?? "")
  );
  const [statusPara, setStatusPara] = useState<string>(
    String(atual?.condicao?.para ?? "")
  );
  const [acaoTipo, setAcaoTipo] = useState<AcaoAutomacaoTipo>(
    atual?.acao.tipo ?? "notificar"
  );
  const [acaoValor, setAcaoValor] = useState<string>(
    typeof atual?.acao.valor === "string" ? atual.acao.valor : ""
  );
  const [acaoPara, setAcaoPara] = useState<string>(atual?.acao.para ?? "");
  const [acaoMsg, setAcaoMsg] = useState<string>(atual?.acao.mensagem ?? "");
  const [ativo, setAtivo] = useState(atual?.ativo ?? true);

  function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!nome.trim()) return;
    const condicao: Record<string, unknown> = {};
    if (gatilho === "status_muda") {
      if (statusDe) condicao.de = statusDe;
      if (statusPara) condicao.para = statusPara;
    } else if (gatilho === "prazo_proximo") {
      condicao.dias_antes = diasAntes;
    }
    const acao: GestaoAutomacao["acao"] = { tipo: acaoTipo };
    if (["mover_status", "definir_responsavel", "definir_prioridade"].includes(acaoTipo)) {
      acao.valor = acaoValor;
    }
    if (acaoTipo === "notificar") {
      if (acaoPara) acao.para = acaoPara;
      if (acaoMsg) acao.mensagem = acaoMsg;
    }
    salvar.mutate(
      {
        id: atual?.id,
        id_quadro: idQuadro,
        nome: nome.trim(),
        ativo,
        gatilho,
        condicao,
        acao,
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
        {atual ? "Editar automação" : "Nova automação"}
      </div>

      <Field label="Nome" required>
        <input
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Notificar quando urgente entrar em revisão"
          autoFocus
        />
      </Field>

      <Field label="Gatilho">
        <select
          className={inputClass}
          value={gatilho}
          onChange={(e) => setGatilho(e.target.value as GatilhoAutomacao)}
        >
          {(Object.keys(GATILHOS_LABEL) as GatilhoAutomacao[]).map((g) => (
            <option key={g} value={g}>
              {GATILHOS_LABEL[g]}
            </option>
          ))}
        </select>
      </Field>

      {gatilho === "status_muda" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="De (opcional)">
            <select
              className={inputClass}
              value={statusDe}
              onChange={(e) => setStatusDe(e.target.value)}
            >
              <option value="">— qualquer —</option>
              {status.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Para (opcional)">
            <select
              className={inputClass}
              value={statusPara}
              onChange={(e) => setStatusPara(e.target.value)}
            >
              <option value="">— qualquer —</option>
              {status.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {gatilho === "prazo_proximo" && (
        <Field label="Quantos dias antes do prazo">
          <input
            type="number"
            className={inputClass}
            min={1}
            max={30}
            value={diasAntes}
            onChange={(e) => setDiasAntes(Number(e.target.value))}
          />
        </Field>
      )}

      <div className="pt-2 border-t border-verde-primary/20">
        <div className="text-[10px] uppercase text-verde-primary tracking-wide mb-2">
          → Então
        </div>
        <Field label="Ação">
          <select
            className={inputClass}
            value={acaoTipo}
            onChange={(e) => setAcaoTipo(e.target.value as AcaoAutomacaoTipo)}
          >
            {(Object.keys(ACOES_LABEL) as AcaoAutomacaoTipo[]).map((t) => (
              <option key={t} value={t}>
                {ACOES_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        {acaoTipo === "mover_status" && (
          <Field label="Status alvo">
            <select
              className={inputClass}
              value={acaoValor}
              onChange={(e) => setAcaoValor(e.target.value)}
            >
              {status.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Field>
        )}
        {acaoTipo === "definir_responsavel" && (
          <Field label="Email do responsável">
            <input
              type="email"
              className={inputClass}
              value={acaoValor}
              onChange={(e) => setAcaoValor(e.target.value)}
            />
          </Field>
        )}
        {acaoTipo === "definir_prioridade" && (
          <Field label="Prioridade">
            <select
              className={inputClass}
              value={acaoValor as string}
              onChange={(e) => setAcaoValor(e.target.value)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        )}
        {acaoTipo === "definir_campo" && (
          <div className="text-[11px] text-gray-500">
            Definição de campo personalizado ainda é configurada via JSON —
            edite a coluna <code>acao.valor</code> = <code>{"{nome, valor}"}</code>.
          </div>
        )}
        {acaoTipo === "notificar" && (
          <div className="space-y-2">
            <Field label="Destinatário (opcional — default: responsável)">
              <input
                type="email"
                className={inputClass}
                value={acaoPara}
                onChange={(e) => setAcaoPara(e.target.value)}
              />
            </Field>
            <Field label="Mensagem (opcional)">
              <input
                className={inputClass}
                value={acaoMsg}
                onChange={(e) => setAcaoMsg(e.target.value)}
                placeholder='Default: "Automação {nome}: {título}"'
              />
            </Field>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
        />
        Ativa
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} type="button">
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!nome.trim() || salvar.isPending}
          className="inline-flex items-center gap-1"
        >
          <Bell size={12} /> Salvar
        </Button>
      </div>
    </form>
  );
}

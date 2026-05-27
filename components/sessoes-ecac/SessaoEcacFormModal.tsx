"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import { useUserStore } from "@/lib/store";
import type {
  PendenciaEcac,
  SessaoEcac,
  SituacaoFiscalEcac,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  sessao: SessaoEcac | null;
  idCliente: string;
  iniciadaEm?: string; // timestamp ISO da abertura do popup, pra calcular duração
};

const TIPOS_PENDENCIA = [
  "DCTFWeb",
  "DARF",
  "DEFIS",
  "PER/DCOMP",
  "Parcelamento",
  "Caixa Postal",
  "CND/CPEN",
  "Outro",
];

export function SessaoEcacFormModal({
  open,
  onClose,
  sessao,
  idCliente,
  iniciadaEm,
}: Props) {
  const qc = useQueryClient();
  const user = useUserStore((s) => s.user);
  const isEdit = !!sessao;

  const [situacao, setSituacao] = useState<SituacaoFiscalEcac | "">("");
  const [mensagens, setMensagens] = useState("");
  const [pendencias, setPendencias] = useState<PendenciaEcac[]>([]);
  const [proximasAcoes, setProximasAcoes] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!open) return;
    setSituacao((sessao?.situacao_fiscal as SituacaoFiscalEcac) ?? "");
    setMensagens(
      sessao?.mensagens_nao_lidas != null
        ? String(sessao.mensagens_nao_lidas)
        : ""
    );
    setPendencias(sessao?.pendencias ?? []);
    setProximasAcoes(sessao?.proximas_acoes ?? "");
    setNotas(sessao?.notas ?? "");
  }, [open, sessao]);

  function addPendencia() {
    setPendencias((p) => [...p, { tipo: "DCTFWeb", descricao: "" }]);
  }

  function rmPendencia(idx: number) {
    setPendencias((p) => p.filter((_, i) => i !== idx));
  }

  function updPendencia(idx: number, patch: Partial<PendenciaEcac>) {
    setPendencias((p) => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const agora = new Date().toISOString();
      const inicio = iniciadaEm ?? sessao?.iniciada_em ?? agora;
      const duracao = Math.max(
        1,
        Math.round((Date.now() - new Date(inicio).getTime()) / 60000)
      );

      const payload = {
        id_cliente: idCliente,
        usuario_email: user?.email ?? "",
        usuario_nome: user?.nome ?? null,
        iniciada_em: inicio,
        finalizada_em: agora,
        duracao_minutos: duracao,
        situacao_fiscal: situacao || null,
        mensagens_nao_lidas: mensagens ? Number(mensagens) : null,
        pendencias: pendencias.length > 0 ? pendencias : null,
        proximas_acoes: proximasAcoes.trim() || null,
        notas: notas.trim() || null,
        status: "CONCLUIDA",
        updated_at: agora,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("sessoes_ecac")
          .update(payload as never)
          .eq("id_sessao", sessao!.id_sessao);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sessoes_ecac")
          .insert({ id_sessao: gerarId("ECAC"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessoes-ecac"] });
      toast.success("Sessão e-CAC registrada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar sessão e-CAC" : "Registrar sessão e-CAC"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar sessão"}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900">
          Registre o que voce encontrou no e-CAC durante esta sessão. Os
          dados ficam vinculados ao cliente e ao seu usuário pra histórico.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Situação fiscal">
            <select
              className={inputClass}
              value={situacao}
              onChange={(e) =>
                setSituacao(e.target.value as SituacaoFiscalEcac | "")
              }
            >
              <option value="">— Não verificada —</option>
              <option value="REGULAR">Regular</option>
              <option value="PENDENTE">Com pendência</option>
              <option value="INDETERMINADO">Indeterminado</option>
            </select>
          </Field>
          <Field label="Mensagens não lidas (caixa postal)">
            <input
              type="number"
              className={inputClass}
              value={mensagens}
              onChange={(e) => setMensagens(e.target.value)}
              min={0}
              placeholder="0"
            />
          </Field>
        </div>

        <Field
          label="Pendências encontradas"
          hint="Adicione cada pendência identificada no e-CAC"
        >
          <div className="space-y-2">
            {pendencias.map((p, i) => (
              <div
                key={i}
                className="border border-card-border rounded-lg p-2 bg-app-bg/40 grid grid-cols-12 gap-2 items-end"
              >
                <div className="col-span-3">
                  <select
                    className={`${inputClass} text-sm`}
                    value={p.tipo}
                    onChange={(e) => updPendencia(i, { tipo: e.target.value })}
                  >
                    {TIPOS_PENDENCIA.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input
                    className={`${inputClass} text-sm`}
                    value={p.competencia ?? ""}
                    onChange={(e) =>
                      updPendencia(i, { competencia: e.target.value })
                    }
                    placeholder="2026-04"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    className={`${inputClass} text-sm`}
                    value={p.valor ?? ""}
                    onChange={(e) =>
                      updPendencia(i, {
                        valor: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-4">
                  <input
                    className={`${inputClass} text-sm`}
                    value={p.descricao ?? ""}
                    onChange={(e) =>
                      updPendencia(i, { descricao: e.target.value })
                    }
                    placeholder="Descrição"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => rmPendencia(i)}
                  className="col-span-1 p-1.5 text-gray-400 hover:text-red-alert"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPendencia}
              className="text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-verde-primary hover:text-verde-primary inline-flex items-center gap-1"
            >
              <Plus size={12} /> Adicionar pendência
            </button>
          </div>
        </Field>

        <Field label="Próximas ações (o que precisa ser feito)">
          <textarea
            className={`${inputClass} min-h-[60px]`}
            value={proximasAcoes}
            onChange={(e) => setProximasAcoes(e.target.value)}
            placeholder="Ex.: Transmitir DCTFWeb de abril; gerar DARF do PIS atrasado..."
          />
        </Field>

        <Field label="Notas livres">
          <textarea
            className={`${inputClass} min-h-[60px]`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observações sobre a sessão"
          />
        </Field>
      </form>
    </Modal>
  );
}

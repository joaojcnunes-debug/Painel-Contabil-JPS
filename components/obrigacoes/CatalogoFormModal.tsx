"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { ObrigacaoCatalogo, Periodicidade } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  item: ObrigacaoCatalogo | null;
};

type Esfera = "FEDERAL" | "ESTADUAL" | "MUNICIPAL" | "TRABALHISTA";

const ESFERAS: Esfera[] = ["FEDERAL", "ESTADUAL", "MUNICIPAL", "TRABALHISTA"];
const PERIODS: Periodicidade[] = ["MENSAL", "TRIMESTRAL", "ANUAL", "EVENTUAL"];

export function CatalogoFormModal({ open, onClose, item }: Props) {
  const qc = useQueryClient();
  const isEdit = !!item;

  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [esfera, setEsfera] = useState<Esfera>("FEDERAL");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("MENSAL");
  const [dia, setDia] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSigla(item?.sigla ?? "");
    setNome(item?.nome ?? "");
    setEsfera((item?.esfera as Esfera) ?? "FEDERAL");
    setPeriodicidade((item?.periodicidade as Periodicidade) ?? "MENSAL");
    setDia(item?.dia_vencimento_padrao ? String(item.dia_vencimento_padrao) : "");
    setDescricao(item?.descricao ?? "");
    setAtivo(item?.ativo ?? true);
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!sigla.trim() || !nome.trim()) {
        throw new Error("Sigla e nome são obrigatórios");
      }
      const diaNum = dia ? Number(dia) : null;
      if (diaNum != null && (isNaN(diaNum) || diaNum < 1 || diaNum > 31)) {
        throw new Error("Dia de vencimento deve ser entre 1 e 31");
      }
      const supabase = createSupabaseBrowserClient();
      const payload = {
        sigla: sigla.trim(),
        nome: nome.trim(),
        esfera,
        periodicidade,
        dia_vencimento_padrao: diaNum,
        descricao: descricao.trim() || null,
        ativo,
      };
      if (isEdit) {
        const { error } = await supabase
          .from("obrigacoes_catalogo")
          .update(payload as never)
          .eq("id_obrigacao_catalogo", item!.id_obrigacao_catalogo);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("obrigacoes_catalogo")
          .insert({ id_obrigacao_catalogo: gerarId("CAT"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacoes-catalogo"] });
      toast.success(isEdit ? "Item atualizado" : "Item adicionado");
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
      title={isEdit ? "Editar obrigação do catálogo" : "Nova obrigação no catálogo"}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Sigla" required>
            <input
              className={inputClass}
              value={sigla}
              onChange={(e) => setSigla(e.target.value)}
              placeholder="DAS"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Nome" required>
              <input
                className={inputClass}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Documento de Arrecadação do Simples"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Esfera">
            <select
              className={inputClass}
              value={esfera}
              onChange={(e) => setEsfera(e.target.value as Esfera)}
            >
              {ESFERAS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Periodicidade">
            <select
              className={inputClass}
              value={periodicidade}
              onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dia venc. padrão">
            <input
              className={inputClass}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              placeholder="20"
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Descrição">
          <textarea
            className={`${inputClass} min-h-[70px]`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="rounded border-gray-300 text-verde-primary"
          />
          Ativo no catálogo
        </label>
      </form>
    </Modal>
  );
}

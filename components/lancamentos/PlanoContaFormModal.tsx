"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { PlanoConta, TipoLancamento } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  conta: PlanoConta | null;
};

export function PlanoContaFormModal({ open, onClose, conta }: Props) {
  const qc = useQueryClient();
  const isEdit = !!conta;

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoLancamento>("DESPESA");
  const [grupo, setGrupo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setCodigo(conta?.codigo ?? "");
    setNome(conta?.nome ?? "");
    setTipo((conta?.tipo as TipoLancamento) ?? "DESPESA");
    setGrupo(conta?.grupo ?? "");
    setDescricao(conta?.descricao ?? "");
    setAtivo(conta?.ativo ?? true);
  }, [open, conta]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!codigo.trim() || !nome.trim())
        throw new Error("Código e nome são obrigatórios");

      const supabase = createSupabaseBrowserClient();
      const payload = {
        codigo: codigo.trim(),
        nome: nome.trim(),
        tipo,
        grupo: grupo.trim() || null,
        descricao: descricao.trim() || null,
        ativo,
      };
      if (isEdit) {
        const { error } = await supabase
          .from("plano_contas")
          .update(payload as never)
          .eq("id_conta", conta!.id_conta);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("plano_contas")
          .insert({ id_conta: gerarId("PC"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
      toast.success(isEdit ? "Conta atualizada" : "Conta criada");
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
      title={isEdit ? "Editar conta" : "Nova conta"}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Código" required>
            <input
              className={inputClass}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="4.01.07"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Nome" required>
              <input
                className={inputClass}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Material de limpeza"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo" required>
            <select
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoLancamento)}
            >
              <option value="RECEITA">Receita</option>
              <option value="DESPESA">Despesa</option>
            </select>
          </Field>
          <Field label="Grupo" hint="Pra agrupar no DRE">
            <input
              className={inputClass}
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              placeholder="Operacionais / Pessoal / Tributos..."
            />
          </Field>
        </div>

        <Field label="Descrição">
          <textarea
            className={`${inputClass} min-h-[60px]`}
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
          Ativa (aparece nos selects de lançamento)
        </label>
      </form>
    </Modal>
  );
}

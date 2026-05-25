"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { ClienteContato } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  idCliente: string;
  contato: ClienteContato | null;
};

export function ContatoFormModal({ open, onClose, idCliente, contato }: Props) {
  const qc = useQueryClient();
  const isEdit = !!contato;

  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [principal, setPrincipal] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(contato?.nome ?? "");
    setCargo(contato?.cargo ?? "");
    setEmail(contato?.email ?? "");
    setTelefone(contato?.telefone ?? "");
    setPrincipal(contato?.principal ?? false);
  }, [open, contato]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      const supabase = createSupabaseBrowserClient();

      // Se virou principal, desmarca os demais do mesmo cliente.
      if (principal) {
        await supabase
          .from("clientes_contatos")
          .update({ principal: false } as never)
          .eq("id_cliente", idCliente)
          .eq("principal", true)
          .neq("id_contato", contato?.id_contato ?? "_");
      }

      const payload = {
        id_cliente: idCliente,
        nome: nome.trim(),
        cargo: cargo.trim() || null,
        email: email.trim().toLowerCase() || null,
        telefone: telefone.trim() || null,
        principal,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("clientes_contatos")
          .update(payload as never)
          .eq("id_contato", contato!.id_contato);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clientes_contatos")
          .insert({ id_contato: gerarId("CTO"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contatos", idCliente] });
      toast.success(isEdit ? "Contato atualizado" : "Contato adicionado");
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
      title={isEdit ? "Editar contato" : "Novo contato"}
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
        <Field label="Nome" required>
          <input
            className={inputClass}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </Field>
        <Field label="Cargo / função">
          <input
            className={inputClass}
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Sócio, financeiro, RH..."
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="E-mail">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Telefone">
            <input
              className={inputClass}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={principal}
            onChange={(e) => setPrincipal(e.target.checked)}
            className="rounded border-gray-300 text-verde-primary"
          />
          Contato principal (única referência destacada)
        </label>
      </form>
    </Modal>
  );
}

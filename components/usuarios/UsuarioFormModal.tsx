"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { Cliente, PerfilUsuario, Usuario } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  usuario: Usuario | null;
  clientes: Cliente[];
};

const PERFIS: PerfilUsuario[] = ["Admin", "Contador", "Assistente", "Cliente"];

export function UsuarioFormModal({ open, onClose, usuario, clientes }: Props) {
  const qc = useQueryClient();
  const isEdit = !!usuario;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<PerfilUsuario>("Contador");
  const [idCliente, setIdCliente] = useState<string>("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNome(usuario?.nome ?? "");
    setEmail(usuario?.email ?? "");
    setSenha("");
    setPerfil((usuario?.perfil as PerfilUsuario) ?? "Contador");
    setIdCliente(usuario?.id_cliente ?? "");
    setAtivo(usuario?.ativo ?? true);
  }, [open, usuario]);

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const emailNorm = email.trim().toLowerCase();

      if (!nome.trim() || !emailNorm) {
        throw new Error("Nome e e-mail são obrigatórios");
      }
      if (perfil === "Cliente" && !idCliente) {
        throw new Error("Selecione a empresa-cliente vinculada");
      }

      if (isEdit) {
        const { error } = await supabase
          .from("usuarios")
          .update({
            nome: nome.trim(),
            perfil,
            id_cliente: perfil === "Cliente" ? idCliente : null,
            ativo,
          } as never)
          .eq("id_usuario", usuario!.id_usuario);
        if (error) throw error;
        return;
      }

      // Criação — segue padrão Painel SST:
      // 1) salva sessão atual; 2) signUp() cria auth.users + loga como o novo;
      // 3) restaura sessão do Admin; 4) insere em public.usuarios.
      // Pré-requisito: "Confirm email" off em Auth Providers → Email.
      if (!senha || senha.length < 6) {
        throw new Error("A senha deve ter pelo menos 6 caracteres");
      }

      const {
        data: { session: sessaoAdmin },
      } = await supabase.auth.getSession();

      const { error: errAuth } = await supabase.auth.signUp({
        email: emailNorm,
        password: senha,
      });
      if (errAuth) {
        if (sessaoAdmin) {
          await supabase.auth.setSession({
            access_token: sessaoAdmin.access_token,
            refresh_token: sessaoAdmin.refresh_token,
          });
        }
        throw new Error(
          errAuth.message === "User already registered"
            ? "E-mail já cadastrado"
            : errAuth.message
        );
      }

      if (sessaoAdmin) {
        await supabase.auth.setSession({
          access_token: sessaoAdmin.access_token,
          refresh_token: sessaoAdmin.refresh_token,
        });
      }

      const insertRow = {
        id_usuario: gerarId("USR"),
        nome: nome.trim(),
        email: emailNorm,
        perfil,
        id_cliente: perfil === "Cliente" ? idCliente : null,
        ativo,
      };
      const { error: errInsert } = await supabase
        .from("usuarios")
        .insert(insertRow as never);
      if (errInsert) {
        throw new Error(
          `Usuário criado no Auth mas falhou ao salvar perfil: ${errInsert.message}`
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success(isEdit ? "Usuário atualizado" : "Usuário criado");
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
      title={isEdit ? "Editar usuário" : "Novo usuário"}
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
        <Field label="E-mail" required>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            required
          />
        </Field>
        {!isEdit && (
          <Field label="Senha" required hint="Mínimo 6 caracteres">
            <input
              type="password"
              className={inputClass}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
            />
          </Field>
        )}
        <Field label="Perfil" required>
          <select
            className={inputClass}
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as PerfilUsuario)}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        {perfil === "Cliente" && (
          <Field label="Empresa-cliente vinculada" required>
            <select
              className={inputClass}
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id_cliente} value={c.id_cliente}>
                  {c.razao_social}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Status">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="rounded border-gray-300 text-verde-primary"
            />
            Usuário ativo
          </label>
        </Field>
      </form>
    </Modal>
  );
}

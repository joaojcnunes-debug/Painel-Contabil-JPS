"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Edit2, Mail, Phone, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ContatoFormModal } from "@/components/contatos/ContatoFormModal";
import { useContatos } from "@/lib/hooks/useContatos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ClienteContato } from "@/lib/supabase/types";

export function ContatosSection({ idCliente }: { idCliente: string }) {
  const { data: contatos = [], isLoading } = useContatos(idCliente);
  const user = useUserStore((s) => s.user);
  const podeEditar =
    user?.perfil === "Admin" || user?.perfil === "Contador";

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteContato | null>(null);
  const qc = useQueryClient();

  function novo() {
    setEditing(null);
    setOpen(true);
  }
  function editar(c: ClienteContato) {
    setEditing(c);
    setOpen(true);
  }

  const excluir = useMutation({
    mutationFn: async (c: ClienteContato) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("clientes_contatos")
        .delete()
        .eq("id_contato", c.id_contato);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contatos", idCliente] });
      toast.success("Contato removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
          <UsersIcon size={14} className="text-gold" /> Contatos
        </h3>
        {podeEditar && (
          <Button
            onClick={novo}
            variant="secondary"
            className="text-xs px-2.5 py-1 flex items-center gap-1"
          >
            <Plus size={12} /> Novo
          </Button>
        )}
      </div>
      <div className="divide-y divide-card-border">
        {isLoading && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Carregando…
          </div>
        )}
        {!isLoading && contatos.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Nenhum contato cadastrado.
          </div>
        )}
        {contatos.map((c) => (
          <div key={c.id_contato} className="px-4 py-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-gray-800">
                    {c.nome}
                  </div>
                  {c.principal && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gold/20 text-gold">
                      principal
                    </span>
                  )}
                </div>
                {c.cargo && (
                  <div className="text-xs text-gray-500">{c.cargo}</div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 hover:text-verde-dark"
                    >
                      <Mail size={11} /> {c.email}
                    </a>
                  )}
                  {c.telefone && (
                    <a
                      href={`tel:${c.telefone.replace(/\D/g, "")}`}
                      className="inline-flex items-center gap-1 hover:text-verde-dark"
                    >
                      <Phone size={11} /> {c.telefone}
                    </a>
                  )}
                </div>
              </div>
              {podeEditar && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => editar(c)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                    aria-label="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover contato "${c.nome}"?`)) {
                        excluir.mutate(c);
                      }
                    }}
                    disabled={excluir.isPending}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-alert"
                    aria-label="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <ContatoFormModal
        open={open}
        onClose={() => setOpen(false)}
        idCliente={idCliente}
        contato={editing}
      />
    </div>
  );
}

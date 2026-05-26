"use client";

import { useState } from "react";
import { Edit2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { UsuarioFormModal } from "@/components/usuarios/UsuarioFormModal";
import { useUsuarios } from "@/lib/hooks/useUsuarios";
import { useClientes } from "@/lib/hooks/useClientes";
import { useUserStore } from "@/lib/store";
import type { Usuario } from "@/lib/supabase/types";

const PERFIL_TONE: Record<string, string> = {
  Admin: "bg-verde-light text-verde-dark",
  Contador: "bg-amber-100 text-amber-800",
  Assistente: "bg-blue-100 text-blue-800",
  Cliente: "bg-gray-100 text-gray-700",
};

export default function UsuariosPage() {
  const userLogado = useUserStore((s) => s.user);
  const { data: usuarios = [], isLoading } = useUsuarios();
  const { data: clientes = [] } = useClientes();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);

  const isAdmin = userLogado?.perfil === "Admin";

  function novo() {
    setEditing(null);
    setModalOpen(true);
  }
  function editar(u: Usuario) {
    setEditing(u);
    setModalOpen(true);
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Usuários" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas administradores podem gerenciar usuários.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Equipe interna e logins de clientes"
        actions={
          <Button onClick={novo} className="flex items-center gap-2">
            <UserPlus size={16} /> Novo usuário
          </Button>
        }
      />

      <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Vínculo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading &&
              usuarios.map((u) => {
                const cliente = clientes.find((c) => c.id_cliente === u.id_cliente);
                return (
                  <tr key={u.id_usuario} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${PERFIL_TONE[u.perfil] ?? "bg-gray-100"}`}
                      >
                        {u.perfil}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.perfil === "Cliente" ? cliente?.razao_social ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.ativo ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-verde-light text-verde-dark">
                          Ativo
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => editar(u)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-verde-dark"
                        aria-label="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            {!isLoading && usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UsuarioFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        usuario={editing}
        clientes={clientes}
      />
    </div>
  );
}

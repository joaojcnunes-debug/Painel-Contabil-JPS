"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MessageCircle, Send, Trash2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useObrigacaoComentarios } from "@/lib/hooks/useObrigacaoComentarios";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type { ObrigacaoComentario } from "@/lib/supabase/types";

function formatRelativo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PERFIL_TONE: Record<string, string> = {
  Admin: "bg-verde-light text-verde-dark",
  Contador: "bg-amber-100 text-amber-800",
  Assistente: "bg-blue-100 text-blue-800",
  Cliente: "bg-gray-100 text-gray-700",
};

export function ComentariosThread({ idObrigacao }: { idObrigacao: string }) {
  const { data: comentarios = [], isLoading } =
    useObrigacaoComentarios(idObrigacao);
  const user = useUserStore((s) => s.user);
  const qc = useQueryClient();

  const [texto, setTexto] = useState("");

  const enviar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada — faça login de novo");
      const t = texto.trim();
      if (!t) throw new Error("Digite o texto do comentário");
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes_comentarios")
        .insert({
          id_comentario: gerarId("COM"),
          id_obrigacao: idObrigacao,
          autor_email: user.email,
          autor_nome: user.nome,
          autor_perfil: user.perfil,
          texto: t,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacao-comentarios", idObrigacao] });
      setTexto("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (c: ObrigacaoComentario) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("obrigacoes_comentarios")
        .delete()
        .eq("id_comentario", c.id_comentario);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obrigacao-comentarios", idObrigacao] });
      toast.success("Comentário removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    enviar.mutate();
  }

  return (
    <div className="bg-white border border-card-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="font-serif text-sm font-semibold text-verde-dark flex items-center gap-2">
          <MessageCircle size={14} className="text-gold" /> Comentários
        </h3>
        <span className="text-xs text-gray-500">
          {comentarios.length} mensage{comentarios.length === 1 ? "m" : "ns"}
        </span>
      </div>

      <div className="divide-y divide-card-border max-h-[460px] overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Carregando…
          </div>
        )}
        {!isLoading && comentarios.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Sem comentários ainda. Use a área abaixo pra registrar o histórico.
          </div>
        )}
        {comentarios.map((c) => (
          <div key={c.id_comentario} className="px-4 py-3 group">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-verde-light flex items-center justify-center text-verde-dark flex-shrink-0">
                <UserIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {c.autor_nome}
                  </div>
                  {c.autor_perfil && (
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${PERFIL_TONE[c.autor_perfil] ?? "bg-gray-100"}`}
                    >
                      {c.autor_perfil}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {formatRelativo(c.created_at)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-700 whitespace-pre-line break-words">
                  {c.texto}
                </div>
              </div>
              {user?.perfil === "Admin" && (
                <button
                  onClick={() => {
                    if (confirm("Remover este comentário?")) {
                      excluir.mutate(c);
                    }
                  }}
                  disabled={excluir.isPending}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-alert opacity-0 group-hover:opacity-100 transition"
                  aria-label="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="px-4 py-3 border-t border-card-border bg-gray-50/50"
      >
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva um comentário…"
            disabled={enviar.isPending}
          />
          <Button
            type="submit"
            disabled={enviar.isPending || !texto.trim()}
            className="flex items-center gap-1 px-3"
          >
            <Send size={14} />
            {enviar.isPending ? "..." : "Enviar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

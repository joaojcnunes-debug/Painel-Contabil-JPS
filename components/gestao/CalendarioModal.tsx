"use client";

import { useMemo, useState } from "react";
import { Calendar, Copy, RefreshCcw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useDefinirIcsToken } from "@/lib/gestao/hooks";
import { novoToken } from "@/lib/gestao/types";

type Props = {
  open: boolean;
  onClose: () => void;
  idQuadro: string;
  nomeQuadro: string;
  icsToken: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function CalendarioModal({
  open,
  onClose,
  idQuadro,
  nomeQuadro,
  icsToken,
}: Props) {
  const definir = useDefinirIcsToken();
  const [gerando, setGerando] = useState(false);

  const url = useMemo(() => {
    if (!icsToken) return null;
    return `${SUPABASE_URL}/functions/v1/gestao-ics?token=${icsToken}`;
  }, [icsToken]);

  function gerarNovo() {
    setGerando(true);
    definir.mutate(
      { id_quadro: idQuadro, token: novoToken(16) },
      {
        onSuccess: () => toast.success("Link gerado — cole no Google/Outlook Calendar"),
        onSettled: () => setGerando(false),
      }
    );
  }

  function revogar() {
    if (!confirm("Revogar o link — quem já assinou vai parar de receber. Continuar?"))
      return;
    definir.mutate(
      { id_quadro: idQuadro, token: null },
      { onSuccess: () => toast.success("Link revogado") }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Calendário — ${nomeQuadro}`}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 flex items-start gap-2">
          <Calendar size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Gera um <strong>link ICS</strong> que qualquer app de calendário
            (Google, Outlook, Apple) pode assinar. Todas as tarefas com prazo
            deste quadro aparecem como eventos de dia inteiro. Atualiza
            automaticamente conforme você adiciona/muda tarefas.
          </div>
        </div>

        {!url ? (
          <div className="text-center py-6">
            <Button onClick={gerarNovo} disabled={gerando} className="inline-flex items-center gap-2">
              <Calendar size={14} /> Gerar link de calendário
            </Button>
          </div>
        ) : (
          <>
            <div className="bg-gray-50 border border-card-border rounded p-2 flex items-center gap-2">
              <code className="text-[10px] font-mono text-gray-700 flex-1 truncate break-all">
                {url}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success("Link copiado");
                }}
                className="p-1.5 text-gray-500 hover:text-verde-primary"
                title="Copiar link"
              >
                <Copy size={12} />
              </button>
            </div>

            <div className="text-xs text-gray-600 space-y-1">
              <div>
                <strong>Google Calendar:</strong> Configurações → Adicionar
                calendário → De URL → cola o link
              </div>
              <div>
                <strong>Outlook:</strong> Adicionar calendário → Assinar da web
                → cola o link
              </div>
              <div>
                <strong>Apple:</strong> Calendário → Arquivo → Nova assinatura
                → cola o link
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-card-border">
              <Button
                variant="secondary"
                onClick={gerarNovo}
                disabled={gerando}
                className="inline-flex items-center gap-1 flex-1"
              >
                <RefreshCcw size={12} /> Gerar novo (revoga o antigo)
              </Button>
              <Button
                variant="secondary"
                onClick={revogar}
                className="inline-flex items-center gap-1 text-red-alert"
              >
                <Trash2 size={12} /> Remover
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

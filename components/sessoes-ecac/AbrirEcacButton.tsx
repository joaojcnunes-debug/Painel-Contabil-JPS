"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { ExternalLink, ShieldCheck } from "lucide-react";

const SessaoEcacFormModal = dynamic(
  () =>
    import("./SessaoEcacFormModal").then((m) => ({
      default: m.SessaoEcacFormModal,
    })),
  { ssr: false }
);

type Props = {
  idCliente: string;
  variant?: "primary" | "secondary";
  /** Texto custom (default "Abrir e-CAC") */
  label?: string;
};

const URL_ECAC = "https://cav.receita.fazenda.gov.br/autenticacao/login";

// Popup centralizado, lado a lado com o painel
function abrirPopup() {
  const w = 1200;
  const h = 800;
  const left = Math.max(0, (window.screen.availWidth - w) / 2);
  const top = Math.max(0, (window.screen.availHeight - h) / 2);
  return window.open(
    URL_ECAC,
    "ecac_popup",
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

export function AbrirEcacButton({
  idCliente,
  variant = "primary",
  label = "Abrir e-CAC",
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [iniciadaEm, setIniciadaEm] = useState<string | undefined>();

  function handleClick() {
    const inicio = new Date().toISOString();
    const popup = abrirPopup();
    if (!popup) {
      toast.error(
        "Pop-up bloqueado. Permita popups pra cav.receita.fazenda.gov.br"
      );
      return;
    }
    setIniciadaEm(inicio);
    toast(
      "Faça login no e-CAC, trabalhe, e volte aqui pra registrar o que encontrou.",
      { icon: "💡", duration: 6000 }
    );
    // Pequeno delay e abre o modal automaticamente — usuário pode preencher
    // enquanto trabalha no e-CAC (popup separada não bloqueia)
    setTimeout(() => setModalOpen(true), 1500);
  }

  const cls =
    variant === "primary"
      ? "inline-flex items-center gap-2 px-3 py-2 bg-verde-primary text-white rounded-lg text-xs font-medium hover:bg-verde-accent"
      : "inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light";

  return (
    <>
      <button onClick={handleClick} className={cls} title="Abre o e-CAC em pop-up + registra sessão">
        <ShieldCheck size={14} />
        {label}
        <ExternalLink size={11} className="opacity-60" />
      </button>

      <SessaoEcacFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        sessao={null}
        idCliente={idCliente}
        iniciadaEm={iniciadaEm}
      />
    </>
  );
}

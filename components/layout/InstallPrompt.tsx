"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Captura o evento `beforeinstallprompt` do browser e mostra um banner
// discreto pra instalar o app. Funciona em Chrome/Edge no Android e
// desktop. No iOS Safari não dispara (usuário precisa fazer manual via
// "Adicionar à Tela Inicial").

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "jsp-install-dismissed";
const DISMISSED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function InstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      // Checa se o usuário já dispensou recentemente
      try {
        const dismissed = localStorage.getItem(DISMISSED_KEY);
        if (dismissed && Date.now() - Number(dismissed) < DISMISSED_TTL) {
          return;
        }
      } catch {
        /* sem localStorage, ok */
      }
      setEvento(e as BeforeInstallPromptEvent);
      setVisivel(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "dismissed") {
      try {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      } catch {
        /* */
      }
    }
    setVisivel(false);
    setEvento(null);
  }

  function dispensar() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* */
    }
    setVisivel(false);
  }

  if (!visivel) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-white border border-card-border rounded-xl shadow-xl p-4 print:hidden">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-verde-dark text-gold flex items-center justify-center font-serif font-bold text-lg flex-shrink-0">
          JSP
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-sm font-semibold text-verde-dark">
            Instalar como app
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            Acesso rápido e funciona em tela cheia, sem barra do navegador.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={instalar}
              className="px-3 py-1.5 bg-verde-primary text-white text-xs font-medium rounded-md hover:bg-verde-accent flex items-center gap-1.5"
            >
              <Download size={12} /> Instalar
            </button>
            <button
              onClick={dispensar}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-verde-dark"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          onClick={dispensar}
          className="p-1 text-gray-400 hover:text-gray-700"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { Sidebar } from "./Sidebar";
import { Logo } from "@/components/ui/Logo";

type Props = {
  variant: "interno" | "portal";
  children: React.ReactNode;
};

// Shell responsivo: sidebar fixa em desktop, drawer com hamburger em mobile.
export function AppShell({ variant, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: cfg } = useConfiguracao();

  // Fecha o drawer ao navegar (clique em link da sidebar)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Trava scroll do body quando drawer aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop (lg+) */}
      <div className="hidden lg:flex">
        <Sidebar variant={variant} />
      </div>

      {/* Drawer mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar variant={variant} />
      </div>

      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-card-border flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-700"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Logo size={28} showSubtitle={false} src={cfg?.logo_url ?? null} />
            <div className="font-serif text-sm font-bold text-verde-dark">
              {cfg?.nome_escritorio?.split(" ")[0] ?? "JSP"}
            </div>
          </div>
          <div className="w-8" />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// Botão de fechar dentro do drawer (mostrado só em mobile)
export function MobileCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 text-gray-700"
      aria-label="Fechar menu"
    >
      <X size={18} />
    </button>
  );
}

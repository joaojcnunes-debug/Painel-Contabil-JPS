"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  FileLock2,
  FileText,
  Receipt,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, type NotificationItem } from "@/lib/hooks/useNotifications";
import { useUserStore } from "@/lib/store";

const PRIORIDADE_DOT: Record<string, string> = {
  alta: "bg-red-alert",
  media: "bg-amber-500",
  baixa: "bg-verde-primary",
};

const TIPO_ICON: Record<NotificationItem["tipo"], React.ElementType> = {
  obrigacao: CalendarCheck,
  documento: FileText,
  fatura: Receipt,
  sessao_ecac: ShieldCheck,
  certificado: FileLock2,
};

function formatRelativo(iso: string) {
  const d = new Date(iso.length === 10 ? iso + "T12:00" : iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function NotificationBell() {
  const user = useUserStore((s) => s.user);
  const { data: items = [], isLoading } = useNotifications(user?.perfil);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const altas = items.filter((i) => i.prioridade === "alta").length;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-verde-dark transition"
        aria-label="Notificações"
        title="Notificações"
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white flex items-center justify-center",
              altas > 0 ? "bg-red-alert" : "bg-gold"
            )}
          >
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-full ml-2 top-0 w-80 bg-white border border-card-border rounded-xl shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
            <h3 className="font-serif text-sm font-semibold text-verde-dark">
              Notificações
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">
                Carregando…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-gray-500">
                Nenhuma novidade por aqui. 🎉
              </div>
            )}
            {items.map((it) => {
              const Icon = TIPO_ICON[it.tipo];
              return (
                <Link
                  key={it.id}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-card-border last:border-b-0"
                >
                  <div className="flex flex-col items-center gap-1 mt-0.5">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        PRIORIDADE_DOT[it.prioridade]
                      )}
                    />
                    <Icon size={14} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">
                      {it.titulo}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {it.subtitulo}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 whitespace-nowrap mt-1">
                    {formatRelativo(it.data)}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="px-4 py-2 border-t border-card-border bg-gray-50 text-[10px] text-gray-400 text-center">
            Atualiza automaticamente a cada minuto
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  FolderUp,
  Wallet,
  Settings,
  LogOut,
  Building2,
  FileText,
  Receipt,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: React.ElementType };

const ITEMS_INTERNO: Item[] = [
  { href: "/inicio", label: "Início", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/obrigacoes", label: "Obrigações", icon: CalendarCheck },
  { href: "/documentos", label: "Documentos", icon: FolderUp },
  { href: "/honorarios", label: "Honorários", icon: Wallet },
  { href: "/config", label: "Configurações", icon: Settings },
];

const ITEMS_PORTAL: Item[] = [
  { href: "/portal", label: "Início", icon: Building2 },
  { href: "/portal/obrigacoes", label: "Obrigações", icon: CalendarCheck },
  { href: "/portal/documentos", label: "Documentos", icon: FileText },
  { href: "/portal/financeiro", label: "Financeiro", icon: Receipt },
];

export function Sidebar({ variant }: { variant: "interno" | "portal" }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);

  const items = variant === "interno" ? ITEMS_INTERNO : ITEMS_PORTAL;

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    logout();
    toast.success("Sessão encerrada.");
    router.push("/login");
  }

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-card-border flex flex-col">
      <div className="px-5 py-5 border-b border-card-border">
        <div className="text-base font-bold text-verde-dark leading-tight">
          Painel Contábil
        </div>
        <div className="text-xs text-gray-500">
          {variant === "interno" ? "Equipe Chabra" : "Portal do Cliente"}
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const active =
            it.href === pathname ||
            (it.href !== "/inicio" &&
              it.href !== "/portal" &&
              pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                active
                  ? "bg-verde-light text-verde-dark font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <Icon size={18} />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-card-border">
        <div className="px-2 pb-2">
          <div className="text-sm font-medium text-gray-800 truncate">
            {user?.nome ?? "—"}
          </div>
          <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          <div className="text-[10px] uppercase tracking-wide text-verde-primary font-semibold mt-0.5">
            {user?.perfil}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-red-alert hover:bg-red-50 rounded-lg transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}

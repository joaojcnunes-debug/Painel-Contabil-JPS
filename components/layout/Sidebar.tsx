"use client";

import { useEffect, useState } from "react";
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
  ShieldCheck,
  TrendingUp,
  History,
  Shield,
  BookOpen,
  Landmark,
  Calculator,
  Users2,
  Briefcase,
  Gift,
  FileCode,
  Plane,
  Globe2,
  ReceiptText,
  ChevronRight,
  BarChart3,
  UserCircle2,
  Cog,
  Percent,
  PiggyBank,
  Building,
  Files,
  FileArchive,
  FileSpreadsheet,
  UserCog,
  FileLock2,
  Activity,
  ClipboardList,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { Logo } from "@/components/ui/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";

type Item = {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
};

type Group = {
  key: string;
  label: string;
  icon: React.ElementType;
  items: Item[];
};

type Entry = { kind: "item"; item: Item } | { kind: "group"; group: Group };

const item = (i: Item): Entry => ({ kind: "item", item: i });
const group = (g: Group): Entry => ({ kind: "group", group: g });

// Estrutura por área: itens standalone + grupos que abrem em cascata.
// Cada módulo de /integracoes vive DENTRO da área contextual (eSocial→RH/DP,
// SPED→Fiscal, NF-e→Contábil, etc). A tela-índice /integracoes fica em Sistema
// como "visão geral" pra quem quer ver os cards agregados.
const ENTRIES_INTERNO: Entry[] = [
  item({ href: "/inicio", label: "Início", icon: LayoutDashboard }),
  item({ href: "/clientes", label: "Clientes", icon: Users }),
  group({
    key: "contabil",
    label: "Contábil",
    icon: BarChart3,
    items: [
      { href: "/lancamentos", label: "Lançamentos", icon: BookOpen },
      { href: "/conciliacao", label: "Conciliação", icon: Landmark },
      { href: "/apuracao", label: "Apuração", icon: Calculator },
      { href: "/nfe", label: "NF-e", icon: FileCode },
      { href: "/monitor-xmls", label: "Monitor de XMLs", icon: Activity },
      {
        href: "/integracoes/notas-fiscais",
        label: "Notas Fiscais (integração)",
        icon: Files,
      },
      {
        href: "/integracoes/nfse/recebidas",
        label: "Notas Fiscais Emitidas",
        icon: ReceiptText,
      },
      {
        href: "/integracoes/prefeituras",
        label: "Prefeituras / ISS",
        icon: Building,
      },
    ],
  }),
  group({
    key: "rhdp",
    label: "RH / DP",
    icon: UserCircle2,
    items: [
      { href: "/folha", label: "Folha", icon: Users2 },
      { href: "/pro-labore", label: "Pró-labore", icon: Briefcase },
      { href: "/decimo-terceiro", label: "13º salário", icon: Gift },
      { href: "/ferias", label: "Férias", icon: Plane },
      { href: "/integracoes/esocial", label: "eSocial", icon: UserCog },
      {
        href: "/integracoes/fgts-digital",
        label: "FGTS Digital",
        icon: PiggyBank,
      },
    ],
  }),
  group({
    key: "fiscal",
    label: "Fiscal",
    icon: CalendarCheck,
    items: [
      { href: "/obrigacoes", label: "Obrigações", icon: CalendarCheck },
      { href: "/documentos", label: "Documentos", icon: FolderUp },
      { href: "/sessoes-ecac", label: "Sessões e-CAC", icon: ShieldCheck },
      {
        href: "/integracoes/receita-federal",
        label: "Receita Federal",
        icon: Landmark,
      },
      {
        href: "/integracoes/efd-reinf",
        label: "EFD-Reinf",
        icon: FileArchive,
      },
      { href: "/integracoes/sped", label: "SPED", icon: FileSpreadsheet },
      {
        href: "/integracoes/simples-nacional",
        label: "Simples Nacional",
        icon: Percent,
      },
      { href: "/integracoes/redesim", label: "REDESIM", icon: Building },
    ],
  }),
  item({ href: "/honorarios", label: "Honorários", icon: Wallet }),
  item({ href: "/produtividade", label: "Produtividade", icon: TrendingUp }),
  item({ href: "/gestao", label: "Gestão", icon: ClipboardList }),
  group({
    key: "sistema",
    label: "Sistema",
    icon: Cog,
    items: [
      { href: "/integracoes", label: "Integrações (visão geral)", icon: Globe2 },
      {
        href: "/integracoes/certificado-digital",
        label: "Certificado Digital",
        icon: FileLock2,
      },
      { href: "/seguranca", label: "Segurança", icon: Shield },
      {
        href: "/usuarios",
        label: "Usuários",
        icon: ShieldCheck,
        adminOnly: true,
      },
      { href: "/logs", label: "Logs", icon: History, adminOnly: true },
      { href: "/config", label: "Configurações", icon: Settings },
    ],
  }),
];

const ITEMS_PORTAL: Item[] = [
  { href: "/portal", label: "Início", icon: Building2 },
  { href: "/portal/obrigacoes", label: "Obrigações", icon: CalendarCheck },
  { href: "/portal/documentos", label: "Documentos", icon: FileText },
  { href: "/portal/financeiro", label: "Financeiro", icon: Receipt },
];

// Pathname bate com esse item? Trata rotas que têm sub-rotas siblings como
// match exato — senão "Integrações (visão geral)" ficaria ativo em qualquer
// /integracoes/xxx, competindo com o item específico do submódulo.
const EXATOS = new Set(["/inicio", "/portal", "/integracoes"]);

function isActiveHref(pathname: string, href: string): boolean {
  if (EXATOS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// Retorna true se algum item filho do grupo está ativo — usado pra
// auto-expandir o grupo na entrada da página.
function groupHasActive(pathname: string, g: Group): boolean {
  return g.items.some((i) => isActiveHref(pathname, i.href));
}

export function Sidebar({ variant }: { variant: "interno" | "portal" }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const { data: cfg } = useConfiguracao();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filtra itens adminOnly de grupos + entradas standalone
  const entries: Entry[] =
    variant === "interno"
      ? ENTRIES_INTERNO.map((e) => {
          if (e.kind === "item") {
            return e.item.adminOnly && user?.perfil !== "Admin" ? null : e;
          }
          const filtered = e.group.items.filter(
            (i) => !i.adminOnly || user?.perfil === "Admin"
          );
          if (filtered.length === 0) return null;
          return group({ ...e.group, items: filtered });
        }).filter((e): e is Entry => e !== null)
      : [];

  // Auto-expande grupos cujo item ativo bate com pathname atual
  useEffect(() => {
    if (variant !== "interno") return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const e of ENTRIES_INTERNO) {
        if (e.kind === "group" && groupHasActive(pathname, e.group)) {
          if (!next.has(e.group.key)) {
            next.add(e.group.key);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, variant]);

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    logout();
    toast.success("Sessão encerrada.");
    router.push("/login");
  }

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-card-border flex flex-col">
      <div className="px-4 py-5 border-b border-card-border flex items-center gap-3">
        <Logo size={48} showSubtitle={false} src={cfg?.logo_url ?? null} />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] font-bold text-verde-dark leading-tight tracking-wide truncate">
            {cfg?.nome_escritorio?.split(" ")[0] ?? "JSP"}
          </div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-gold leading-relaxed">
            {variant === "interno" ? "Equipe interna" : "Portal do cliente"}
          </div>
        </div>
        <NotificationBell />
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {variant === "portal"
          ? ITEMS_PORTAL.map((it) => (
              <SidebarItem
                key={it.href}
                item={it}
                active={isActiveHref(pathname, it.href)}
              />
            ))
          : entries.map((e) =>
              e.kind === "item" ? (
                <SidebarItem
                  key={e.item.href}
                  item={e.item}
                  active={isActiveHref(pathname, e.item.href)}
                />
              ) : (
                <SidebarGroup
                  key={e.group.key}
                  group={e.group}
                  pathname={pathname}
                  isOpen={expanded.has(e.group.key)}
                  onToggle={() => toggleGroup(e.group.key)}
                />
              )
            )}
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

function SidebarItem({
  item,
  active,
  nested,
}: {
  item: Item;
  active: boolean;
  nested?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
        nested && "ml-6 pl-2 py-1.5 text-[13px]",
        active
          ? "bg-verde-light text-verde-dark font-medium"
          : "text-gray-700 hover:bg-gray-50"
      )}
    >
      <Icon size={nested ? 14 : 18} />
      {item.label}
    </Link>
  );
}

function SidebarGroup({
  group,
  pathname,
  isOpen,
  onToggle,
}: {
  group: Group;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = group.icon;
  const hasActive = groupHasActive(pathname, group);
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
          hasActive
            ? "text-verde-dark font-medium"
            : "text-gray-700 hover:bg-gray-50"
        )}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronRight
          size={14}
          className={cn(
            "transition-transform text-gray-400",
            isOpen && "rotate-90"
          )}
        />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5 border-l border-card-border ml-4">
          {group.items.map((it) => (
            <SidebarItem
              key={it.href}
              item={it}
              active={isActiveHref(pathname, it.href)}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

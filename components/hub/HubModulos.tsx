"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Briefcase,
  Building,
  Building2,
  Calculator,
  CalendarCheck,
  Coins,
  FileArchive,
  FileClock,
  FileCode,
  FileSpreadsheet,
  FolderUp,
  Gift,
  KanbanSquare,
  Landmark,
  Loader2,
  LogOut,
  Percent,
  PiggyBank,
  Plane,
  PlugZap,
  ReceiptText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  Users2,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { useUserStore } from "@/lib/store";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { useHubStats, type ModuloStats } from "@/lib/hooks/useHubStats";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Perfil = "Admin" | "Contador" | "Assistente" | "Cliente";
type Categoria = "contabil" | "rh" | "fiscal" | "financeiro";

interface HubCardCfg {
  id: string; // chave da contagem em useHubStats
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  categoria: Categoria;
  perfis?: Perfil[]; // sem: toda a equipe
  skipStats?: boolean;
  staticLabel?: string;
}

const FUNDO = "linear-gradient(135deg, #2A3014 0%, #4A5326 60%, #5D6932 100%)";
const ICONE = "size-12";

const CATEGORIAS: {
  id: Categoria;
  label: string;
  icon: ReactNode;
  accent: string;
  descricao: string;
}[] = [
  { id: "contabil", label: "Contábil", icon: <BookOpenCheck className={ICONE} />, accent: "#4A5326", descricao: "Lançamentos, conciliação, apuração e notas fiscais" },
  { id: "rh", label: "RH / DP", icon: <Users className={ICONE} />, accent: "#7C5A2E", descricao: "Folha, pró-labore, lucros, férias, 13º e eSocial" },
  { id: "fiscal", label: "Fiscal", icon: <Landmark className={ICONE} />, accent: "#2F5D62", descricao: "Obrigações, documentos, e-CAC e integrações fiscais" },
  { id: "financeiro", label: "Financeiro e gestão", icon: <Wallet className={ICONE} />, accent: "#A88440", descricao: "Honorários e produtividade da equipe" },
];

const ACCENT: Record<Categoria, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.id, c.accent])
) as Record<Categoria, string>;

// Mesma ordem e rotas do menu lateral (components/layout/Sidebar.tsx).
const CARDS: HubCardCfg[] = [
  // ── Contábil ──
  { id: "lancamentos", href: "/lancamentos", title: "Lançamentos", description: "Escrituração, recorrentes, plano de contas, DRE e demonstrações", icon: <BookOpen className={ICONE} />, categoria: "contabil" },
  { id: "conciliacao", href: "/conciliacao", title: "Conciliação", description: "Extratos OFX/CSV com sugestão de lançamento", icon: <Landmark className={ICONE} />, categoria: "contabil" },
  { id: "apuracao", href: "/apuracao", title: "Apuração (DAS)", description: "Simples Nacional pela RBT12 e anexo do cliente", icon: <Calculator className={ICONE} />, categoria: "contabil", skipStats: true, staticLabel: "Simples Nacional · RBT12" },
  { id: "nfe", href: "/nfe", title: "NF-e", description: "Importação de XMLs com lançamento automático", icon: <FileCode className={ICONE} />, categoria: "contabil" },
  { id: "monitor-xmls", href: "/monitor-xmls", title: "Monitor de XMLs", description: "NF-e baixadas da SEFAZ: manifestação e lançamento", icon: <Activity className={ICONE} />, categoria: "contabil" },
  { id: "nfse", href: "/integracoes/nfse/recebidas", title: "Notas Fiscais Emitidas", description: "NFS-e do ADN, portal nacional, Nota Carioca e upload", icon: <ReceiptText className={ICONE} />, categoria: "contabil", skipStats: true, staticLabel: "Coleta diária às 3h" },
  { id: "prefeituras", href: "/integracoes/prefeituras", title: "Prefeituras / ISS", description: "NFS-e municipal, ISS e CND municipal", icon: <Building className={ICONE} />, categoria: "contabil", skipStats: true, staticLabel: "ISS e CND" },
  // ── RH / DP ──
  { id: "folha", href: "/folha", title: "Folha", description: "Funcionários, processamento mensal e holerites", icon: <Users2 className={ICONE} />, categoria: "rh" },
  { id: "pro-labore", href: "/pro-labore", title: "Pró-labore", description: "Sócios e retiradas mensais com INSS e IRRF", icon: <Briefcase className={ICONE} />, categoria: "rh" },
  { id: "distribuicao-lucros", href: "/distribuicao-lucros", title: "Distribuição de lucros", description: "Retiradas de lucro por empresa e sócio, mês a mês ou por trimestre", icon: <Coins className={ICONE} />, categoria: "rh" },
  { id: "decimo-terceiro", href: "/decimo-terceiro", title: "13º salário", description: "Duas parcelas pelos meses trabalhados", icon: <Gift className={ICONE} />, categoria: "rh", skipStats: true, staticLabel: "1ª e 2ª parcela" },
  { id: "ferias", href: "/ferias", title: "Férias", description: "Programação, terço constitucional e abono", icon: <Plane className={ICONE} />, categoria: "rh", skipStats: true, staticLabel: "Programação e recibo" },
  { id: "esocial", href: "/integracoes/esocial", title: "eSocial", description: "Envio e consulta de eventos e lotes", icon: <UserCog className={ICONE} />, categoria: "rh", skipStats: true, staticLabel: "Eventos e lotes" },
  { id: "fgts-digital", href: "/integracoes/fgts-digital", title: "FGTS Digital", description: "Consultas ao FGTS Digital", icon: <PiggyBank className={ICONE} />, categoria: "rh", skipStats: true, staticLabel: "Consultas" },
  // ── Fiscal ──
  { id: "obrigacoes", href: "/obrigacoes", title: "Obrigações", description: "DAS, DCTFWeb, DEFIS, FGTS e outras por competência", icon: <CalendarCheck className={ICONE} />, categoria: "fiscal" },
  { id: "documentos", href: "/documentos", title: "Documentos", description: "Arquivos por cliente com situação de tratamento", icon: <FolderUp className={ICONE} />, categoria: "fiscal" },
  { id: "sessoes-ecac", href: "/sessoes-ecac", title: "Sessões e-CAC", description: "Situação fiscal e pendências na Receita", icon: <ShieldCheck className={ICONE} />, categoria: "fiscal" },
  { id: "receita-federal", href: "/integracoes/receita-federal", title: "Receita Federal", description: "CNPJ, situação fiscal e caixa postal do e-CAC", icon: <Landmark className={ICONE} />, categoria: "fiscal", skipStats: true, staticLabel: "Consultas" },
  { id: "efd-reinf", href: "/integracoes/efd-reinf", title: "EFD-Reinf", description: "R-4000, serviços tomados e retenções", icon: <FileArchive className={ICONE} />, categoria: "fiscal", skipStats: true, staticLabel: "Eventos R-4000" },
  { id: "sped", href: "/integracoes/sped", title: "SPED", description: "Envios SPED", icon: <FileSpreadsheet className={ICONE} />, categoria: "fiscal", skipStats: true, staticLabel: "Envios" },
  { id: "simples-nacional", href: "/integracoes/simples-nacional", title: "Simples Nacional", description: "Integrações PGDAS-D", icon: <Percent className={ICONE} />, categoria: "fiscal", skipStats: true, staticLabel: "PGDAS-D" },
  { id: "redesim", href: "/integracoes/redesim", title: "REDESIM", description: "Integrações REDESIM", icon: <Building className={ICONE} />, categoria: "fiscal", skipStats: true, staticLabel: "Integrações" },
  // ── Financeiro e gestão ──
  { id: "honorarios", href: "/honorarios", title: "Honorários", description: "Faturas do escritório, gerador mensal e recibos", icon: <Wallet className={ICONE} />, categoria: "financeiro" },
  { id: "produtividade", href: "/produtividade", title: "Produtividade", description: "Entregas no prazo, ranking e clientes críticos", icon: <TrendingUp className={ICONE} />, categoria: "financeiro", skipStats: true, staticLabel: "Últimos 30 a 365 dias" },
];

function saudacaoPorHorario(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataExtenso = (d: Date) =>
  `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

type Props = { nome: string; perfil: string | null };

export function HubModulos(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: FUNDO }} />}>
      <HubConteudo {...props} />
    </Suspense>
  );
}

function HubConteudo({ nome, perfil: perfilRaw }: Props) {
  const router = useRouter();
  const c = useSearchParams().get("c");
  const categoriaAtiva = CATEGORIAS.some((x) => x.id === c) ? (c as Categoria) : null;
  const logout = useUserStore((s) => s.logout);
  const { data: cfg } = useConfiguracao();
  const stats = useHubStats();
  const perfil = perfilRaw as Perfil | null;
  const isAdmin = perfil === "Admin";

  // Dentro da categoria, os módulos com mais pendências vêm primeiro.
  const visiveis = CARDS.filter(
    (card) => perfil && perfil !== "Cliente" && (!card.perfis || card.perfis.includes(perfil))
  )
    .map((card, idx) => ({ card, idx, pend: stats.data?.[card.id]?.pendente ?? 0 }))
    .sort((a, b) => b.pend - a.pend || a.idx - b.idx)
    .map((x) => x.card);

  // O layout já manda Cliente para /portal; isto cobre a navegação no cliente.
  useEffect(() => {
    if (perfil === "Cliente") router.replace("/portal");
  }, [perfil, router]);

  // Calculado só no navegador: o relógio do servidor difere e quebraria a hidratação.
  const [saudacao, setSaudacao] = useState("");
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    const d = new Date();
    setSaudacao(saudacaoPorHorario(d));
    setAgora(d);
  }, []);
  const primeiroNome = nome.split(" ")[0] ?? "";

  if (perfil === "Cliente") {
    return <div className="min-h-screen" style={{ background: FUNDO }} />;
  }

  async function sair() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // segue mesmo sem rede
    }
    logout();
    toast.success("Sessão encerrada.");
    router.replace("/login");
  }

  const cats = CATEGORIAS.filter((cat) => visiveis.some((m) => m.categoria === cat.id));
  const clientesAtivos = stats.data?.clientes?.total;
  const diretos: ReactNode[] = [
    <DirectCard key="clientes" href="/clientes" title="Clientes" description="Cadastro completo da carteira: base usada por todos os módulos" icon={<Building2 className={ICONE} />} accent="#0E7490" selo="Cadastro" status={clientesAtivos != null ? `${clientesAtivos} ativo${clientesAtivos !== 1 ? "s" : ""}` : "Todos os módulos"} />,
    <DirectCard key="gestao" href="/gestao" title="Gestão" description="Quadros de tarefas da equipe: espaços, prazos, responsáveis e automações" icon={<KanbanSquare className={ICONE} />} accent="#15803D" selo="Tarefas" status="Uso interno" />,
    <DirectCard key="integracoes" href="/integracoes" title="Integrações" description="Módulos de governo em modo simulado ou real, com histórico de execuções" icon={<PlugZap className={ICONE} />} accent="#475569" selo="Governo" status="Simulado ou real" />,
    ...(isAdmin
      ? [<DirectCard key="logs" href="/logs" title="Logs" description="Auditoria de inclusões, alterações e exclusões" icon={<FileClock className={ICONE} />} accent="#64748B" selo="Auditoria" status="Só administradores" />]
      : []),
  ];
  const total = cats.length + diretos.length;
  const temCards = visiveis.length > 0;
  const nomeEscritorio = cfg?.nome_escritorio || "JSP Contabilidade";
  const labelAtiva = CATEGORIAS.find((x) => x.id === categoriaAtiva)?.label;
  const botaoTopo =
    "flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20";

  return (
    <div className="flex min-h-screen flex-col" style={{ background: FUNDO }}>
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/inicio" className={botaoTopo} title="Voltar à Visão geral">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Visão geral</span>
          </Link>
          {cfg?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cfg.logo_url} alt="Logo" className="h-10 w-auto max-w-[44px] rounded-md bg-white object-contain p-0.5 shadow" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/15 text-white shadow">
              <Landmark className="size-5" />
            </div>
          )}
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="truncate text-sm font-bold text-white">{nomeEscritorio}</p>
            <p className="text-[11px] text-white/70">Contabilidade Personalizada</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nome && (
            <div className="hidden text-right text-white/90 md:block">
              <p className="text-sm font-semibold leading-tight">{nome}</p>
              <p className="text-[11px] leading-tight text-white/60">{perfil}</p>
            </div>
          )}
          {isAdmin && (
            <Link href="/config" className={botaoTopo} title="Usuários, logs e configurações">
              <Settings className="size-4" />
              <span className="hidden sm:inline">Sistema</span>
            </Link>
          )}
          <button type="button" onClick={sair} className={botaoTopo}>
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {saudacao}
            {saudacao && primeiroNome ? `, ${primeiroNome}` : ""}
          </h1>
          <p className="mt-1 text-sm capitalize text-white/70">{agora ? dataExtenso(agora) : null}</p>
          {temCards && (
            <p className="mt-3 text-sm text-white/80 sm:text-base">
              {labelAtiva ?? "Selecione uma área para acessar"}
            </p>
          )}
        </div>

        {!temCards ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white/10 p-6 text-center text-white backdrop-blur">
            <AlertTriangle className="mx-auto size-8 text-amber-300" />
            <p className="mt-3 font-semibold">Sem módulos liberados para sua conta</p>
            <p className="mt-1 text-sm text-white/80">
              Fale com o administrador do escritório para solicitar acesso.
            </p>
          </div>
        ) : categoriaAtiva === null ? (
          <div
            className={cn(
              "grid w-full grid-cols-1 gap-5",
              total === 1 && "max-w-sm",
              total === 2 && "max-w-3xl sm:grid-cols-2",
              total === 3 && "max-w-5xl sm:grid-cols-2 lg:grid-cols-3",
              total >= 4 && "max-w-7xl sm:grid-cols-2 lg:grid-cols-4"
            )}
          >
            {cats.map((cat) => {
              const doCat = visiveis.filter((m) => m.categoria === cat.id);
              const pend = doCat.reduce((s, m) => s + (stats.data?.[m.id]?.pendente ?? 0), 0);
              return (
                <CardBase
                  key={cat.id}
                  as="button"
                  onClick={() => router.push(`/modulos?c=${cat.id}`)}
                  title={cat.label}
                  description={doCat.map((m) => m.title).join(" · ") || cat.descricao}
                  icon={cat.icon}
                  accent={cat.accent}
                >
                  {stats.isLoading ? (
                    <Carregando />
                  ) : (
                    <>
                      <Selo accent={cat.accent}>
                        {doCat.length} módulo{doCat.length !== 1 && "s"}
                      </Selo>
                      {pend > 0 ? (
                        <span className="text-amber-700">
                          <b>{pend}</b> pendente{pend !== 1 && "s"}
                        </span>
                      ) : (
                        <span className="text-gray-500">Tudo em dia</span>
                      )}
                    </>
                  )}
                </CardBase>
              );
            })}
            {diretos}
          </div>
        ) : (
          <div className="w-full max-w-6xl">
            <button
              type="button"
              onClick={() => router.push("/modulos")}
              className="mb-6 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/25"
            >
              <ArrowLeft className="size-4" /> Voltar às categorias
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gold-light/40" />
              <span className="rounded-full border border-gold-light/50 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white/85 backdrop-blur">
                {labelAtiva}
              </span>
              <div className="h-px flex-1 bg-gold-light/40" />
            </div>
            <ModulosDaCategoria
              cards={visiveis.filter((m) => m.categoria === categoriaAtiva)}
              stats={stats.data}
              loading={stats.isLoading}
            />
          </div>
        )}

        <p className="mt-10 text-center text-xs text-white/50">
          © {new Date().getFullYear()} {nomeEscritorio} · Sistemas Internos
          {process.env.NEXT_PUBLIC_APP_VERSION && (
            <span className="ml-2 opacity-60">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          )}
        </p>
      </main>
    </div>
  );
}

function ModulosDaCategoria({
  cards,
  stats,
  loading,
}: {
  cards: HubCardCfg[];
  stats?: Record<string, ModuloStats>;
  loading: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-5",
        cards.length === 1 && "mx-auto max-w-sm grid-cols-1",
        cards.length === 2 && "grid-cols-1 sm:grid-cols-2",
        cards.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {cards.map((card) => (
        <ModuloCard
          key={card.id}
          cfg={card}
          stats={card.skipStats ? undefined : stats?.[card.id]}
          loading={!card.skipStats && loading}
        />
      ))}
    </div>
  );
}

/* ── peças do cartão ─────────────────────────────────────────────── */

function CardBase({
  as = "link",
  href,
  onClick,
  title,
  description,
  icon,
  accent,
  children,
}: {
  as?: "link" | "button";
  href?: string;
  onClick?: () => void;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
  children: ReactNode;
}) {
  const corpo = (
    <>
      <div className="flex items-start gap-4">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-md transition-transform group-hover:scale-105"
          style={{ backgroundColor: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex min-h-[40px] items-center gap-2 border-t border-gray-100 pt-3 text-xs">
        {children}
        <ArrowRight
          className="ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-1"
          style={{ color: accent }}
        />
      </div>
    </>
  );
  const cls =
    "group glass tilt-3d sheen reveal-up flex w-full flex-col gap-4 rounded-2xl p-6 text-left";
  return as === "button" ? (
    <button type="button" onClick={onClick} className={cls}>
      {corpo}
    </button>
  ) : (
    <Link href={href!} className={cls}>
      {corpo}
    </Link>
  );
}

function Selo({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ backgroundColor: accent }}>
      {children}
    </span>
  );
}

function Carregando() {
  return (
    <span className="flex items-center gap-1.5 text-gray-400">
      <Loader2 className="size-3 animate-spin" /> Carregando...
    </span>
  );
}

function DirectCard({
  href,
  title,
  description,
  icon,
  accent,
  selo,
  status,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
  selo: string;
  status: string;
}) {
  return (
    <CardBase href={href} title={title} description={description} icon={icon} accent={accent}>
      <Selo accent={accent}>{selo}</Selo>
      <span className="text-gray-500">{status}</span>
    </CardBase>
  );
}

function ModuloCard({
  cfg,
  stats,
  loading,
}: {
  cfg: HubCardCfg;
  stats?: ModuloStats;
  loading: boolean;
}) {
  const accent = ACCENT[cfg.categoria];
  return (
    <CardBase href={cfg.href} title={cfg.title} description={cfg.description} icon={cfg.icon} accent={accent}>
      {loading ? (
        <Carregando />
      ) : stats ? (
        <>
          <Selo accent={accent}>{stats.total}</Selo>
          <span className="text-gray-500">
            {stats.pendente > 0 && (
              <>
                <b className="text-amber-700">{stats.pendente}</b> pendente{stats.pendente !== 1 && "s"}
              </>
            )}
            {stats.pendente === 0 && stats.recente > 0 && (
              <>
                {stats.recente} novo{stats.recente !== 1 && "s"} (30d)
              </>
            )}
            {stats.pendente === 0 &&
              stats.recente === 0 &&
              (stats.total === 0 ? <i>Nenhum registro ainda</i> : "Tudo em dia")}
          </span>
        </>
      ) : cfg.staticLabel ? (
        <span className="font-medium" style={{ color: accent }}>
          {cfg.staticLabel}
        </span>
      ) : (
        <span className="italic text-gray-400">Abrir módulo</span>
      )}
    </CardBase>
  );
}

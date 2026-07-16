// Tipos do Módulo Gestão (Fase 1+2).
// Espelham as tabelas gestao_* criadas nas migrations 26 + 27.

export type GestaoNivel = "view" | "comment" | "edit" | "full";
export type GestaoRecurso = "space" | "folder" | "list" | "task";
export type GestaoPapel = "owner" | "admin" | "membro";
export type PrioridadeTarefa = "Baixa" | "Media" | "Alta" | "Urgente";
export type TipoStatus = "nao_iniciado" | "ativo" | "concluido";
export type VistaGestao = "quadro" | "lista" | "calendario" | "timeline" | "painel";
export type AgruparPor = "status" | "responsavel" | "prioridade" | "etiqueta";

export const VISTAS: VistaGestao[] = ["quadro", "lista", "calendario", "timeline", "painel"];
export const VISTAS_LABEL: Record<VistaGestao, string> = {
  quadro: "Kanban",
  lista: "Lista",
  calendario: "Calendário",
  timeline: "Timeline",
  painel: "Painel",
};

export type FiltrosGestao = {
  responsavel?: string;
  prioridade?: PrioridadeTarefa;
  status?: string;
  etiquetas?: string[];
  prazo?: "atrasadas" | "hoje" | "semana" | "sem-prazo";
  busca?: string;
};

export const FILTRO_VAZIO: FiltrosGestao = {};

export function contarFiltros(f: FiltrosGestao): number {
  let n = 0;
  if (f.responsavel) n++;
  if (f.prioridade) n++;
  if (f.status) n++;
  if (f.etiquetas && f.etiquetas.length > 0) n++;
  if (f.prazo) n++;
  if (f.busca && f.busca.trim()) n++;
  return n;
}

// Aplica filtro em memória (usado pelas vistas que já receberam todos os dados)
export function filtrarTarefas(
  tarefas: GestaoTarefa[],
  f: FiltrosGestao
): GestaoTarefa[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const semana = new Date();
  semana.setDate(semana.getDate() + 7);
  const semanaIso = semana.toISOString().slice(0, 10);
  const busca = f.busca?.trim().toLowerCase() ?? "";

  return tarefas.filter((t) => {
    if (f.responsavel && (t.responsavel ?? "").toLowerCase() !== f.responsavel.toLowerCase())
      return false;
    if (f.prioridade && t.prioridade !== f.prioridade) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.etiquetas && f.etiquetas.length > 0) {
      const tem = f.etiquetas.some((e) => t.etiquetas.includes(e));
      if (!tem) return false;
    }
    if (f.prazo) {
      if (f.prazo === "sem-prazo" && t.prazo) return false;
      if (f.prazo === "hoje" && t.prazo !== hoje) return false;
      if (f.prazo === "atrasadas" && (!t.prazo || t.prazo >= hoje)) return false;
      if (f.prazo === "semana" && (!t.prazo || t.prazo < hoje || t.prazo > semanaIso))
        return false;
    }
    if (busca) {
      const alvo = [
        t.titulo,
        t.descricao ?? "",
        (t.etiquetas ?? []).join(" "),
        t.responsavel ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

export const PRIORIDADES: PrioridadeTarefa[] = [
  "Baixa",
  "Media",
  "Alta",
  "Urgente",
];

export const CORES_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  Baixa: "bg-gray-200 text-gray-700",
  Media: "bg-blue-100 text-blue-700",
  Alta: "bg-amber-100 text-amber-800",
  Urgente: "bg-red-100 text-red-alert",
};

export type Subtarefa = {
  id: string;
  titulo: string;
  concluida: boolean;
};

export type Recorrencia = {
  tipo: "diaria" | "semanal" | "mensal" | "anual";
  intervalo: number;
  proxima_geracao?: string;
};

export type GestaoEspaco = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  created_at: string;
  updated_at: string;
};

export type GestaoPasta = {
  id: string;
  id_espaco: string;
  nome: string;
  ordem: number;
  created_at: string;
  updated_at: string;
};

export type GestaoQuadro = {
  id_quadro: string;
  nome: string;
  descricao: string | null;
  id_espaco: string | null;
  id_pasta: string | null;
  ordem: number;
  ics_token: string | null;
  restrito: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GestaoStatus = {
  id: string;
  id_quadro: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  tipo: TipoStatus;
};

export type GestaoTarefa = {
  id_tarefa: string;
  id_quadro: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: PrioridadeTarefa;
  responsavel: string | null;
  data_inicio: string | null;
  prazo: string | null;
  ordem: number;
  etiquetas: string[];
  subtarefas: Subtarefa[];
  campos: Record<string, unknown>;
  recorrencia: Recorrencia | null;
  pontos: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TipoCampo =
  | "texto"
  | "numero"
  | "data"
  | "selecao"
  | "multi"
  | "checkbox"
  | "moeda"
  | "url";

export const TIPOS_CAMPO_LABEL: Record<TipoCampo, string> = {
  texto: "Texto curto",
  numero: "Número",
  data: "Data",
  selecao: "Seleção única",
  multi: "Seleção múltipla",
  checkbox: "Sim/Não",
  moeda: "Valor (R$)",
  url: "Link",
};

export type GestaoCampo = {
  id: string;
  id_quadro: string;
  nome: string;
  tipo: TipoCampo;
  opcoes: string[];
  ordem: number;
  visivel_cliente: boolean;
  created_at: string;
};

export type GestaoEtiqueta = {
  id: string;
  id_quadro: string;
  nome: string;
  cor: string;
  ordem: number;
  created_at: string;
};

export const CORES_ETIQUETA = [
  "#94a3b8",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export type GestaoComentario = {
  id_comentario: string;
  id_tarefa: string;
  autor: string;
  texto: string;
  created_at: string;
};

export type GestaoAnexo = {
  id: string;
  id_tarefa: string;
  nome: string;
  storage_path: string;
  mime: string | null;
  tamanho_bytes: number | null;
  created_by: string | null;
  created_at: string;
};

// Extrai emails mencionados com @ no texto (pra notificação futura)
export function detectarMencoes(texto: string): string[] {
  const re = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    set.add(m[1].toLowerCase());
  }
  return Array.from(set);
}

export function formatarBytes(b: number | null | undefined): string {
  if (b == null || b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
  return `${(b / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export type GestaoNotificacao = {
  id: string;
  destinatario: string;
  tipo: "atribuicao" | "comentario" | "mencao" | "status" | "prazo";
  titulo: string;
  id_tarefa: string | null;
  id_quadro: string | null;
  lida: boolean;
  canal: string;
  email_enviado: boolean;
  created_at: string;
};

export type GestaoTempo = {
  id: string;
  id_tarefa: string;
  usuario_email: string;
  inicio: string;
  fim: string | null;
  segundos: number | null;
  manual: boolean;
  descricao: string | null;
  created_at: string;
};

export type GestaoDependencia = {
  id: string;
  id_tarefa: string;
  depende_de: string;
  created_at: string;
};

export type GestaoAtividade = {
  id: string;
  ator: string | null;
  acao: string;
  id_tarefa: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export function formatarDuracao(seg: number | null | undefined): string {
  if (!seg || seg <= 0) return "0min";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  return `${m}min`;
}

export function totalSegundos(regs: GestaoTempo[]): number {
  let s = 0;
  const agora = Date.now();
  for (const r of regs) {
    if (r.fim && r.segundos != null) s += r.segundos;
    else if (!r.fim && r.inicio) {
      s += Math.floor((agora - new Date(r.inicio).getTime()) / 1000);
    }
  }
  return s;
}

export type GatilhoAutomacao =
  | "status_muda"
  | "tarefa_criada"
  | "prazo_proximo"
  | "prazo_vencido";

export type AcaoAutomacaoTipo =
  | "mover_status"
  | "definir_responsavel"
  | "definir_prioridade"
  | "definir_campo"
  | "notificar";

export const GATILHOS_LABEL: Record<GatilhoAutomacao, string> = {
  status_muda: "Quando o status mudar",
  tarefa_criada: "Quando uma tarefa é criada",
  prazo_proximo: "Quando faltar N dias pro prazo",
  prazo_vencido: "Quando o prazo vencer",
};

export const ACOES_LABEL: Record<AcaoAutomacaoTipo, string> = {
  mover_status: "Mover pra status",
  definir_responsavel: "Definir responsável",
  definir_prioridade: "Definir prioridade",
  definir_campo: "Definir campo personalizado",
  notificar: "Enviar notificação",
};

export type GestaoAutomacao = {
  id: string;
  id_quadro: string;
  nome: string;
  ativo: boolean;
  gatilho: GatilhoAutomacao;
  condicao: Record<string, unknown>;
  acao: {
    tipo: AcaoAutomacaoTipo;
    valor?: unknown;
    para?: string;
    mensagem?: string;
  };
  ordem: number;
  created_at: string;
};

export type PerguntaFormulario = {
  id: string;
  label: string;
  tipo: "texto" | "textarea" | "email" | "selecao";
  obrigatoria: boolean;
  opcoes?: string[];
};

export type GestaoFormulario = {
  id: string;
  id_quadro: string;
  titulo: string;
  descricao: string | null;
  token: string;
  ativo: boolean;
  mostra_descricao: boolean;
  mostra_prazo: boolean;
  mostra_prioridade: boolean;
  prioridade_padrao: PrioridadeTarefa;
  status_inicial: string | null;
  responsavel_padrao: string | null;
  etiquetas_padrao: string[];
  perguntas: PerguntaFormulario[];
  created_by: string | null;
  created_at: string;
};

export function novoToken(bytes = 12): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type GestaoMembro = {
  id: string;
  usuario_email: string;
  papel: GestaoPapel;
  ativo: boolean;
  adicionado_por: string | null;
  created_at: string;
};

// Iniciais pra avatar (2 primeiras letras do email antes do @)
export function iniciais(email: string | null | undefined): string {
  if (!email) return "?";
  const nome = email.split("@")[0];
  return nome.slice(0, 2).toUpperCase();
}

// Cor determinística baseada no email (pra avatar)
const CORES_AVATAR = [
  "#2A6B4E",
  "#B45838",
  "#4A6B7B",
  "#8B6A2F",
  "#7A3B7B",
  "#3F4A7B",
];

export function corAvatar(email: string | null | undefined): string {
  if (!email) return "#94a3b8";
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  return CORES_AVATAR[Math.abs(hash) % CORES_AVATAR.length];
}

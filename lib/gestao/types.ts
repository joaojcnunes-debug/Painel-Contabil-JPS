// Tipos do Módulo Gestão (Fase 1+2).
// Espelham as tabelas gestao_* criadas nas migrations 26 + 27.

export type GestaoNivel = "view" | "comment" | "edit" | "full";
export type GestaoRecurso = "space" | "folder" | "list" | "task";
export type GestaoPapel = "owner" | "admin" | "membro";
export type PrioridadeTarefa = "Baixa" | "Media" | "Alta" | "Urgente";
export type TipoStatus = "nao_iniciado" | "ativo" | "concluido";
export type VistaGestao = "quadro" | "lista" | "calendario" | "timeline";
export type AgruparPor = "status" | "responsavel" | "prioridade" | "etiqueta";

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

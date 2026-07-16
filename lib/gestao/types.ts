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

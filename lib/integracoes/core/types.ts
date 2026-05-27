// Tipos compartilhados de todas as integrações governamentais.

import type { ModuloIntegracao, ModoIntegracao } from "@/lib/supabase/types";

export type Pendencia = {
  tipo: string;                          // ex: "Débito DCTFWeb"
  competencia?: string;                  // YYYY-MM
  descricao?: string;
  valor?: number;
  vencimento?: string;
  url?: string;
};

export type Certidao = {
  tipo: string;                          // "CND", "CPF Regular", etc
  situacao: "REGULAR" | "PENDENTE" | "NEGATIVA" | "POSITIVA_COM_EFEITOS";
  emissao?: string;
  validade?: string;
};

// Resposta padronizada que TODA integração devolve.
// Garante UI consistente independente do módulo.
export type RespostaIntegracao = {
  modulo: ModuloIntegracao;
  acao: string;
  modo: ModoIntegracao;
  ok: boolean;
  duracaoMs: number;
  // Resumos (campos opcionais — cada módulo preenche o que tem)
  pendencias?: Pendencia[];
  certidoes?: Certidao[];
  documentos?: Array<{ nome: string; url?: string; tipo?: string }>;
  mensagens?: string[];                  // avisos não-erro
  dados?: Record<string, unknown>;       // payload livre
  erro?: {
    codigo: string;
    mensagem: string;
  };
};

// Metadata estática de cada módulo (pra render do painel)
export type ModuloMeta = {
  id: ModuloIntegracao;
  nome: string;                          // "Receita Federal / e-CAC"
  curto: string;                         // "RF/e-CAC"
  descricao: string;
  cor: string;                           // classes Tailwind do card
  slug?: string;                         // se houver tela dedicada (/integracoes/<slug>)
  acoes: Array<{ id: string; label: string; descricao?: string }>;
};

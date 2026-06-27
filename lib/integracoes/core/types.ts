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
export type AcaoMeta = {
  id: string;
  label: string;
  descricao?: string;
  // Se true, executar essa ação em modo REAL realmente funciona
  // (conector plugado no lib/integracoes/core/client.ts OU existe fluxo
  // dedicado em /integracoes/<slug>).
  // Se false/undefined, modo REAL retorna erro com motivo específico.
  temReal?: boolean;
  // Se true, esta ação SÓ pode rodar via fluxo dedicado (página própria do
  // módulo) porque exige upload de cert A1 + senha que não persistem.
  // O botão "Consultar" no card redireciona pro slug em vez de chamar API.
  requerFluxoDedicado?: boolean;
};

export type ModuloMeta = {
  id: ModuloIntegracao;
  nome: string;                          // "Receita Federal / e-CAC"
  curto: string;                         // "RF/e-CAC"
  descricao: string;
  cor: string;                           // classes Tailwind do card
  slug?: string;                         // se houver tela dedicada (/integracoes/<slug>)
  acoes: AcaoMeta[];
};

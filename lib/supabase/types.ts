// Tipos do domínio do Painel Contábil. Reflete o schema em `supabase/schema.sql`.

export type PerfilUsuario = "Admin" | "Contador" | "Assistente" | "Cliente";

export interface Usuario {
  id_usuario: string;            // pk (uuid do auth.users)
  email: string;
  nome: string;
  perfil: PerfilUsuario;
  id_cliente: string | null;     // só preenche quando perfil = Cliente
  ativo: boolean;
  created_at: string;
}

export type RegimeTributario =
  | "SIMPLES_NACIONAL"
  | "LUCRO_PRESUMIDO"
  | "LUCRO_REAL"
  | "MEI"
  | "DOMESTICO"
  | "PRODUTOR_RURAL";

export type StatusCliente = "Ativo" | "Inativo" | "Suspenso";

export type TipoCadastro = "PJ" | "PF";

export interface Cliente {
  id_cliente: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo_cadastro: TipoCadastro;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  regime: RegimeTributario;
  atividade_principal: string | null;
  inicio_contrato: string | null;
  status: StatusCliente;
  honorario_mensal: number | null;
  dia_vencimento: number | null;
  // Endereço
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  estado: string | null;
  // Responsável legal
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  responsavel_email: string | null;
  responsavel_telefone: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClienteContato {
  id_contato: string;
  id_cliente: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
}

export type Periodicidade =
  | "MENSAL"
  | "TRIMESTRAL"
  | "ANUAL"
  | "EVENTUAL";

export interface ObrigacaoCatalogo {
  id_obrigacao_catalogo: string;
  sigla: string;          // DCTF, DAS, SPED, etc
  nome: string;
  esfera: "FEDERAL" | "ESTADUAL" | "MUNICIPAL" | "TRABALHISTA";
  periodicidade: Periodicidade;
  dia_vencimento_padrao: number | null;
  descricao: string | null;
  ativo: boolean;
}

export type StatusObrigacao =
  | "PENDENTE"
  | "EM_ANDAMENTO"
  | "ENTREGUE"
  | "ATRASADA"
  | "DISPENSADA";

export interface Obrigacao {
  id_obrigacao: string;
  id_cliente: string;
  id_obrigacao_catalogo: string;
  competencia: string;     // YYYY-MM
  data_vencimento: string; // YYYY-MM-DD
  data_entrega: string | null;
  status: StatusObrigacao;
  responsavel: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export type StatusDocumento =
  | "RECEBIDO"
  | "EM_ANALISE"
  | "PROCESSADO"
  | "DEVOLVIDO";

export type OrigemDocumento = "CLIENTE" | "CONTABILIDADE";

export interface Documento {
  id_documento: string;
  id_cliente: string;
  tipo: string;             // NF entrada, NF saída, extrato, folha, etc
  descricao: string | null;
  competencia: string | null;
  arquivo_path: string;     // path no bucket Storage
  arquivo_nome: string;
  tamanho_bytes: number | null;
  status: StatusDocumento;
  origem: OrigemDocumento;
  enviado_por: string | null;     // id_usuario que subiu
  created_at: string;
}

export type StatusFatura = "ABERTA" | "PAGA" | "ATRASADA" | "CANCELADA";

export interface Fatura {
  id_fatura: string;
  id_cliente: string;
  competencia: string;        // YYYY-MM
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: StatusFatura;
  descricao: string | null;
  created_at: string;
  updated_at: string | null;
}

// Configuracoes — singleton (id sempre = 1)
export interface Configuracao {
  id: number;
  nome_escritorio: string;
  razao_social: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  dia_padrao_fechamento: number;
  logo_url: string | null;
  mensagem_login: string | null;
  updated_at: string | null;
}

// ─── Database (typed Supabase generic) ──────────────────────────────────────
// Mesmo padrão do painel-sst: TableShape com Insert: Partial<T> + Relationships: [].
// O Insert tipa-se como `never[]` em alguns casos — usar `payload as never` no
// call site quando isso aparecer (workaround intencional, não tentar refatorar).
type TableShape<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      usuarios: TableShape<Usuario>;
      clientes: TableShape<Cliente>;
      clientes_contatos: TableShape<ClienteContato>;
      obrigacoes_catalogo: TableShape<ObrigacaoCatalogo>;
      obrigacoes: TableShape<Obrigacao>;
      documentos: TableShape<Documento>;
      faturas: TableShape<Fatura>;
      configuracoes: TableShape<Configuracao>;
    };
  };
}

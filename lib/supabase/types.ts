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

export type AnexoSimplesDb = "I" | "II" | "III" | "IV" | "V";

export interface Cliente {
  id_cliente: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo_cadastro: TipoCadastro;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  regime: RegimeTributario;
  anexo_simples: AnexoSimplesDb | null;
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

export type TipoLancamento = "RECEITA" | "DESPESA";

export interface PlanoConta {
  id_conta: string;
  codigo: string;
  nome: string;
  tipo: TipoLancamento;
  grupo: string | null;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Lancamento {
  id_lancamento: string;
  id_cliente: string;
  id_conta: string;
  data_lancamento: string;
  competencia: string | null;
  tipo: TipoLancamento;
  valor: number;
  descricao: string;
  documento_ref: string | null;
  observacoes: string | null;
  id_documento: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BancoMovimento {
  id_movimento: string;
  id_cliente: string;
  data_movimento: string;
  descricao: string;
  valor: number;
  banco: string | null;
  conta_bancaria: string | null;
  conciliado: boolean;
  id_lancamento: string | null;
  ignorado: boolean;
  motivo_ignorado: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LancamentoModelo {
  id_modelo: string;
  id_cliente: string;
  id_conta: string;
  tipo: TipoLancamento;
  valor: number;
  dia_mes: number;
  descricao: string;
  documento_ref: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
}

export type TipoFuncionario = "CLT" | "ESTAGIARIO" | "JOVEM_APRENDIZ" | "AUTONOMO";
export type StatusFuncionario = "ATIVO" | "AFASTADO" | "DEMITIDO";

export interface Funcionario {
  id_funcionario: string;
  id_cliente: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  data_admissao: string;
  data_demissao: string | null;
  cargo: string | null;
  tipo: TipoFuncionario;
  salario_base: number;
  dependentes: number;
  vale_transporte: boolean;
  valor_vt: number | null;
  valor_va: number | null;
  plano_saude_desc: number | null;
  status: StatusFuncionario;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export type StatusFolha = "ABERTA" | "FECHADA";

export interface FolhaPagamento {
  id_folha: string;
  id_cliente: string;
  competencia: string;             // YYYY-MM
  total_proventos: number;
  total_descontos: number;
  total_liquido: number;
  total_inss_patronal: number;
  total_fgts: number;
  status: StatusFolha;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FolhaItem {
  id_item: string;
  id_folha: string;
  id_funcionario: string;
  nome_func: string;
  cargo_func: string | null;
  salario_base: number;
  horas_extras: number;
  adicional_noturno: number;
  outros_proventos: number;
  desc_faltas: number;
  desc_adiantamento: number;
  desc_outros: number;
  base_inss: number;
  inss: number;
  base_irrf: number;
  irrf: number;
  vale_transporte: number;
  plano_saude: number;
  total_proventos: number;
  total_descontos: number;
  liquido: number;
  inss_patronal: number;
  fgts: number;
  observacoes: string | null;
}

export type TipoNFe = "ENTRADA" | "SAIDA";
export type StatusNFe = "IMPORTADA" | "PROCESSADA" | "CANCELADA";

export interface NotaFiscal {
  id_nota: string;
  chave: string;
  id_cliente: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  natureza_operacao: string | null;
  tipo: TipoNFe;
  emit_cnpj: string | null;
  emit_nome: string | null;
  emit_uf: string | null;
  dest_cnpj: string | null;
  dest_nome: string | null;
  valor_produtos: number;
  valor_desconto: number;
  valor_frete: number;
  valor_icms: number;
  valor_ipi: number;
  valor_pis: number;
  valor_cofins: number;
  valor_total: number;
  itens: unknown;
  id_documento: string | null;
  id_lancamento: string | null;
  status: StatusNFe;
  observacoes: string | null;
  imported_by: string | null;
  created_at: string;
}

export type StatusDecimo =
  | "PENDENTE"
  | "PRIMEIRA_PAGA"
  | "SEGUNDA_PAGA"
  | "QUITADO";

export interface DecimoTerceiro {
  id_decimo: string;
  id_funcionario: string;
  id_cliente: string;
  ano: number;
  nome_func: string;
  cargo_func: string | null;
  cpf_func: string | null;
  salario_base: number;
  media_variaveis: number;
  meses_trabalhados: number;
  valor_integral: number;
  valor_primeira: number;
  data_primeira: string | null;
  base_inss: number;
  inss: number;
  base_irrf: number;
  irrf: number;
  outros_descontos: number;
  valor_segunda: number;
  data_segunda: string | null;
  liquido_total: number;
  fgts: number;
  status: StatusDecimo;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export type StatusSocio = "ATIVO" | "INATIVO";

export interface Socio {
  id_socio: string;
  id_cliente: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  data_entrada: string;
  data_saida: string | null;
  participacao_pct: number | null;
  pro_labore_mensal: number;
  dependentes: number;
  status: StatusSocio;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ProLaborePagamento {
  id_pagamento: string;
  id_socio: string;
  id_cliente: string;
  competencia: string;
  nome_socio: string;
  cpf_socio: string | null;
  valor_pro_labore: number;
  inss: number;
  base_irrf: number;
  irrf: number;
  outros_descontos: number;
  liquido: number;
  data_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ApuracaoSimples {
  id_apuracao: string;
  id_cliente: string;
  competencia: string;            // YYYY-MM
  anexo: AnexoSimplesDb;
  receita_mes: number;
  rbt12: number;
  faixa: number;
  aliquota_nominal: number;
  parcela_deduzir: number;
  aliquota_efetiva: number;
  valor_das: number;
  observacoes: string | null;
  created_at: string;
}

export interface ObrigacaoComentario {
  id_comentario: string;
  id_obrigacao: string;
  autor_email: string;
  autor_nome: string;
  autor_perfil: string | null;
  texto: string;
  created_at: string;
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
      obrigacoes_comentarios: TableShape<ObrigacaoComentario>;
      plano_contas: TableShape<PlanoConta>;
      lancamentos: TableShape<Lancamento>;
      lancamentos_modelos: TableShape<LancamentoModelo>;
      banco_movimentos: TableShape<BancoMovimento>;
      apuracoes_simples: TableShape<ApuracaoSimples>;
      funcionarios: TableShape<Funcionario>;
      folhas_pagamento: TableShape<FolhaPagamento>;
      folha_itens: TableShape<FolhaItem>;
      socios: TableShape<Socio>;
      pro_labore_pagamentos: TableShape<ProLaborePagamento>;
      decimos_terceiros: TableShape<DecimoTerceiro>;
      notas_fiscais: TableShape<NotaFiscal>;
    };
  };
}

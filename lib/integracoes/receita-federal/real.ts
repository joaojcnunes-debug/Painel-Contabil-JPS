// Conector REAL Receita Federal — começa com BrasilAPI (gratuito, sem cert).
//
// BrasilAPI consolida dados públicos da Receita: situação cadastral,
// CNAEs, endereço, sócios, capital social. NÃO retorna débitos nem
// pendências fiscais (isso só via e-CAC com certificado).
//
// Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
// Sem auth. Limite generoso (~3 req/s por IP).
//
// Se precisar de pendências reais no futuro:
// - Migrate / Conexa (SaaS pagos)
// - RPA via Playwright (alto risco/manutenção)

import type { RespostaIntegracao } from "../core/types";

const BRASILAPI_BASE = "https://brasilapi.com.br/api";

type BrasilApiCnpj = {
  cnpj: string;
  identificador_matriz_filial: number;
  descricao_identificador_matriz_filial: string;
  razao_social: string;
  nome_fantasia: string | null;
  situacao_cadastral: number;
  descricao_situacao_cadastral: string;
  data_situacao_cadastral: string;
  motivo_situacao_cadastral: number;
  natureza_juridica: string;
  data_inicio_atividade: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  cnaes_secundarios: Array<{ codigo: number; descricao: string }>;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string;
  uf: string;
  cep: string | null;
  ddd_telefone_1: string | null;
  email: string | null;
  qsa: Array<{
    identificador_de_socio: number;
    nome_socio: string;
    qualificacao_socio: string;
    data_entrada_sociedade: string;
  }>;
  capital_social: number;
  porte: string;
  opcao_pelo_simples: boolean | null;
  data_opcao_pelo_simples: string | null;
  opcao_pelo_mei: boolean | null;
  data_opcao_pelo_mei: string | null;
};

export async function consultarCnpjBrasilApi(
  cnpj: string | null
): Promise<RespostaIntegracao> {
  const base: RespostaIntegracao = {
    modulo: "RECEITA_FEDERAL",
    acao: "consultar_cnpj_brasilapi",
    modo: "REAL",
    ok: false,
    duracaoMs: 0,
  };

  if (!cnpj) {
    return {
      ...base,
      erro: {
        codigo: "CNPJ_NAO_INFORMADO",
        mensagem:
          "Esta empresa não tem CNPJ cadastrado. Adicione o CNPJ nos dados da empresa pra consultar a Receita.",
      },
    };
  }

  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) {
    return {
      ...base,
      erro: {
        codigo: "CNPJ_INVALIDO",
        mensagem: `CNPJ deve ter 14 dígitos (recebido ${clean.length}).`,
      },
    };
  }

  try {
    const res = await fetch(`${BRASILAPI_BASE}/cnpj/v1/${clean}`, {
      headers: { Accept: "application/json" },
      // BrasilAPI não exige user-agent específico
    });

    if (res.status === 404) {
      return {
        ...base,
        erro: {
          codigo: "CNPJ_NAO_ENCONTRADO",
          mensagem:
            "CNPJ não encontrado na Receita Federal. Confira se está correto.",
        },
      };
    }

    if (!res.ok) {
      return {
        ...base,
        erro: {
          codigo: `HTTP_${res.status}`,
          mensagem: `BrasilAPI retornou status ${res.status}.`,
        },
      };
    }

    const data = (await res.json()) as BrasilApiCnpj;

    const ativa = data.descricao_situacao_cadastral.toUpperCase() === "ATIVA";

    return {
      ...base,
      ok: true,
      dados: {
        // Identificação
        cnpj: clean,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia,
        natureza_juridica: data.natureza_juridica,
        porte: data.porte,
        // Situação
        situacao_cadastral: data.descricao_situacao_cadastral,
        data_situacao: data.data_situacao_cadastral,
        motivo_situacao: data.motivo_situacao_cadastral,
        data_inicio_atividade: data.data_inicio_atividade,
        // Regime tributário (info pública da Receita)
        optante_simples: data.opcao_pelo_simples,
        data_opcao_simples: data.data_opcao_pelo_simples,
        optante_mei: data.opcao_pelo_mei,
        data_opcao_mei: data.data_opcao_pelo_mei,
        // CNAEs
        cnae_principal: {
          codigo: data.cnae_fiscal,
          descricao: data.cnae_fiscal_descricao,
        },
        cnaes_secundarios: data.cnaes_secundarios,
        // Endereço
        endereco: {
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          cep: data.cep,
        },
        // Contato
        telefone: data.ddd_telefone_1,
        email: data.email,
        // Capital social
        capital_social: data.capital_social,
        // QSA (sócios)
        qsa: data.qsa,
        // Matriz/Filial
        matriz_filial: data.descricao_identificador_matriz_filial,
      },
      mensagens: [
        ativa
          ? `${data.razao_social} — situação ATIVA na Receita Federal desde ${data.data_situacao_cadastral}.`
          : `ATENÇÃO: situação cadastral ${data.descricao_situacao_cadastral} desde ${data.data_situacao_cadastral}.`,
        data.opcao_pelo_simples
          ? `Optante pelo Simples Nacional desde ${data.data_opcao_pelo_simples}.`
          : "Não optante pelo Simples Nacional.",
        "Dados consultados via BrasilAPI (cache RFB ~24h). Não inclui débitos.",
      ],
    };
  } catch (e) {
    return {
      ...base,
      erro: {
        codigo: "ERRO_REDE",
        mensagem: `Falha ao conectar BrasilAPI: ${(e as Error).message}`,
      },
    };
  }
}

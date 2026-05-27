// Simulador de integrações governamentais.
//
// Gera respostas determinísticas baseadas no CNPJ do cliente — assim,
// o mesmo CNPJ sempre vê a mesma "situação fiscal", facilitando teste
// de UI. Cobre os 10 módulos com pendências realistas.

import type { ModuloIntegracao } from "@/lib/supabase/types";
import type { Pendencia, RespostaIntegracao } from "../core/types";
import { delaySimulado } from "../core/modo";

type ExecParams = {
  modulo: ModuloIntegracao;
  acao: string;
  cnpjCliente: string | null;
  params: Record<string, unknown>;
};

// Hash simples e estável a partir do CNPJ pra gerar respostas
// determinísticas (mesmo CNPJ → mesma "realidade").
function hash(s: string | null): number {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function competenciaAnterior(meses = 1): string {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isoDataAhead(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function executarSimulado(
  p: ExecParams
): Promise<RespostaIntegracao> {
  await delaySimulado(400 + (hash(p.cnpjCliente) % 600));
  const seed = hash(p.cnpjCliente);

  const base: RespostaIntegracao = {
    modulo: p.modulo,
    acao: p.acao,
    modo: "SIMULADO",
    ok: true,
    duracaoMs: 0,
  };

  // 5% de chance simulada de erro pra testar UI de falha
  if (seed % 20 === 0 && p.acao.startsWith("enviar")) {
    return {
      ...base,
      ok: false,
      erro: {
        codigo: "WS_TIMEOUT_SIMULADO",
        mensagem:
          "Webservice indisponível no momento (simulação). Tente novamente em alguns minutos.",
      },
    };
  }

  switch (p.modulo) {
    case "RECEITA_FEDERAL":
      return rfMock(base, seed, p.acao);
    case "ESOCIAL":
      return esocialMock(base, seed, p.acao);
    case "EFD_REINF":
      return reinfMock(base, seed, p.acao);
    case "SPED":
      return spedMock(base, seed, p.acao);
    case "NOTAS_FISCAIS":
      return notasMock(base, seed, p.acao);
    case "SIMPLES_NACIONAL":
      return snMock(base, seed, p.acao);
    case "FGTS_DIGITAL":
      return fgtsMock(base, seed, p.acao);
    case "PREFEITURAS":
      return prefMock(base, seed, p.acao);
    case "REDESIM":
      return redesimMock(base, seed, p.acao);
    case "CERTIFICADO_DIGITAL":
      return certMock(base, seed, p.acao);
  }
}

// ─── Mocks por módulo ────────────────────────────────────────

function rfMock(
  base: RespostaIntegracao,
  seed: number,
  acao: string
): RespostaIntegracao {
  // Pendências base — usadas em "pendencias" e "situação fiscal"
  const pendencias: Pendencia[] = [];
  if (seed % 3 === 0) {
    pendencias.push({
      tipo: "DCTFWeb pendente",
      competencia: competenciaAnterior(1),
      descricao: "Declaração não transmitida",
    });
  }
  if (seed % 5 === 0) {
    pendencias.push({
      tipo: "Débito em aberto",
      descricao: "DARF 0220 — IRRF",
      valor: 1234.56 + (seed % 1000),
      vencimento: isoDataAhead(15),
    });
  }
  if (seed % 11 === 0) {
    pendencias.push({
      tipo: "Compensação pendente",
      descricao: "PER/DCOMP nº 1234.5678.9012 aguardando análise",
    });
  }

  const situacaoFiscal = pendencias.length === 0 ? "REGULAR" : "PENDENTE";

  if (acao === "emitir_certidao") {
    return {
      ...base,
      certidoes: [
        {
          tipo: situacaoFiscal === "REGULAR" ? "CND" : "CPEN",
          situacao:
            situacaoFiscal === "REGULAR" ? "REGULAR" : "POSITIVA_COM_EFEITOS",
          emissao: new Date().toISOString().slice(0, 10),
          validade: isoDataAhead(180),
        },
      ],
      dados: {
        codigo_controle: `${(seed % 9000) + 1000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}`,
      },
      mensagens: [
        situacaoFiscal === "REGULAR"
          ? "Certidão NEGATIVA de débitos emitida (válida 180 dias)."
          : "Certidão POSITIVA COM EFEITOS DE NEGATIVA emitida.",
      ],
    };
  }

  if (acao === "consultar_dctfweb") {
    // Últimas 6 competências
    const declaracoes = [];
    for (let i = 0; i < 6; i++) {
      const comp = competenciaAnterior(i);
      const status =
        i === 1 && seed % 3 === 0
          ? "PENDENTE"
          : i === 0
          ? "EM_EDICAO"
          : "TRANSMITIDA";
      declaracoes.push({
        competencia: comp,
        status,
        valor: 4500 + ((seed * (i + 1)) % 8000),
        data_transmissao:
          status === "TRANSMITIDA" ? isoDataAhead(-(i * 30 + 5)) : null,
        recibo:
          status === "TRANSMITIDA"
            ? `1.21.${comp.replace("-", ".")}.${(seed % 9000) + 1000}`
            : null,
      });
    }
    return {
      ...base,
      dados: { declaracoes },
      mensagens: [`${declaracoes.length} competências analisadas.`],
    };
  }

  if (acao === "consultar_caixa_postal") {
    const naoLidas = seed % 4;
    const mensagens = [
      {
        data: isoDataAhead(-2),
        assunto: "Confirmação de transmissão DCTFWeb",
        remetente: "Receita Federal",
        lida: true,
      },
      {
        data: isoDataAhead(-7),
        assunto: "Aviso de débito vencendo",
        remetente: "PGFN",
        lida: naoLidas < 2,
      },
      {
        data: isoDataAhead(-15),
        assunto: "Demonstrativo de parcelamento",
        remetente: "Receita Federal",
        lida: naoLidas < 3,
      },
    ];
    return {
      ...base,
      dados: { mensagens, nao_lidas: mensagens.filter((m) => !m.lida).length },
      mensagens:
        naoLidas > 0
          ? [`${naoLidas} mensagem(ns) não lida(s) na caixa postal e-CAC.`]
          : ["Nenhuma mensagem nova."],
    };
  }

  if (acao === "consultar_situacao_fiscal") {
    return {
      ...base,
      pendencias,
      dados: {
        situacao_fiscal: situacaoFiscal,
        cnpj_situacao: "ATIVA",
        motivos_pendencia:
          pendencias.length > 0
            ? pendencias.map((p) => p.tipo)
            : [],
        ultima_consulta: new Date().toISOString(),
      },
      mensagens:
        situacaoFiscal === "REGULAR"
          ? ["Sem pendências. Apta a obter CND."]
          : [`${pendencias.length} pendência(s) encontrada(s).`],
    };
  }

  // Default: consultar_pendencias
  return {
    ...base,
    pendencias,
    dados: {
      situacao_fiscal: situacaoFiscal,
      caixa_postal_nao_lidas: seed % 4,
    },
    mensagens:
      pendencias.length === 0 ? ["Nenhuma pendência encontrada."] : [],
  };
}

function esocialMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  const pendencias: Pendencia[] = [];
  const nFunc = (seed % 8) + 1;
  if (seed % 2 === 0) {
    pendencias.push({
      tipo: "S-1200 pendente",
      competencia: competenciaAnterior(0),
      descricao: `${nFunc} evento(s) de remuneração não enviados`,
    });
  }
  if (seed % 7 === 0) {
    pendencias.push({
      tipo: "S-2240 SST atrasado",
      descricao: "Riscos ambientais pendentes para 2 funcionários",
    });
  }
  return {
    ...base,
    pendencias,
    dados: {
      eventos_enviados_mes: seed % 30,
      eventos_pendentes: pendencias.length,
    },
  };
}

function reinfMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  const pendencias: Pendencia[] = [];
  if (seed % 4 === 0) {
    pendencias.push({
      tipo: "R-4020 não enviado",
      competencia: competenciaAnterior(1),
      descricao: "Retenções de IR sobre serviços tomados",
      valor: 450.0 + (seed % 500),
    });
  }
  return {
    ...base,
    pendencias,
    dados: {
      retencoes_mes: 800 + (seed % 5000),
      vinculo_dctfweb: "ATIVO",
    },
  };
}

function spedMock(
  base: RespostaIntegracao,
  seed: number,
  acao: string
): RespostaIntegracao {
  const pendencias: Pendencia[] = [];
  if (acao === "validar_txt") {
    return {
      ...base,
      mensagens: [
        "Validação simulada: 0 erros, 2 avisos.",
        "Aviso: bloco 0150 com 1 fornecedor sem inscrição estadual.",
      ],
      dados: { linhas: 1234, blocos: 12 },
    };
  }
  if (seed % 6 === 0) {
    pendencias.push({
      tipo: "ECD do exercício anterior não transmitida",
      descricao: "Prazo: até último dia útil de junho",
    });
  }
  return { ...base, pendencias };
}

function notasMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  return {
    ...base,
    mensagens: [`${seed % 12} NF-e novas encontradas na SEFAZ (simulado).`],
    dados: {
      nfe_emitidas_mes: 30 + (seed % 50),
      nfe_recebidas_mes: 12 + (seed % 30),
      pendentes_manifestacao: seed % 5,
    },
  };
}

function snMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  const pendencias: Pendencia[] = [];
  if (seed % 3 === 0) {
    pendencias.push({
      tipo: "PGDAS-D não declarado",
      competencia: competenciaAnterior(0),
    });
  }
  return {
    ...base,
    pendencias,
    dados: {
      rbt12_simulado: 850000 + ((seed * 137) % 500000),
      sublimite_estadual: "OK",
      parcelamentos_ativos: seed % 3 === 0 ? 1 : 0,
    },
  };
}

function fgtsMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  const pendencias: Pendencia[] = [];
  if (seed % 4 === 1) {
    pendencias.push({
      tipo: "Guia FGTS em aberto",
      competencia: competenciaAnterior(0),
      valor: 580.0 + (seed % 800),
      vencimento: isoDataAhead(7),
    });
  }
  return {
    ...base,
    pendencias,
    dados: {
      vinculo_caixa: "OK",
      certidao_fgts: pendencias.length === 0 ? "REGULAR" : "PENDENTE",
    },
  };
}

function prefMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  return {
    ...base,
    mensagens: [
      `${seed % 8} NFS-e novas no município (simulado).`,
      "Integração varia por município — endpoints específicos necessários.",
    ],
    dados: {
      iss_devido_mes: 120 + (seed % 800),
      cnd_municipal: "REGULAR",
    },
  };
}

function redesimMock(
  base: RespostaIntegracao,
  _seed: number,
  _acao: string
): RespostaIntegracao {
  return {
    ...base,
    mensagens: ["Nenhum protocolo em aberto (simulado)."],
    dados: {
      protocolos_abertos: 0,
      ultima_alteracao: "2025-11-15",
    },
  };
}

function certMock(
  base: RespostaIntegracao,
  seed: number,
  _acao: string
): RespostaIntegracao {
  const diasParaVencer = 30 + (seed % 300);
  const pendencias: Pendencia[] =
    diasParaVencer < 60
      ? [
          {
            tipo: "Certificado vencendo",
            descricao: `Vence em ${diasParaVencer} dias`,
            vencimento: isoDataAhead(diasParaVencer),
          },
        ]
      : [];
  return {
    ...base,
    pendencias,
    dados: {
      certificados_ativos: 1,
      proximo_vencimento: isoDataAhead(diasParaVencer),
    },
  };
}

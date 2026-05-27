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
  acao: string
): RespostaIntegracao {
  const nFunc = (seed % 8) + 1;

  if (acao === "validar_eventos" || acao === "listar_pendentes") {
    const eventos = [];
    // S-1200 sempre algum pendente do mês corrente
    for (let i = 0; i < (seed % 5) + 1; i++) {
      eventos.push({
        codigo: "S-1200",
        nome: "Remuneração CLT",
        funcionario: `Funcionário ${(i + 1).toString().padStart(2, "0")}`,
        competencia: competenciaAnterior(0),
        criado_em: isoDataAhead(-(i + 1)),
        status: "PENDENTE_ENVIO",
      });
    }
    if (seed % 3 === 0) {
      eventos.push({
        codigo: "S-2200",
        nome: "Admissão",
        funcionario: `Novo Funcionário ${seed % 10}`,
        competencia: competenciaAnterior(0),
        criado_em: isoDataAhead(-2),
        status: "PENDENTE_ENVIO",
      });
    }
    if (seed % 5 === 0) {
      eventos.push({
        codigo: "S-2299",
        nome: "Desligamento",
        funcionario: `Funcionário ${(seed % 5) + 5}`,
        competencia: competenciaAnterior(0),
        criado_em: isoDataAhead(-3),
        status: "PENDENTE_ENVIO",
      });
    }
    if (seed % 7 === 0) {
      eventos.push({
        codigo: "S-2240",
        nome: "Riscos ambientais (SST)",
        funcionario: `Funcionário ${(seed % 3) + 1}`,
        competencia: competenciaAnterior(0),
        criado_em: isoDataAhead(-7),
        status: "PENDENTE_ENVIO",
      });
    }
    if (seed % 11 === 0) {
      eventos.push({
        codigo: "S-1210",
        nome: "Pagamentos",
        funcionario: "Folha geral",
        competencia: competenciaAnterior(0),
        criado_em: isoDataAhead(-1),
        status: "PENDENTE_ENVIO",
      });
    }
    return {
      ...base,
      dados: { eventos, total: eventos.length },
      mensagens: [`${eventos.length} evento(s) pendente(s) de envio.`],
    };
  }

  if (acao === "enviar_eventos") {
    const total = (seed % 5) + 2;
    const recibo = `1.2.${competenciaAnterior(0).replace("-", "")}.${(seed % 9000) + 1000}`;
    return {
      ...base,
      dados: {
        recibo,
        protocolo: `${competenciaAnterior(0).replace("-", "")}.${(seed * 7) % 999999}`,
        eventos_enviados: total,
        data_envio: new Date().toISOString(),
      },
      mensagens: [`Lote enviado com sucesso. Recibo: ${recibo}`],
    };
  }

  if (acao === "consultar_recibo" || acao === "listar_enviados") {
    const lotes = [];
    for (let i = 0; i < 5; i++) {
      lotes.push({
        recibo: `1.2.${competenciaAnterior(i).replace("-", "")}.${(seed * (i + 1)) % 9000 + 1000}`,
        data_envio: isoDataAhead(-(i * 30 + 5)),
        eventos_total: 8 + ((seed * (i + 1)) % 20),
        eventos_aceitos:
          i === 0 && seed % 6 === 0
            ? 6
            : 8 + ((seed * (i + 1)) % 20),
        eventos_rejeitados: i === 0 && seed % 6 === 0 ? 2 : 0,
        status: i === 0 && seed % 6 === 0 ? "PARCIAL" : "PROCESSADO",
      });
    }
    return {
      ...base,
      dados: { lotes },
      mensagens: [`${lotes.length} lote(s) no histórico.`],
    };
  }

  if (acao === "gerar_xml_sst") {
    return {
      ...base,
      dados: {
        gerados: [
          {
            codigo: "S-2210",
            nome: "CAT",
            xml_size_bytes: 2400 + (seed % 800),
            funcionario: `Funcionário ${(seed % 5) + 1}`,
            data_acidente: isoDataAhead(-(seed % 30 + 5)),
          },
          {
            codigo: "S-2220",
            nome: "ASO",
            xml_size_bytes: 1800 + (seed % 600),
            funcionario: `Funcionário ${(seed % 5) + 2}`,
            tipo_aso: "PERIODICO",
            data_exame: isoDataAhead(-(seed % 15)),
          },
          {
            codigo: "S-2240",
            nome: "Riscos ambientais",
            xml_size_bytes: 3600 + (seed % 1200),
            funcionario: `Funcionário ${(seed % 5) + 3}`,
            ambiente: "Linha de produção",
            qtd_riscos: 3,
          },
        ],
      },
      mensagens: ["3 XMLs SST gerados e prontos pra envio."],
    };
  }

  // Default — pendências resumo
  const pendencias: Pendencia[] = [];
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
  acao: string
): RespostaIntegracao {
  // Pendências base
  const pendencias: Pendencia[] = [];
  if (seed % 3 === 0) {
    pendencias.push({
      tipo: "PGDAS-D não declarado",
      competencia: competenciaAnterior(0),
    });
  }
  if (seed % 7 === 0) {
    pendencias.push({
      tipo: "DAS em atraso",
      competencia: competenciaAnterior(2),
      valor: 1850 + (seed % 1500),
      vencimento: isoDataAhead(-30),
    });
  }

  const rbt12 = 850000 + ((seed * 137) % 4000000);
  const sublimiteUltrapassado = rbt12 > 3600000;

  if (acao === "consultar_pgdas") {
    // Últimas 6 competências
    const declaracoes = [];
    for (let i = 0; i < 6; i++) {
      const comp = competenciaAnterior(i);
      const declarada = i > 0 || seed % 3 !== 0;
      const retificada = i > 1 && seed % 11 === 0;
      const receita = 45000 + ((seed * (i + 1) * 7) % 80000);
      declaracoes.push({
        competencia: comp,
        status: !declarada
          ? "PENDENTE"
          : retificada
          ? "RETIFICADA"
          : "DECLARADA",
        receita_declarada: receita,
        valor_das: receita * 0.06 + (seed % 100),
        data_transmissao: declarada ? isoDataAhead(-(i * 30 + 18)) : null,
      });
    }
    return {
      ...base,
      dados: { declaracoes },
      mensagens: [
        `${declaracoes.filter((d) => d.status === "DECLARADA").length} declaração(ões) entregues, ${declaracoes.filter((d) => d.status === "PENDENTE").length} pendente(s).`,
      ],
    };
  }

  if (acao === "gerar_das") {
    const competencia = competenciaAnterior(0);
    const receita = 45000 + (seed % 70000);
    const valor = receita * 0.06 + (seed % 100);
    return {
      ...base,
      dados: {
        das_gerado: {
          competencia,
          numero: `2${(seed % 9000) + 1000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}`,
          codigo_barras: `85800000${(seed % 90000) + 10000}-0 14180280000-0 04031${competencia.replace("-", "")}-0`,
          vencimento: isoDataAhead(20),
          valor,
          receita_apurada: receita,
        },
      },
      mensagens: [`DAS gerado pra ${competencia}. Vencimento dia 20.`],
    };
  }

  if (acao === "consultar_parcelamentos") {
    const parcelamentos = [];
    if (seed % 3 === 0) {
      parcelamentos.push({
        numero: `${(seed % 9000) + 1000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}`,
        tipo: "Simples Nacional — Lei 12.996/14",
        data_adesao: isoDataAhead(-365 - (seed % 365)),
        parcelas_total: 60,
        parcelas_pagas: 12 + (seed % 30),
        valor_original: 12000 + (seed % 30000),
        saldo_devedor: 8000 + (seed % 20000),
        proxima_parcela_valor: 450 + (seed % 800),
        proxima_parcela_vencimento: isoDataAhead(15 - (seed % 30)),
        status: "EM_DIA",
      });
    }
    if (seed % 9 === 0) {
      parcelamentos.push({
        numero: `${(seed % 9000) + 5000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}`,
        tipo: "PERT — Lei 13.496/17",
        data_adesao: isoDataAhead(-900),
        parcelas_total: 175,
        parcelas_pagas: 80 + (seed % 30),
        valor_original: 45000 + (seed % 50000),
        saldo_devedor: 22000 + (seed % 30000),
        proxima_parcela_valor: 250 + (seed % 400),
        proxima_parcela_vencimento: isoDataAhead(20 - (seed % 30)),
        status: "EM_DIA",
      });
    }
    return {
      ...base,
      dados: { parcelamentos },
      mensagens: [
        parcelamentos.length === 0
          ? "Nenhum parcelamento ativo."
          : `${parcelamentos.length} parcelamento(s) em andamento.`,
      ],
    };
  }

  if (acao === "checar_sublimite") {
    return {
      ...base,
      dados: {
        rbt12,
        sublimite_estadual: 3600000,
        ultrapassado: sublimiteUltrapassado,
        margem: 3600000 - rbt12,
        ano_atual_aproximado: rbt12 * 1.1,
      },
      mensagens: [
        sublimiteUltrapassado
          ? "ATENÇÃO: RBT12 ultrapassou o sublimite estadual de R$ 3.6M. ICMS/ISS fora do Simples a partir do mês seguinte."
          : `RBT12 dentro do sublimite. Margem: R$ ${(3600000 - rbt12).toLocaleString("pt-BR")}.`,
      ],
    };
  }

  // Default: consultar pendências
  return {
    ...base,
    pendencias,
    dados: {
      rbt12,
      sublimite_estadual: sublimiteUltrapassado ? "ULTRAPASSADO" : "OK",
      parcelamentos_ativos: seed % 3 === 0 ? 1 : 0,
    },
  };
}

function fgtsMock(
  base: RespostaIntegracao,
  seed: number,
  acao: string
): RespostaIntegracao {
  const temAberto = seed % 4 === 1;
  const pendencias: Pendencia[] = [];
  if (temAberto) {
    pendencias.push({
      tipo: "Guia FGTS em aberto",
      competencia: competenciaAnterior(0),
      valor: 580.0 + (seed % 800),
      vencimento: isoDataAhead(7),
    });
  }

  if (acao === "consultar_guias_fgts" || acao === "gerar_guias") {
    const guias = [];
    for (let i = 0; i < 6; i++) {
      const comp = competenciaAnterior(i);
      const valor = 580 + ((seed * (i + 1) * 13) % 2200);
      // i=0 sempre aberta; i>=1 alternados
      const status =
        i === 0 && temAberto
          ? "ABERTA"
          : i === 1 && seed % 7 === 0
          ? "VENCIDA"
          : "PAGA";
      guias.push({
        competencia: comp,
        valor,
        status,
        vencimento: isoDataAhead(7 - i * 30),
        data_pagamento:
          status === "PAGA" ? isoDataAhead(7 - i * 30 - 2) : null,
        codigo_barras:
          status !== "PAGA"
            ? `85820000${(seed % 90000) + 10000}-0 ${(seed % 90000) + 10000}.${comp.replace("-", "")}-0`
            : null,
      });
    }
    return {
      ...base,
      dados: { guias },
      mensagens: [
        `${guias.filter((g) => g.status === "PAGA").length} paga(s), ${guias.filter((g) => g.status === "ABERTA").length} aberta(s), ${guias.filter((g) => g.status === "VENCIDA").length} vencida(s).`,
      ],
    };
  }

  if (acao === "consultar_debitos") {
    const debitos: Array<Record<string, unknown>> = [];
    if (seed % 5 === 0) {
      debitos.push({
        tipo: "Atraso FGTS",
        competencia: competenciaAnterior(3),
        valor_original: 1200 + (seed % 800),
        juros_multa: 180 + (seed % 200),
        valor_atualizado: 1380 + (seed % 1000),
        dias_atraso: 92,
      });
    }
    return {
      ...base,
      dados: {
        debitos,
        total_atualizado: debitos.reduce(
          (s, d) => s + ((d.valor_atualizado as number) ?? 0),
          0
        ),
      },
      mensagens: [
        debitos.length === 0
          ? "Sem débitos FGTS em aberto."
          : `${debitos.length} débito(s) totalizando R$ ${debitos.reduce((s, d) => s + ((d.valor_atualizado as number) ?? 0), 0).toLocaleString("pt-BR")}.`,
      ],
    };
  }

  if (acao === "conciliar_esocial") {
    const itens = [];
    for (let i = 0; i < 4; i++) {
      const comp = competenciaAnterior(i);
      const valorEsocial = 4500 + ((seed * (i + 1) * 17) % 3000);
      const valorFGTS = valorEsocial + (seed % 7 === i ? 0 : i === 1 ? -50 : 0);
      const ok = valorEsocial === valorFGTS;
      itens.push({
        competencia: comp,
        valor_esocial: valorEsocial,
        valor_fgts: valorFGTS,
        diferenca: valorEsocial - valorFGTS,
        status: ok ? "OK" : "DIVERGENTE",
      });
    }
    const divergentes = itens.filter((i) => i.status === "DIVERGENTE").length;
    return {
      ...base,
      dados: { itens, divergentes },
      mensagens: [
        divergentes === 0
          ? "Conciliação OK em todas as competências."
          : `${divergentes} competência(s) com divergência entre eSocial e FGTS Digital.`,
      ],
    };
  }

  if (acao === "emitir_crf") {
    const regular = !temAberto && seed % 5 !== 0;
    return {
      ...base,
      certidoes: [
        {
          tipo: "CRF",
          situacao: regular ? "REGULAR" : "PENDENTE",
          emissao: new Date().toISOString().slice(0, 10),
          validade: regular ? isoDataAhead(30) : undefined,
        },
      ],
      dados: {
        codigo_validacao: regular
          ? `${(seed % 9000) + 1000}.${(seed % 9000) + 1000}.${(seed % 9000) + 1000}`
          : null,
      },
      mensagens: [
        regular
          ? "Certificado de Regularidade do FGTS emitido (válido 30 dias)."
          : "Empregador NÃO está regular perante o FGTS. CRF não pode ser emitido.",
      ],
    };
  }

  // Default
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

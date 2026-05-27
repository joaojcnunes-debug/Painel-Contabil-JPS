// Tabelas e cálculo do Simples Nacional (LC 123/06).
// Valores válidos em 2026 — conferir periodicamente em caso de mudança.

export type AnexoSimples = "I" | "II" | "III" | "IV" | "V";

type Faixa = {
  faixa: number;
  rbt12Min: number;
  rbt12Max: number;     // inclusive
  aliquota: number;     // decimal (0.04 = 4%)
  deducao: number;
};

const TABELAS: Record<AnexoSimples, Faixa[]> = {
  // Anexo I — Comércio
  I: [
    { faixa: 1, rbt12Min: 0,         rbt12Max: 180000,    aliquota: 0.0400, deducao: 0 },
    { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000,    aliquota: 0.0730, deducao: 5940 },
    { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000,    aliquota: 0.0950, deducao: 13860 },
    { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000,   aliquota: 0.1070, deducao: 22500 },
    { faixa: 5, rbt12Min: 1800000.01,rbt12Max: 3600000,   aliquota: 0.1430, deducao: 87300 },
    { faixa: 6, rbt12Min: 3600000.01,rbt12Max: 4800000,   aliquota: 0.1900, deducao: 378000 },
  ],
  // Anexo II — Indústria
  II: [
    { faixa: 1, rbt12Min: 0,         rbt12Max: 180000,    aliquota: 0.0450, deducao: 0 },
    { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000,    aliquota: 0.0780, deducao: 5940 },
    { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000,    aliquota: 0.1000, deducao: 13860 },
    { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000,   aliquota: 0.1120, deducao: 22500 },
    { faixa: 5, rbt12Min: 1800000.01,rbt12Max: 3600000,   aliquota: 0.1470, deducao: 85500 },
    { faixa: 6, rbt12Min: 3600000.01,rbt12Max: 4800000,   aliquota: 0.3000, deducao: 720000 },
  ],
  // Anexo III — Serviços (locação bens móveis, agências de viagem, etc.)
  III: [
    { faixa: 1, rbt12Min: 0,         rbt12Max: 180000,    aliquota: 0.0600, deducao: 0 },
    { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000,    aliquota: 0.1120, deducao: 9360 },
    { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000,    aliquota: 0.1350, deducao: 17640 },
    { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000,   aliquota: 0.1600, deducao: 35640 },
    { faixa: 5, rbt12Min: 1800000.01,rbt12Max: 3600000,   aliquota: 0.2100, deducao: 125640 },
    { faixa: 6, rbt12Min: 3600000.01,rbt12Max: 4800000,   aliquota: 0.3300, deducao: 648000 },
  ],
  // Anexo IV — Serviços específicos (construção, vigilância, limpeza, advocacia)
  IV: [
    { faixa: 1, rbt12Min: 0,         rbt12Max: 180000,    aliquota: 0.0450, deducao: 0 },
    { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000,    aliquota: 0.0900, deducao: 8100 },
    { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000,    aliquota: 0.1020, deducao: 12420 },
    { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000,   aliquota: 0.1400, deducao: 39780 },
    { faixa: 5, rbt12Min: 1800000.01,rbt12Max: 3600000,   aliquota: 0.2200, deducao: 183780 },
    { faixa: 6, rbt12Min: 3600000.01,rbt12Max: 4800000,   aliquota: 0.3300, deducao: 828000 },
  ],
  // Anexo V — Serviços intelectuais (fator R)
  V: [
    { faixa: 1, rbt12Min: 0,         rbt12Max: 180000,    aliquota: 0.1550, deducao: 0 },
    { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000,    aliquota: 0.1800, deducao: 4500 },
    { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000,    aliquota: 0.1950, deducao: 9900 },
    { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000,   aliquota: 0.2050, deducao: 17100 },
    { faixa: 5, rbt12Min: 1800000.01,rbt12Max: 3600000,   aliquota: 0.2300, deducao: 62100 },
    { faixa: 6, rbt12Min: 3600000.01,rbt12Max: 4800000,   aliquota: 0.3050, deducao: 540000 },
  ],
};

export const ANEXO_LABEL: Record<AnexoSimples, string> = {
  I: "Anexo I — Comércio",
  II: "Anexo II — Indústria",
  III: "Anexo III — Serviços (locação, agências, etc)",
  IV: "Anexo IV — Construção, vigilância, limpeza, advocacia",
  V: "Anexo V — Serviços intelectuais (fator R)",
};

export type ResultadoApuracao = {
  anexo: AnexoSimples;
  faixa: number;
  rbt12: number;
  receitaMes: number;
  aliquotaNominal: number;       // decimal
  parcelaDeduzir: number;
  aliquotaEfetiva: number;       // decimal — pode ser zero se rbt12=0
  valorDas: number;
  excedeuLimite: boolean;        // RBT12 > 4.8M
  observacoes: string[];
};

export function calcularDas(
  anexo: AnexoSimples,
  rbt12: number,
  receitaMes: number
): ResultadoApuracao {
  const observacoes: string[] = [];
  const tabela = TABELAS[anexo];
  const excedeuLimite = rbt12 > 4800000;

  if (excedeuLimite) {
    observacoes.push(
      "RBT12 acima de R$ 4.800.000 — empresa fora do Simples (verificar enquadramento)."
    );
  }

  // Faixa: se rbt12 = 0 (cliente novo), usa faixa 1
  let faixa = tabela[0];
  if (rbt12 > 0) {
    const encontrada = tabela.find(
      (f) => rbt12 >= f.rbt12Min && rbt12 <= f.rbt12Max
    );
    faixa = encontrada ?? tabela[tabela.length - 1];
  } else {
    observacoes.push(
      "RBT12 = 0 (cliente sem histórico) — usando faixa 1 do anexo."
    );
  }

  // Alíquota efetiva = (RBT12 × aliquota − deducao) / RBT12
  // Se RBT12 = 0, usa a alíquota nominal direto
  const aliquotaEfetiva =
    rbt12 > 0
      ? (rbt12 * faixa.aliquota - faixa.deducao) / rbt12
      : faixa.aliquota;

  const valorDas = receitaMes * aliquotaEfetiva;

  return {
    anexo,
    faixa: faixa.faixa,
    rbt12,
    receitaMes,
    aliquotaNominal: faixa.aliquota,
    parcelaDeduzir: faixa.deducao,
    aliquotaEfetiva,
    valorDas,
    excedeuLimite,
    observacoes,
  };
}

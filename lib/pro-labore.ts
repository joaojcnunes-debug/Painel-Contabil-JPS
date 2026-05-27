// Cálculo de pró-labore (retiradas de sócios).
//
// Diferente de salário CLT:
//   • INSS: contribuinte individual — alíquota fixa de 11%
//     limitado ao TETO de contribuição (R$ 951,62 em 2025, mesmo do teto CLT).
//     A empresa retém na fonte e recolhe via GPS / DAS (Simples).
//   • IRRF: tabela progressiva normal (mesma do empregado).
//   • Sem FGTS, sem VT, sem 13º obrigatório.
//
// Reusa as faixas IRRF da lib de folha pra manter consistência.

import { calcularIrrf } from "./folha-pagamento";

// Teto INSS contribuinte individual = 11% sobre teto salário
const INSS_TETO = 951.62;
const ALIQUOTA_INSS_INDIVIDUAL = 0.11;

export function calcularInssProLabore(valor: number): {
  valor: number;
  base: number;
} {
  if (valor <= 0) return { valor: 0, base: 0 };
  const calculado = valor * ALIQUOTA_INSS_INDIVIDUAL;
  if (calculado > INSS_TETO) {
    return { valor: INSS_TETO, base: INSS_TETO / ALIQUOTA_INSS_INDIVIDUAL };
  }
  return { valor: round2(calculado), base: valor };
}

export type EntradaProLabore = {
  valorProLabore: number;
  dependentes?: number;
  outrosDescontos?: number;
};

export type ResultadoProLabore = {
  valorProLabore: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  aliquotaIrrf: number;
  outrosDescontos: number;
  totalDescontos: number;
  liquido: number;
};

export function calcularProLabore(e: EntradaProLabore): ResultadoProLabore {
  const valor = Number(e.valorProLabore) || 0;
  const dep = Number(e.dependentes) || 0;
  const outros = Number(e.outrosDescontos) || 0;

  const { valor: inss } = calcularInssProLabore(valor);
  const { base: baseIrrf, valor: irrf, aliquota: aliquotaIrrf } = calcularIrrf(
    valor,
    inss,
    dep
  );
  const totalDescontos = round2(inss + irrf + outros);
  const liquido = round2(valor - totalDescontos);

  return {
    valorProLabore: round2(valor),
    inss,
    baseIrrf,
    irrf,
    aliquotaIrrf,
    outrosDescontos: round2(outros),
    totalDescontos,
    liquido,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const STATUS_SOCIO_LABEL: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: "Ativo", cls: "bg-green-100 text-green-700" },
  INATIVO: { label: "Inativo", cls: "bg-gray-200 text-gray-700" },
};

// Cálculo de 13º salário (gratificação natalina).
//
// Regras (CLT + Lei 4.090/62):
//   • 1ª parcela: até 30/nov, sem descontos. Valor = 50% × proporcional.
//   • 2ª parcela: até 20/dez, com INSS e IRRF calculados sobre o VALOR
//     INTEGRAL (não só a 2ª). Valor 2ª = (integral − 1ª) − INSS − IRRF.
//   • Proporcional: 1/12 por mês trabalhado. Fração ≥ 15 dias = mês cheio.
//   • Quando há saída no ano: meses considerados até a demissão.
//   • Base do INSS do 13º é INDEPENDENTE da folha mensal (cálculo separado).
//   • FGTS 8% sobre o integral (encargo patronal, não desconta).

import { calcularInss, calcularIrrf } from "./folha-pagamento";

const FGTS_PERC = 0.08;

// Conta meses trabalhados no ano. Se admissão é depois de 17/jan
// (mais de 15 dias trabalhados no mês = mês cheio), conta o mês.
export function mesesTrabalhadosNoAno(
  ano: number,
  admissao: string,
  demissao: string | null
): number {
  const adm = new Date(admissao + "T12:00");
  const fimAno = new Date(ano, 11, 31);
  const inicioAno = new Date(ano, 0, 1);
  // Quem começou em outro ano: conta a partir de jan
  let inicio = adm > inicioAno ? adm : inicioAno;
  // Quem saiu antes do fim do ano
  let fim = fimAno;
  if (demissao) {
    const dem = new Date(demissao + "T12:00");
    if (dem < fim) fim = dem;
    if (dem.getFullYear() < ano) return 0; // saiu antes do ano
  }
  if (inicio > fim) return 0;

  // Iteração mês a mês
  let meses = 0;
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (cursor <= fim) {
    // Dias trabalhados nesse mês
    const inicioMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const fimMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const inicioReal = inicio > inicioMes ? inicio : inicioMes;
    const fimReal = fim < fimMes ? fim : fimMes;
    const dias =
      Math.round((fimReal.getTime() - inicioReal.getTime()) / 86400000) + 1;
    if (dias >= 15) meses++;
    cursor.setMonth(cursor.getMonth() + 1);
    inicio = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  }
  return Math.min(12, meses);
}

export type EntradaDecimo = {
  salarioBase: number;
  mediaVariaveis?: number;           // média de horas extras/comissões do ano
  meses: number;                     // 1-12
  dependentes?: number;
  outrosDescontos?: number;
  primeiraJaPaga?: number;           // se já adiantou a 1ª, qual valor
};

export type ResultadoDecimo = {
  valorIntegral: number;
  valorPrimeira: number;             // 50% (ou o já pago)
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  outrosDescontos: number;
  valorSegunda: number;
  liquidoTotal: number;
  fgts: number;
};

export function calcularDecimoTerceiro(e: EntradaDecimo): ResultadoDecimo {
  const sb = Number(e.salarioBase) || 0;
  const media = Number(e.mediaVariaveis) || 0;
  const meses = Math.min(12, Math.max(0, Number(e.meses) || 0));
  const dep = Number(e.dependentes) || 0;
  const outros = Number(e.outrosDescontos) || 0;

  const valorIntegral = round2(((sb + media) * meses) / 12);
  const valorPrimeira =
    e.primeiraJaPaga != null ? round2(e.primeiraJaPaga) : round2(valorIntegral / 2);

  // INSS e IRRF sobre o INTEGRAL
  const baseInss = valorIntegral;
  const { valor: inss } = calcularInss(baseInss);
  const { base: baseIrrf, valor: irrf } = calcularIrrf(baseInss, inss, dep);

  // 2ª parcela = restante − descontos
  const valorSegunda = round2(valorIntegral - valorPrimeira - inss - irrf - outros);
  const liquidoTotal = round2(valorIntegral - inss - irrf - outros);
  const fgts = round2(valorIntegral * FGTS_PERC);

  return {
    valorIntegral,
    valorPrimeira,
    baseInss,
    inss,
    baseIrrf,
    irrf,
    outrosDescontos: round2(outros),
    valorSegunda,
    liquidoTotal,
    fgts,
  };
}

export const STATUS_DECIMO_LABEL: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Pendente", cls: "bg-gray-100 text-gray-700" },
  PRIMEIRA_PAGA: { label: "1ª paga", cls: "bg-amber-100 text-amber-800" },
  SEGUNDA_PAGA: { label: "2ª paga", cls: "bg-blue-100 text-blue-700" },
  QUITADO: { label: "Quitado", cls: "bg-green-100 text-green-700" },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

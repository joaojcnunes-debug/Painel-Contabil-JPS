// Cálculo de férias (CLT, Lei 8.213 + arts. 129-153 CLT).
//
// Regras chave:
//   • 12 meses de trabalho geram 30 dias de férias (com até 5 faltas).
//   • Faltas no período aquisitivo reduzem dias de direito:
//     0–5 → 30 dias  |  6–14 → 24  |  15–23 → 18  |  24–32 → 12  |  +32 → 0
//   • Valor base = salário + média de variáveis (HE, comissões, adic).
//   • 1/3 constitucional (Art. 7º XVII CF) sobre o valor das férias.
//   • Abono pecuniário (opcional): vende até 1/3 do período (10 dias).
//     O abono e seu 1/3 são ISENTOS de INSS e IRRF (Súmula 125 TST).
//   • INSS e IRRF calculados SEPARADAMENTE da folha mensal.
//   • FGTS 8% sobre o total (encargo patronal).

import { calcularInss, calcularIrrf } from "./folha-pagamento";

const FGTS_PERC = 0.08;

// Dias de direito conforme faltas no período aquisitivo
export function diasDireitoPorFaltas(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

export type EntradaFerias = {
  salarioBase: number;
  mediaVariaveis?: number;
  diasGozados: number;          // 0-30
  diasAbono?: 0 | 10;            // abono pecuniário
  dependentes?: number;
  outrosDescontos?: number;
};

export type ResultadoFerias = {
  // Tributáveis
  valorFerias: number;
  tercoFerias: number;
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  // Isentos (abono)
  valorAbono: number;
  tercoAbono: number;
  // Totais
  outrosDescontos: number;
  totalBruto: number;
  totalDescontos: number;
  liquido: number;
  fgts: number;
};

export function calcularFerias(e: EntradaFerias): ResultadoFerias {
  const sb = Number(e.salarioBase) || 0;
  const media = Number(e.mediaVariaveis) || 0;
  const dias = Math.min(30, Math.max(0, Number(e.diasGozados) || 0));
  const abonoDias = e.diasAbono ?? 0;
  const dep = Number(e.dependentes) || 0;
  const outros = Number(e.outrosDescontos) || 0;

  const baseDiaria = (sb + media) / 30;
  const valorFerias = round2(baseDiaria * dias);
  const tercoFerias = round2(valorFerias / 3);
  const valorAbono = round2(baseDiaria * abonoDias);
  const tercoAbono = round2(valorAbono / 3);

  // Base INSS/IRRF: apenas a parte tributável (férias + 1/3 das férias)
  const baseInss = round2(valorFerias + tercoFerias);
  const { valor: inss } = calcularInss(baseInss);
  const { base: baseIrrf, valor: irrf } = calcularIrrf(baseInss, inss, dep);

  const totalBruto = round2(
    valorFerias + tercoFerias + valorAbono + tercoAbono
  );
  const totalDescontos = round2(inss + irrf + outros);
  const liquido = round2(totalBruto - totalDescontos);
  const fgts = round2(baseInss * FGTS_PERC); // FGTS sobre o tributável

  return {
    valorFerias,
    tercoFerias,
    baseInss,
    inss,
    baseIrrf,
    irrf,
    valorAbono,
    tercoAbono,
    outrosDescontos: round2(outros),
    totalBruto,
    totalDescontos,
    liquido,
    fgts,
  };
}

// Calcula data fim de gozo a partir do início + dias gozados
export function calcularFimGozo(inicio: string, dias: number): string {
  if (!inicio || dias <= 0) return inicio;
  const d = new Date(inicio + "T12:00");
  d.setDate(d.getDate() + dias - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const STATUS_FERIAS_LABEL: Record<
  string,
  { label: string; cls: string }
> = {
  PROGRAMADA: { label: "Programada", cls: "bg-gray-100 text-gray-700" },
  EM_GOZO: { label: "Em gozo", cls: "bg-blue-100 text-blue-700" },
  PAGA: { label: "Paga", cls: "bg-amber-100 text-amber-800" },
  ENCERRADA: { label: "Encerrada", cls: "bg-green-100 text-green-700" },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

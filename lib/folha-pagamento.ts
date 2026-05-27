// Cálculo de folha de pagamento — CLT brasileira (versão simplificada).
//
// Tabelas vigentes em 2025/2026. **CONFERIR** a portaria oficial do
// Ministério da Previdência (INSS) e a Receita (IRRF) a cada virada
// de ano antes de fechar folha real.
//
// O cálculo aqui é PROGRESSIVO (a alíquota incide por faixa, não sobre
// o total). É o método correto desde a MP 871/2019.

// ─── INSS Empregado 2025 (progressivo) ─────────────────────────
// Limites: até 1.518,00 | 1.518,01-2.793,88 | 2.793,89-4.190,83 | 4.190,84-8.157,41
// Teto de contribuição: R$ 951,62 (sobre o teto de R$ 8.157,41)
type FaixaInss = { ate: number; aliquota: number };

const INSS_FAIXAS: FaixaInss[] = [
  { ate: 1518.0, aliquota: 0.075 },
  { ate: 2793.88, aliquota: 0.09 },
  { ate: 4190.83, aliquota: 0.12 },
  { ate: 8157.41, aliquota: 0.14 },
];
const INSS_TETO_CONTRIBUICAO = 951.62;

// ─── IRRF 2025 (mensal) ─────────────────────────────────────────
// Faixas anuais convertidas. Dedução por dependente: R$ 189,59
type FaixaIrrf = { ate: number; aliquota: number; deducao: number };

const IRRF_FAIXAS: FaixaIrrf[] = [
  { ate: 2428.8, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
];
const IRRF_DEDUCAO_DEPENDENTE = 189.59;

// ─── Encargos patronais (informativo) ─────────────────────────
// INSS patronal 20% + RAT (1-3%, usando 2% como média) + Sistema S (~5,8%)
// Para simplificar: agregamos em ~26,8% (verificar CNAE específico).
// FGTS empregador: 8%
const INSS_PATRONAL_PERC = 0.20;        // Só a parte INSS (sem RAT/Sistema S)
const FGTS_PERC = 0.08;

// ─── Cálculo INSS (progressivo) ────────────────────────────────
export function calcularInss(salarioBruto: number): {
  valor: number;
  aliquotaEfetiva: number;
} {
  if (salarioBruto <= 0) return { valor: 0, aliquotaEfetiva: 0 };
  if (salarioBruto > INSS_FAIXAS[INSS_FAIXAS.length - 1].ate) {
    return {
      valor: INSS_TETO_CONTRIBUICAO,
      aliquotaEfetiva: INSS_TETO_CONTRIBUICAO / salarioBruto,
    };
  }
  let inss = 0;
  let limiteAnterior = 0;
  for (const faixa of INSS_FAIXAS) {
    if (salarioBruto > faixa.ate) {
      inss += (faixa.ate - limiteAnterior) * faixa.aliquota;
      limiteAnterior = faixa.ate;
    } else {
      inss += (salarioBruto - limiteAnterior) * faixa.aliquota;
      break;
    }
  }
  return {
    valor: round2(inss),
    aliquotaEfetiva: inss / salarioBruto,
  };
}

// ─── Cálculo IRRF ──────────────────────────────────────────────
// Base IRRF = Salário bruto − INSS − (dependentes × 189,59)
export function calcularIrrf(
  salarioBruto: number,
  inss: number,
  dependentes: number = 0
): { base: number; valor: number; aliquota: number; deducao: number } {
  const base = Math.max(
    0,
    salarioBruto - inss - dependentes * IRRF_DEDUCAO_DEPENDENTE
  );
  const faixa =
    IRRF_FAIXAS.find((f) => base <= f.ate) ?? IRRF_FAIXAS[IRRF_FAIXAS.length - 1];
  const valor = Math.max(0, base * faixa.aliquota - faixa.deducao);
  return {
    base: round2(base),
    valor: round2(valor),
    aliquota: faixa.aliquota,
    deducao: faixa.deducao,
  };
}

// ─── Vale-transporte ───────────────────────────────────────────
// Desconto máximo: 6% do salário base. Se VT custar menos, desconta
// só o custo. Se custar mais, desconta os 6% e empresa banca o resto.
export function calcularVT(
  salarioBase: number,
  valorVt: number | null
): number {
  if (!valorVt || valorVt <= 0) return 0;
  const teto = salarioBase * 0.06;
  return round2(Math.min(teto, valorVt));
}

// ─── Cálculo completo da folha de um funcionário ───────────────
export type EntradaFolha = {
  salarioBase: number;
  horasExtras?: number;
  adicionalNoturno?: number;
  outrosProventos?: number;
  descFaltas?: number;
  descAdiantamento?: number;
  descOutros?: number;
  dependentes?: number;
  valorVt?: number | null;
  planoSaude?: number | null;
};

export type ResultadoFolha = {
  // Bases
  totalProventos: number;
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  aliquotaIrrf: number;
  vt: number;
  planoSaude: number;
  totalDescontos: number;
  liquido: number;
  // Encargos patronais
  inssPatronal: number;
  fgts: number;
};

export function calcularFolha(e: EntradaFolha): ResultadoFolha {
  const sb = Number(e.salarioBase) || 0;
  const he = Number(e.horasExtras) || 0;
  const an = Number(e.adicionalNoturno) || 0;
  const out = Number(e.outrosProventos) || 0;
  const faltas = Number(e.descFaltas) || 0;
  const adto = Number(e.descAdiantamento) || 0;
  const dOutros = Number(e.descOutros) || 0;
  const dep = Number(e.dependentes) || 0;
  const ps = Number(e.planoSaude) || 0;

  const totalProventos = round2(sb + he + an + out);
  // Base INSS = proventos − faltas (faltas reduzem base de cálculo)
  const baseInss = round2(Math.max(0, totalProventos - faltas));
  const { valor: inss } = calcularInss(baseInss);
  const {
    base: baseIrrf,
    valor: irrf,
    aliquota: aliquotaIrrf,
  } = calcularIrrf(baseInss, inss, dep);
  const vt = calcularVT(sb, e.valorVt ?? null);

  const totalDescontos = round2(
    inss + irrf + vt + ps + faltas + adto + dOutros
  );
  const liquido = round2(totalProventos - totalDescontos);

  const inssPatronal = round2(baseInss * INSS_PATRONAL_PERC);
  const fgts = round2(baseInss * FGTS_PERC);

  return {
    totalProventos,
    baseInss,
    inss,
    baseIrrf,
    irrf,
    aliquotaIrrf,
    vt,
    planoSaude: round2(ps),
    totalDescontos,
    liquido,
    inssPatronal,
    fgts,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const TIPO_FUNC_LABEL: Record<string, string> = {
  CLT: "CLT",
  ESTAGIARIO: "Estagiário",
  JOVEM_APRENDIZ: "Jovem Aprendiz",
  AUTONOMO: "Autônomo",
};

export const STATUS_FUNC_LABEL: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: "Ativo", cls: "bg-green-100 text-green-700" },
  AFASTADO: { label: "Afastado", cls: "bg-yellow-100 text-yellow-700" },
  DEMITIDO: { label: "Demitido", cls: "bg-gray-200 text-gray-700" },
};

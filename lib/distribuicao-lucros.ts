// Helpers do painel de distribuição de lucros: períodos (mês/trimestre),
// agregação e parsing da planilha de importação.

export const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export type Visao = "mensal" | "trimestral";

// "2026-02-10" → { ano: 2026, mes: 2, trimestre: 1 }
export function periodoDe(dataIso: string) {
  const ano = Number(dataIso.slice(0, 4));
  const mes = Number(dataIso.slice(5, 7));
  return { ano, mes, trimestre: Math.ceil(mes / 3) };
}

// Rótulos das colunas do período conforme a visão
export function rotulosPeriodo(visao: Visao): string[] {
  return visao === "mensal" ? MESES_CURTOS : ["1º Tri", "2º Tri", "3º Tri", "4º Tri"];
}

// Índice 0-based da coluna do período (mês 0–11 ou trimestre 0–3)
export function indicePeriodo(dataIso: string, visao: Visao): number {
  const p = periodoDe(dataIso);
  return visao === "mensal" ? p.mes - 1 : p.trimestre - 1;
}

// "15.000,00" / "15000,00" / "15000.00" / "R$ 1.234" → número
export function parseValorBR(raw: string): number {
  const s = raw.replace(/[R$\s]/g, "");
  if (!s) return NaN;
  // Vírgula = decimal BR; sem vírgula, "1.234.567" ainda é milhar BR
  const normalizado = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
    ? s.replace(/\./g, "")
    : s;
  return Number(normalizado);
}

// "15/01/2026" ou "2026-01-15" → "2026-01-15" (null se inválida)
export function parseDataBR(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return dataValida(iso) ? iso : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return dataValida(s) ? s : null;
  return null;
}

function dataValida(iso: string): boolean {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

export function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

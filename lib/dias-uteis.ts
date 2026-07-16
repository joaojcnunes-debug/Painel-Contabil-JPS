// Dias úteis brasileiros — feriados nacionais + fim de semana.
//
// Regra padrão para vencimentos fiscais federais (DAS, PGDAS, DARF): quando
// cai em fim de semana ou feriado, ANTECIPA para o dia útil anterior. Alguns
// tributos POSTERGAM (raro); permitimos escolher a direção.
//
// Feriados nacionais oficiais (Lei nº 662/1949, Lei nº 6.802/1980,
// Lei nº 14.759/2023 — Consciência Negra). Feriados móveis calculados a
// partir da Páscoa (algoritmo de Meeus/Jones/Butcher).
//
// Carnaval NÃO é feriado nacional oficial (ponto facultativo), portanto não
// entra aqui — evita antecipar vencimentos indevidamente.

const FERIADOS_FIXOS = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra (Lei 14.759/2023)
  "12-25", // Natal
] as const;

// Cache por ano — pascoa + feriados computados uma vez por ano solicitado
const cacheFeriados = new Map<number, Set<string>>();

function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function feriadosDoAno(ano: number): Set<string> {
  const cached = cacheFeriados.get(ano);
  if (cached) return cached;
  const set = new Set<string>();
  for (const md of FERIADOS_FIXOS) set.add(`${ano}-${md}`);
  const p = pascoa(ano);
  const addDias = (base: Date, dias: number): string => {
    const nova = new Date(base);
    nova.setDate(base.getDate() + dias);
    return toIsoDate(nova);
  };
  set.add(addDias(p, -2)); // Sexta-feira Santa
  set.add(addDias(p, 60)); // Corpus Christi
  cacheFeriados.set(ano, set);
  return set;
}

export function ehDiaUtil(dataYyyyMmDd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYyyyMmDd);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  const dow = dt.getDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosDoAno(Number(y)).has(dataYyyyMmDd);
}

// Ajusta data pro dia útil mais próximo na direção escolhida.
// Se já é dia útil, retorna a mesma data.
export function ajustarParaDiaUtil(
  dataYyyyMmDd: string,
  direcao: "anterior" | "posterior" = "anterior"
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYyyyMmDd);
  if (!m) return dataYyyyMmDd;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  const delta = direcao === "anterior" ? -1 : 1;
  for (let i = 0; i < 15; i++) {
    const iso = toIsoDate(dt);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6 && !feriadosDoAno(dt.getFullYear()).has(iso)) {
      return iso;
    }
    dt.setDate(dt.getDate() + delta);
  }
  return dataYyyyMmDd;
}

// Retorna motivo do ajuste pra mostrar na UI ("Sábado", "Domingo",
// "Feriado: Natal", etc). Undefined se a data original já é útil.
export function motivoNaoUtil(dataYyyyMmDd: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYyyyMmDd);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  const dow = dt.getDay();
  if (dow === 0) return "Domingo";
  if (dow === 6) return "Sábado";
  if (feriadosDoAno(Number(y)).has(dataYyyyMmDd)) return "Feriado nacional";
  return undefined;
}

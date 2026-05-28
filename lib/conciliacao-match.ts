import type { BancoMovimento } from "@/lib/supabase/types";
import type { CandidatoLancamento } from "@/lib/hooks/useBancoMovimentos";

export type MatchLevel = "alto" | "medio" | "baixo";

export type MatchResult = {
  candidato: CandidatoLancamento;
  score: number;
  level: MatchLevel;
  deltaDias: number;
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalizar(s)
      .split(" ")
      .filter((t) => t.length >= 3)
  );
}

// Jaccard de tokens (0 a 1). Ignora palavras curtas e acentos.
export function similaridade(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

function diffDias(dataA: string, dataB: string): number {
  const a = new Date(dataA + "T12:00").getTime();
  const b = new Date(dataB + "T12:00").getTime();
  return Math.round(Math.abs(a - b) / 86400000);
}

// Score 0-100 entre um movimento bancário e um candidato a lançamento.
// Pré-condição: o caller já confirmou que o tipo (RECEITA/DESPESA) bate
// e o valor absoluto bate. Aqui pontuamos proximidade temporal + similaridade
// textual pra escolher o melhor candidato e definir nível de confiança.
export function score(
  mov: BancoMovimento,
  lanc: CandidatoLancamento
): { score: number; level: MatchLevel; deltaDias: number } {
  const d = diffDias(mov.data_movimento, lanc.data_lancamento);
  const sim = similaridade(mov.descricao ?? "", lanc.descricao ?? "");

  let s: number;
  if (d === 0) s = 100;
  else if (d <= 2) s = 88;
  else if (d <= 7) s = 70;
  else if (d <= 15) s = 50;
  else s = 30;

  // Similaridade textual reforça ou enfraquece
  if (sim >= 0.5) s += 10;
  else if (sim >= 0.25) s += 5;
  else if (sim === 0 && d > 2) s -= 10;

  s = Math.max(0, Math.min(100, s));

  let level: MatchLevel;
  if (s >= 85) level = "alto";
  else if (s >= 55) level = "medio";
  else level = "baixo";

  return { score: s, level, deltaDias: d };
}

// Itera pelos candidatos (já filtrados por tipo+valor absoluto) e retorna
// o melhor match. Retorna null se nem o melhor passar do threshold mínimo.
export function melhorCandidato(
  mov: BancoMovimento,
  candidatos: CandidatoLancamento[]
): MatchResult | null {
  let melhor: MatchResult | null = null;
  for (const c of candidatos) {
    const r = score(mov, c);
    if (r.level === "baixo") continue;
    if (!melhor || r.score > melhor.score) {
      melhor = { candidato: c, ...r };
    }
  }
  return melhor;
}

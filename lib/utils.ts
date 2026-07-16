import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCNPJ(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatCPF(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "").padStart(11, "0");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Datas date-only (YYYY-MM-DD) parseadas por new Date() viram UTC 00:00 e no
  // fuso BRT (-03) exibem o dia anterior. Formata direto sem passar por Date.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

// Gera ID estável formato PREFIXO-XXXXXXXX (8 hex). Mesma assinatura
// do helper de Painel SST — usado em todas as tabelas com PK TEXT.
export function gerarId(prefixo = "ID"): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${prefixo}-${hex}`;
}

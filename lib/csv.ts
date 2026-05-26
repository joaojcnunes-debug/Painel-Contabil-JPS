// Util pra gerar CSV compatível com Excel BR:
// - BOM UTF-8 (﻿) pra acentos renderizarem corretamente
// - Separador ; (vírgula no Brasil é decimal)
// - Quebra de linha \r\n
// - Escape de aspas duplas dobrando

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escape(c.header)).join(";");
  const lines = rows.map((row) =>
    columns.map((c) => escape(c.value(row))).join(";")
  );
  return "﻿" + [header, ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Formato BR pra valor monetário sem prefixo R$ (mais útil em planilha)
export function csvMoeda(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toFixed(2).replace(".", ",");
}

// Data ISO -> dd/mm/yyyy
export function csvData(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

// Parser CSV simples: aceita separador ; ou , (auto-detecta pela 1ª linha),
// suporta valores entre aspas com aspas duplas escapadas como "" e BOM UTF-8.
export function parseCsv(text: string): string[][] {
  // Remove BOM se presente
  let t = text.replace(/^﻿/, "");
  // Normaliza quebras
  t = t.replace(/\r\n?/g, "\n");

  // Detecta separador olhando a primeira linha não vazia
  const firstLine = t.split("\n").find((l) => l.trim().length > 0) ?? "";
  const sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        val += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        cur.push(val);
        val = "";
      } else if (c === "\n") {
        cur.push(val);
        rows.push(cur);
        cur = [];
        val = "";
      } else {
        val += c;
      }
    }
  }
  // Última linha
  if (val.length > 0 || cur.length > 0) {
    cur.push(val);
    rows.push(cur);
  }
  // Remove linhas totalmente vazias
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// Normaliza header de coluna pra match flexível
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

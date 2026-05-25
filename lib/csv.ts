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

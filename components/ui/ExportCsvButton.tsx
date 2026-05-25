"use client";

import { Download } from "lucide-react";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";

type Props<T> = {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string;
  label?: string;
};

export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
  label = "CSV",
}: Props<T>) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      disabled={rows.length === 0}
      className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      title={rows.length === 0 ? "Nada para exportar" : `Exportar ${rows.length} linha${rows.length === 1 ? "" : "s"}`}
    >
      <Download size={14} /> {label}
    </button>
  );
}

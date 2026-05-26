"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const IGNORADOS = new Set([
  "updated_at",
  "created_at",
  "id",
]);

type Acao = "INSERT" | "UPDATE" | "DELETE";

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function DiffRow({
  acao,
  antes,
  depois,
}: {
  acao: Acao;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);

  const changes = computeChanges(acao, antes, depois);

  if (changes.length === 0) return null;

  // Resumo compacto: 2 primeiras mudanças inline
  const previa = changes
    .slice(0, 2)
    .map((c) => c.campo)
    .join(", ");

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-gold hover:text-verde-dark inline-flex items-center gap-1"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {changes.length} {changes.length === 1 ? "campo" : "campos"} • {previa}
        {changes.length > 2 && ` …`}
      </button>
      {open && (
        <div className="mt-2 border border-card-border rounded-md bg-gray-50/50 divide-y divide-card-border text-xs">
          {changes.map((c) => (
            <div key={c.campo} className="px-3 py-2 grid grid-cols-12 gap-2">
              <div className="col-span-3 text-gray-500 font-medium">
                {c.campo}
              </div>
              {acao === "UPDATE" ? (
                <>
                  <div className="col-span-4 text-gray-600 line-through truncate">
                    {fmt(c.antes)}
                  </div>
                  <div className="col-span-5 text-verde-dark truncate">
                    {fmt(c.depois)}
                  </div>
                </>
              ) : (
                <div className="col-span-9 text-gray-800 truncate">
                  {fmt(acao === "INSERT" ? c.depois : c.antes)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function computeChanges(
  acao: Acao,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null
) {
  const out: { campo: string; antes: unknown; depois: unknown }[] = [];

  if (acao === "INSERT" && depois) {
    for (const [k, v] of Object.entries(depois)) {
      if (IGNORADOS.has(k)) continue;
      if (v === null || v === "" || v === false) continue;
      out.push({ campo: k, antes: null, depois: v });
    }
  } else if (acao === "DELETE" && antes) {
    for (const [k, v] of Object.entries(antes)) {
      if (IGNORADOS.has(k)) continue;
      if (v === null || v === "" || v === false) continue;
      out.push({ campo: k, antes: v, depois: null });
    }
  } else if (acao === "UPDATE" && antes && depois) {
    const todos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const k of todos) {
      if (IGNORADOS.has(k)) continue;
      const a = antes[k];
      const d = depois[k];
      // Comparação simples (JSON pra arrays/objetos)
      const eq =
        typeof a === "object" || typeof d === "object"
          ? JSON.stringify(a ?? null) === JSON.stringify(d ?? null)
          : a === d;
      if (!eq) {
        out.push({ campo: k, antes: a, depois: d });
      }
    }
  }

  return out;
}

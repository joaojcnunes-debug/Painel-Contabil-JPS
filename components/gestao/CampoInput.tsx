"use client";

import { inputClass } from "@/components/ui/Field";
import { formatBRL } from "@/lib/utils";
import type { GestaoCampo, TipoCampo } from "@/lib/gestao/types";

type Props = {
  campo: GestaoCampo;
  valor: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
};

// Renderiza input adequado ao tipo do campo personalizado.
export function CampoInput({ campo, valor, onChange, disabled }: Props) {
  switch (campo.tipo) {
    case "texto":
    case "url":
      return (
        <input
          type={campo.tipo === "url" ? "url" : "text"}
          className={inputClass}
          value={(valor as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          placeholder={campo.tipo === "url" ? "https://…" : ""}
        />
      );
    case "numero":
      return (
        <input
          type="number"
          className={inputClass}
          value={(valor as number | null) ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled}
        />
      );
    case "moeda":
      return (
        <input
          type="number"
          step="0.01"
          min="0"
          className={inputClass}
          value={(valor as number | null) ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled}
          placeholder="0,00"
        />
      );
    case "data":
      return (
        <input
          type="date"
          className={inputClass}
          value={(valor as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      );
    case "checkbox":
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!valor}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          {valor ? "Sim" : "Não"}
        </label>
      );
    case "selecao":
      return (
        <select
          className={inputClass}
          value={(valor as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        >
          <option value="">—</option>
          {campo.opcoes.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    case "multi": {
      const sel = new Set(Array.isArray(valor) ? (valor as string[]) : []);
      return (
        <div className="flex flex-wrap gap-1">
          {campo.opcoes.length === 0 ? (
            <span className="text-xs text-gray-400 italic">Sem opções definidas</span>
          ) : (
            campo.opcoes.map((op) => {
              const ativo = sel.has(op);
              return (
                <button
                  key={op}
                  type="button"
                  onClick={() => {
                    const n = new Set(sel);
                    if (n.has(op)) n.delete(op);
                    else n.add(op);
                    onChange(Array.from(n));
                  }}
                  disabled={disabled}
                  className={
                    ativo
                      ? "text-xs px-2 py-0.5 rounded border border-verde-primary bg-verde-light text-verde-dark"
                      : "text-xs px-2 py-0.5 rounded border border-card-border text-gray-700 hover:border-verde-primary"
                  }
                >
                  {op}
                </button>
              );
            })
          )}
        </div>
      );
    }
  }
}

// Formatador só-leitura pra usar em listagens (ex: TarefaCard)
export function formatarCampoValor(tipo: TipoCampo, valor: unknown): string {
  if (valor == null || valor === "") return "—";
  switch (tipo) {
    case "moeda":
      return typeof valor === "number" ? formatBRL(valor) : String(valor);
    case "checkbox":
      return valor ? "Sim" : "Não";
    case "multi":
      return Array.isArray(valor) ? valor.join(", ") : String(valor);
    case "data":
      return typeof valor === "string" && valor.length >= 10
        ? valor.slice(0, 10).split("-").reverse().join("/")
        : String(valor);
    default:
      return String(valor);
  }
}

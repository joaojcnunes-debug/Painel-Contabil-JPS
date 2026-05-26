"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type MultiSelectItem = {
  id: string;
  label: string;
  sub?: string;
};

type Props = {
  items: MultiSelectItem[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  placeholder?: string;
  searchable?: boolean;
  maxHeight?: number;
};

export function MultiSelectDropdown({
  items,
  selected,
  onChange,
  placeholder = "Selecione...",
  searchable = true,
  maxHeight = 240,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.sub ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const summary =
    selected.size === 0
      ? placeholder
      : allSelected
      ? `Todos (${items.length})`
      : selected.size === 1
      ? items.find((i) => selected.has(i.id))?.label ?? "1 selecionado"
      : `${selected.size} selecionados`;

  function toggleAll(marcar: boolean) {
    if (marcar) onChange(new Set(items.map((i) => i.id)));
    else onChange(new Set());
  }

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-sm text-left flex items-center justify-between gap-2 bg-white"
      >
        <span
          className={cn(
            "truncate",
            selected.size === 0 ? "text-gray-400" : "text-gray-800"
          )}
        >
          {summary}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-gray-400 transition flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-card-border rounded-lg shadow-xl overflow-hidden">
          {searchable && (
            <div className="px-2 py-2 border-b border-card-border bg-gray-50">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-verde-primary"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-gray-500">
                  {selected.size} de {items.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="text-gold hover:text-verde-dark"
                  >
                    Todos
                  </button>
                  <span className="text-gray-300">/</span>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="text-gold hover:text-verde-dark"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
            </div>
          )}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500">
                Nenhum item encontrado
              </div>
            ) : (
              filtered.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="rounded border-gray-300 text-verde-primary flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-800">{item.label}</div>
                    {item.sub && (
                      <div className="text-xs text-gray-500 truncate">
                        {item.sub}
                      </div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

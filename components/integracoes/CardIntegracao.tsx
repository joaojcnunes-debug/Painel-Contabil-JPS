"use client";

import Link from "next/link";
import { History, Play, Settings } from "lucide-react";
import type { ModuloMeta } from "@/lib/integracoes/core/types";
import type { IntegracaoConfig } from "@/lib/supabase/types";
import { BadgeModo, BadgeStatus } from "./BadgeStatus";

type Props = {
  meta: ModuloMeta;
  config: IntegracaoConfig | null;
  onConsultar: () => void;
  onConfigurar: () => void;
  carregando?: boolean;
};

function tempoRelativo(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.floor(h / 24);
  return `há ${dias}d`;
}

export function CardIntegracao({
  meta,
  config,
  onConsultar,
  onConfigurar,
  carregando,
}: Props) {
  return (
    <div
      className={`border bg-gradient-to-br ${meta.cor} rounded-xl p-4 flex flex-col`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-serif text-base font-bold text-verde-dark leading-tight">
            {meta.nome}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {meta.descricao}
          </div>
        </div>
        <BadgeModo modo={config?.modo} />
      </div>

      <div className="flex items-center gap-2 mt-2 mb-3">
        <BadgeStatus status={config?.ultimo_status} />
        {config?.pendencias_count != null && config.pendencias_count > 0 && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-800">
            {config.pendencias_count} pendência
            {config.pendencias_count > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="text-[11px] text-gray-500 mb-3">
        <strong>Última sincronização:</strong>{" "}
        {tempoRelativo(config?.ultima_sync ?? null)}
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-2 border-t border-card-border">
        <button
          onClick={onConsultar}
          disabled={carregando}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 bg-verde-primary text-white text-xs font-medium rounded hover:bg-verde-accent disabled:opacity-60"
        >
          <Play size={12} />
          {carregando ? "..." : "Consultar"}
        </button>
        <button
          onClick={onConfigurar}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 border border-gray-300 text-xs text-gray-700 rounded hover:bg-white"
          title="Configurar"
        >
          <Settings size={12} />
        </button>
        <Link
          href={`/integracoes/logs?modulo=${meta.id}`}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 border border-gray-300 text-xs text-gray-700 rounded hover:bg-white"
          title="Logs deste módulo"
        >
          <History size={12} />
        </Link>
      </div>
    </div>
  );
}

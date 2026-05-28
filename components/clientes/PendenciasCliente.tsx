"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  FileLock2,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import {
  usePendenciasCliente,
  type PendenciaCliente,
} from "@/lib/hooks/usePendenciasCliente";
import { formatBRL } from "@/lib/utils";

const ICONE: Record<PendenciaCliente["categoria"], React.ElementType> = {
  obrigacao: CalendarCheck,
  fatura: Receipt,
  ecac: ShieldCheck,
  certificado: FileLock2,
};

const CATEGORIA_LABEL: Record<PendenciaCliente["categoria"], string> = {
  obrigacao: "Obrigação",
  fatura: "Honorário",
  ecac: "e-CAC",
  certificado: "Certificado",
};

const SEV_BORDA: Record<PendenciaCliente["severidade"], string> = {
  alta: "border-l-4 border-l-red-alert",
  media: "border-l-4 border-l-amber-500",
  baixa: "border-l-4 border-l-verde-primary",
};

function formatData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00" : iso);
  return d.toLocaleDateString("pt-BR");
}

export function PendenciasCliente({ idCliente }: { idCliente: string }) {
  const { data: pendencias = [], isLoading } = usePendenciasCliente(idCliente);

  const altas = pendencias.filter((p) => p.severidade === "alta").length;
  const total = pendencias.length;

  return (
    <div className="bg-white border border-card-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-card-border bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={16}
            className={altas > 0 ? "text-red-alert" : "text-gold"}
          />
          <h3 className="font-serif text-sm font-semibold text-verde-dark">
            Pendências
          </h3>
          {total > 0 && (
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                altas > 0
                  ? "bg-red-100 text-red-alert"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {total}
              {altas > 0 ? ` (${altas} crítica${altas > 1 ? "s" : ""})` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-card-border">
        {isLoading && (
          <div className="px-4 py-6 text-center text-xs text-gray-500">
            Carregando…
          </div>
        )}
        {!isLoading && pendencias.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            <CheckCircle2
              size={28}
              className="mx-auto text-green-700 mb-2"
            />
            Nenhuma pendência identificada neste cliente.
          </div>
        )}
        {pendencias.map((p) => {
          const Icon = ICONE[p.categoria];
          return (
            <Link
              key={p.id}
              href={p.href}
              className={`px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition ${SEV_BORDA[p.severidade]}`}
            >
              <Icon
                size={16}
                className={
                  p.severidade === "alta"
                    ? "text-red-alert mt-0.5"
                    : p.severidade === "media"
                    ? "text-amber-700 mt-0.5"
                    : "text-verde-primary mt-0.5"
                }
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {p.titulo}
                  </div>
                  {p.valor != null && (
                    <div className="text-sm font-semibold text-verde-dark whitespace-nowrap">
                      {formatBRL(p.valor)}
                    </div>
                  )}
                </div>
                {p.detalhe && (
                  <div className="text-xs text-gray-600 truncate mt-0.5">
                    {p.detalhe}
                  </div>
                )}
                <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                  <span className="uppercase tracking-wide">
                    {CATEGORIA_LABEL[p.categoria]}
                  </span>
                  {p.data && <span>· {formatData(p.data)}</span>}
                  {p.diasAtraso != null && p.diasAtraso > 0 && (
                    <span className="text-red-alert font-semibold">
                      · Atrasado {p.diasAtraso}d
                    </span>
                  )}
                  {p.diasAtraso != null &&
                    p.diasAtraso <= 0 &&
                    p.diasAtraso >= -3 && (
                      <span className="text-amber-700 font-semibold">
                        · Vence em {-p.diasAtraso}d
                      </span>
                    )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

// Card mostra o estado do scrape do portal nfse.gov.br pro cliente selecionado.
// - último run (via integracoes_logs, acao='nfse_scrape')
// - qtd de notas com origem='portal_scrape'
// - mensagem clara sobre o cron diário

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Loader2, Scale } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Props = { idCliente: string };

type UltimoLog = {
  created_at: string;
  status: "OK" | "ERRO";
  response_resumo: { total_notas?: number; salvos?: number } | null;
  erro_mensagem: string | null;
};

async function fetchStatus(idCliente: string) {
  const supabase = createSupabaseBrowserClient();
  const [logsRes, notasRes] = await Promise.all([
    supabase
      .from("integracoes_logs")
      .select("created_at, status, response_resumo, erro_mensagem")
      .eq("id_cliente", idCliente)
      .eq("acao", "nfse_scrape")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nfse_recebidas")
      .select("chave", { count: "exact", head: true })
      .eq("id_cliente", idCliente)
      .eq("origem", "portal_scrape"),
  ]);
  return {
    ultimoLog: (logsRes.data as UltimoLog | null) ?? null,
    totalNotas: notasRes.count ?? 0,
  };
}

export function NfseScrapeStatusCard({ idCliente }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["nfse-scrape-status", idCliente],
    queryFn: () => fetchStatus(idCliente),
    enabled: !!idCliente,
    staleTime: 30_000,
  });

  if (!idCliente) return null;
  if (isLoading) {
    return (
      <div className="bg-white border border-card-border rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Carregando status do scrape…
      </div>
    );
  }

  const log = data?.ultimoLog;
  const total = data?.totalNotas ?? 0;
  const nunca = !log;
  const okRecente =
    !!log && log.status === "OK" && diffHoras(log.created_at) < 26;
  const alerta =
    !nunca && (log.status === "ERRO" || diffHoras(log.created_at) >= 26);

  const cor = nunca
    ? "bg-gray-50 border-gray-200 text-gray-700"
    : okRecente
    ? "bg-green-50 border-green-200 text-green-800"
    : "bg-amber-50 border-amber-300 text-amber-900";

  const Icon = nunca ? Clock : okRecente ? CheckCircle2 : AlertCircle;

  return (
    <div className={`border rounded-xl p-3 mb-4 ${cor}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <div className="font-semibold mb-0.5 flex items-center gap-1">
            <Scale size={12} /> NFSe scrape (portal nfse.gov.br)
          </div>
          {nunca && (
            <div>
              Nunca sincronizou este cliente. O cron diário roda às 03h AM
              (Brasília). Se quiser antecipar, clique em <strong>Sincronizar
              agora</strong> acima.
            </div>
          )}
          {log && (
            <div className="space-y-0.5">
              <div>
                Última sync:{" "}
                <strong>{formatDate(log.created_at)}</strong>
                {" · "}
                {log.status === "OK" ? "OK" : "ERRO"}
                {log.response_resumo?.salvos != null && (
                  <> · {log.response_resumo.salvos} nota(s) desta sync</>
                )}
                {log.erro_mensagem && (
                  <> · <span className="text-red-alert">{log.erro_mensagem}</span></>
                )}
              </div>
              <div className="text-[11px] opacity-80">
                Total no banco (origem=portal_scrape): <strong>{total}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function diffHoras(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

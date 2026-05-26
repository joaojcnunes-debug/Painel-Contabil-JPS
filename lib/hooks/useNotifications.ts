"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type NotificationItem = {
  id: string;
  tipo: "obrigacao" | "documento" | "fatura";
  titulo: string;
  subtitulo: string;
  href: string;
  data: string;
  prioridade: "alta" | "media" | "baixa";
};

const HORAS_24 = 24 * 60 * 60 * 1000;

function isoFutDias(d: number) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}

function isoPastMs(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

export function useNotifications(perfil: string | null | undefined) {
  const ehEquipe =
    perfil === "Admin" || perfil === "Contador" || perfil === "Assistente";

  return useQuery({
    queryKey: ["notifications", perfil ?? "anon"],
    enabled: !!perfil,
    refetchInterval: 60_000, // poll cada 1 min
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const items: NotificationItem[] = [];
      const hoje = new Date().toISOString().slice(0, 10);
      const em3 = isoFutDias(3);

      // 1) Obrigações vencendo nos próximos 3 dias (ou já atrasadas)
      const { data: obrigs } = await supabase
        .from("obrigacoes")
        .select(
          "id_obrigacao, data_vencimento, status, clientes(razao_social), obrigacoes_catalogo(sigla)"
        )
        .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
        .lte("data_vencimento", em3)
        .order("data_vencimento", { ascending: true })
        .limit(15);

      for (const o of (obrigs ?? []) as Array<{
        id_obrigacao: string;
        data_vencimento: string;
        status: string;
        clientes: { razao_social: string } | null;
        obrigacoes_catalogo: { sigla: string } | null;
      }>) {
        const atrasada = o.data_vencimento < hoje;
        const dataBr = new Date(o.data_vencimento + "T12:00").toLocaleDateString(
          "pt-BR"
        );
        items.push({
          id: `obr-${o.id_obrigacao}`,
          tipo: "obrigacao",
          titulo: `${o.obrigacoes_catalogo?.sigla ?? "—"} • ${o.clientes?.razao_social ?? "—"}`,
          subtitulo: atrasada ? `Vencida ${dataBr}` : `Vence ${dataBr}`,
          href: `/obrigacoes/${o.id_obrigacao}`,
          data: o.data_vencimento,
          prioridade: atrasada ? "alta" : "media",
        });
      }

      // 2) Documentos recebidos do portal nas últimas 24h (só equipe)
      if (ehEquipe) {
        const desde = isoPastMs(HORAS_24);
        const { data: docs } = await supabase
          .from("documentos")
          .select(
            "id_documento, id_cliente, arquivo_nome, tipo, created_at, clientes(razao_social)"
          )
          .eq("origem", "CLIENTE")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(10);
        for (const d of (docs ?? []) as Array<{
          id_documento: string;
          id_cliente: string;
          arquivo_nome: string;
          tipo: string;
          created_at: string;
          clientes: { razao_social: string } | null;
        }>) {
          items.push({
            id: `doc-${d.id_documento}`,
            tipo: "documento",
            titulo: `Doc recebido • ${d.clientes?.razao_social ?? "—"}`,
            subtitulo: `${d.tipo} — ${d.arquivo_nome}`,
            href: `/documentos?cliente=${d.id_cliente}`,
            data: d.created_at,
            prioridade: "media",
          });
        }
      }

      // 3) Faturas vencendo em 3 dias / atrasadas (equipe)
      if (ehEquipe) {
        const { data: fats } = await supabase
          .from("faturas")
          .select(
            "id_fatura, id_cliente, competencia, data_vencimento, valor, status, clientes(razao_social)"
          )
          .in("status", ["ABERTA", "ATRASADA"])
          .lte("data_vencimento", em3)
          .order("data_vencimento", { ascending: true })
          .limit(10);
        for (const f of (fats ?? []) as Array<{
          id_fatura: string;
          id_cliente: string;
          competencia: string;
          data_vencimento: string;
          valor: number;
          status: string;
          clientes: { razao_social: string } | null;
        }>) {
          const atrasada =
            f.status === "ATRASADA" || f.data_vencimento < hoje;
          const dataBr = new Date(
            f.data_vencimento + "T12:00"
          ).toLocaleDateString("pt-BR");
          const valor = Number(f.valor ?? 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          items.push({
            id: `fat-${f.id_fatura}`,
            tipo: "fatura",
            titulo: `Fatura ${f.competencia} • ${f.clientes?.razao_social ?? "—"}`,
            subtitulo: `${valor} — ${atrasada ? "venceu" : "vence"} ${dataBr}`,
            href: `/honorarios?cliente=${f.id_cliente}`,
            data: f.data_vencimento,
            prioridade: atrasada ? "alta" : "baixa",
          });
        }
      }

      // Ordena: alta primeiro, depois data
      items.sort((a, b) => {
        const pa = a.prioridade === "alta" ? 0 : a.prioridade === "media" ? 1 : 2;
        const pb = b.prioridade === "alta" ? 0 : b.prioridade === "media" ? 1 : 2;
        if (pa !== pb) return pa - pb;
        return a.data.localeCompare(b.data);
      });

      return items.slice(0, 20);
    },
    staleTime: 30_000,
  });
}

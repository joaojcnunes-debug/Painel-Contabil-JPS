"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type PendenciaCliente = {
  id: string;
  categoria: "obrigacao" | "fatura" | "ecac" | "certificado";
  titulo: string;
  detalhe: string;
  valor: number | null;
  data: string | null;            // YYYY-MM-DD do prazo/vencimento
  diasAtraso: number | null;      // negativo = ainda vai vencer
  severidade: "alta" | "media" | "baixa";
  href: string;
};

function diff(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const d = new Date(dataIso.length === 10 ? dataIso + "T12:00" : dataIso);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function usePendenciasCliente(idCliente: string | undefined) {
  return useQuery({
    queryKey: ["pendencias-cliente", idCliente],
    enabled: !!idCliente,
    refetchInterval: 2 * 60 * 1000,
    queryFn: async () => {
      if (!idCliente) return [];
      const supabase = createSupabaseBrowserClient();
      const items: PendenciaCliente[] = [];

      // 1) Obrigações pendentes/atrasadas (em aberto)
      const { data: obrigs } = await supabase
        .from("obrigacoes")
        .select(
          "id_obrigacao, data_vencimento, status, obrigacoes_catalogo(sigla, nome)"
        )
        .eq("id_cliente", idCliente)
        .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
        .order("data_vencimento", { ascending: true })
        .limit(20);
      for (const o of (obrigs ?? []) as Array<{
        id_obrigacao: string;
        data_vencimento: string;
        status: string;
        obrigacoes_catalogo: { sigla: string; nome: string } | null;
      }>) {
        const d = diff(o.data_vencimento) ?? 0;
        const atrasada = d > 0 || o.status === "ATRASADA";
        items.push({
          id: `obr-${o.id_obrigacao}`,
          categoria: "obrigacao",
          titulo: `${o.obrigacoes_catalogo?.sigla ?? "—"}`,
          detalhe: o.obrigacoes_catalogo?.nome ?? "",
          valor: null,
          data: o.data_vencimento,
          diasAtraso: atrasada ? d : null,
          severidade: atrasada ? "alta" : d >= -3 ? "media" : "baixa",
          href: `/obrigacoes/${o.id_obrigacao}`,
        });
      }

      // 2) Faturas em aberto / atrasadas
      const { data: fats } = await supabase
        .from("faturas")
        .select("id_fatura, competencia, data_vencimento, valor, status")
        .eq("id_cliente", idCliente)
        .in("status", ["ABERTA", "ATRASADA"])
        .order("data_vencimento", { ascending: true })
        .limit(10);
      for (const f of (fats ?? []) as Array<{
        id_fatura: string;
        competencia: string;
        data_vencimento: string;
        valor: number;
        status: string;
      }>) {
        const d = diff(f.data_vencimento) ?? 0;
        const atrasada = d > 0 || f.status === "ATRASADA";
        items.push({
          id: `fat-${f.id_fatura}`,
          categoria: "fatura",
          titulo: `Fatura ${f.competencia}`,
          detalhe: f.status === "ATRASADA" ? "Atrasada" : "Em aberto",
          valor: Number(f.valor ?? 0),
          data: f.data_vencimento,
          diasAtraso: atrasada ? d : null,
          severidade: atrasada ? "alta" : d >= -3 ? "media" : "baixa",
          href: `/honorarios?cliente=${idCliente}`,
        });
      }

      // 3) Sessões e-CAC com pendência ou caixa postal (últimos 7 dias)
      const setediasIso = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: sessoes } = await supabase
        .from("sessoes_ecac")
        .select(
          "id_sessao, iniciada_em, situacao_fiscal, mensagens_nao_lidas, pendencias"
        )
        .eq("id_cliente", idCliente)
        .gte("iniciada_em", setediasIso)
        .order("iniciada_em", { ascending: false })
        .limit(5);
      for (const s of (sessoes ?? []) as Array<{
        id_sessao: string;
        iniciada_em: string;
        situacao_fiscal: string | null;
        mensagens_nao_lidas: number | null;
        pendencias: Array<{
          tipo?: string;
          competencia?: string;
          valor?: number;
          descricao?: string;
        }> | null;
      }>) {
        const tem = s.situacao_fiscal === "PENDENTE" || (s.pendencias?.length ?? 0) > 0;
        if (tem && s.pendencias) {
          // 1 item por pendência detalhada
          for (let i = 0; i < s.pendencias.length; i++) {
            const p = s.pendencias[i];
            items.push({
              id: `ecac-${s.id_sessao}-${i}`,
              categoria: "ecac",
              titulo: `e-CAC: ${p.tipo ?? "Pendência"}`,
              detalhe: [p.competencia, p.descricao].filter(Boolean).join(" — "),
              valor: p.valor ?? null,
              data: null,
              diasAtraso: null,
              severidade: "alta",
              href: `/sessoes-ecac`,
            });
          }
        }
        if ((s.mensagens_nao_lidas ?? 0) > 0) {
          items.push({
            id: `ecac-msg-${s.id_sessao}`,
            categoria: "ecac",
            titulo: `Caixa postal e-CAC`,
            detalhe: `${s.mensagens_nao_lidas} mensagem(ns) não lida(s)`,
            valor: null,
            data: null,
            diasAtraso: null,
            severidade: "media",
            href: `/sessoes-ecac`,
          });
        }
      }

      // 4) Certificado A1 do cliente vencendo em <60 dias
      const { data: certs } = await supabase
        .from("certificados_digitais")
        .select("id_certificado, titular_nome, validade_fim")
        .eq("id_cliente", idCliente)
        .not("validade_fim", "is", null);
      for (const c of (certs ?? []) as Array<{
        id_certificado: string;
        titular_nome: string;
        validade_fim: string;
      }>) {
        const d = diff(c.validade_fim) ?? 0;
        // d>0 = já venceu | d em -60..0 = vencendo
        if (d < -60) continue;
        const vencido = d > 0;
        items.push({
          id: `crt-${c.id_certificado}`,
          categoria: "certificado",
          titulo: `Certificado A1`,
          detalhe: vencido
            ? `Titular ${c.titular_nome} — vencido há ${d} dia(s)`
            : d === 0
            ? `Titular ${c.titular_nome} — vence HOJE`
            : `Titular ${c.titular_nome} — vence em ${-d} dia(s)`,
          valor: null,
          data: c.validade_fim,
          diasAtraso: vencido ? d : null,
          severidade: vencido || -d <= 7 ? "alta" : "media",
          href: `/integracoes/certificados`,
        });
      }

      // Ordena: alta > media > baixa, depois por dias de atraso desc
      items.sort((a, b) => {
        const pa = a.severidade === "alta" ? 0 : a.severidade === "media" ? 1 : 2;
        const pb = b.severidade === "alta" ? 0 : b.severidade === "media" ? 1 : 2;
        if (pa !== pb) return pa - pb;
        const da = a.diasAtraso ?? -999;
        const db = b.diasAtraso ?? -999;
        return db - da;
      });

      return items;
    },
    staleTime: 60_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type NotificationItem = {
  id: string;
  tipo: "obrigacao" | "documento" | "fatura" | "sessao_ecac" | "certificado";
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

export function useNotifications(
  perfil: string | null | undefined,
  idCliente?: string | null
) {
  const ehEquipe =
    perfil === "Admin" || perfil === "Contador" || perfil === "Assistente";
  const ehCliente = perfil === "Cliente" && !!idCliente;

  return useQuery({
    queryKey: ["notifications", perfil ?? "anon", idCliente ?? ""],
    enabled: !!perfil && (ehEquipe || ehCliente),
    refetchInterval: 5 * 60_000, // poll cada 5 min (era 1 min — muito agressivo)
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const items: NotificationItem[] = [];
      const hoje = new Date().toISOString().slice(0, 10);
      const em3 = isoFutDias(3);

      // 1) Obrigações vencendo nos próximos 3 dias (ou já atrasadas)
      let obrigQ = supabase
        .from("obrigacoes")
        .select(
          "id_obrigacao, data_vencimento, status, clientes(razao_social), obrigacoes_catalogo(sigla)"
        )
        .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
        .lte("data_vencimento", em3)
        .order("data_vencimento", { ascending: true })
        .limit(15);
      if (ehCliente) obrigQ = obrigQ.eq("id_cliente", idCliente!);
      const { data: obrigs } = await obrigQ;

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
          titulo: ehCliente
            ? `${o.obrigacoes_catalogo?.sigla ?? "—"}`
            : `${o.obrigacoes_catalogo?.sigla ?? "—"} • ${o.clientes?.razao_social ?? "—"}`,
          subtitulo: atrasada ? `Vencida ${dataBr}` : `Vence ${dataBr}`,
          href: ehCliente ? `/portal/obrigacoes` : `/obrigacoes/${o.id_obrigacao}`,
          data: o.data_vencimento,
          prioridade: atrasada ? "alta" : "media",
        });
      }

      // 1.5) Faturas do cliente (em aberto / atrasadas) — só pro próprio cliente
      if (ehCliente) {
        const { data: fatsCli } = await supabase
          .from("faturas")
          .select("id_fatura, competencia, data_vencimento, valor, status")
          .eq("id_cliente", idCliente!)
          .in("status", ["ABERTA", "ATRASADA"])
          .lte("data_vencimento", em3)
          .order("data_vencimento", { ascending: true })
          .limit(10);
        for (const f of (fatsCli ?? []) as Array<{
          id_fatura: string;
          competencia: string;
          data_vencimento: string;
          valor: number;
          status: string;
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
            titulo: `Fatura ${f.competencia}`,
            subtitulo: `${valor} — ${atrasada ? "venceu" : "vence"} ${dataBr}`,
            href: `/portal/financeiro`,
            data: f.data_vencimento,
            prioridade: atrasada ? "alta" : "media",
          });
        }
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

      // 4) Sessões e-CAC com pendência nos últimos 7 dias (só equipe)
      if (ehEquipe) {
        const seteDiasAtras = isoPastMs(7 * HORAS_24);
        const { data: sessoes } = await supabase
          .from("sessoes_ecac")
          .select(
            "id_sessao, id_cliente, iniciada_em, situacao_fiscal, mensagens_nao_lidas, pendencias, clientes(razao_social)"
          )
          .gte("iniciada_em", seteDiasAtras)
          .order("iniciada_em", { ascending: false })
          .limit(10);
        for (const s of (sessoes ?? []) as Array<{
          id_sessao: string;
          id_cliente: string;
          iniciada_em: string;
          situacao_fiscal: string | null;
          mensagens_nao_lidas: number | null;
          pendencias: Array<{ tipo?: string }> | null;
          clientes: { razao_social: string } | null;
        }>) {
          const temPend =
            s.situacao_fiscal === "PENDENTE" ||
            (s.pendencias?.length ?? 0) > 0;
          const temMsg = (s.mensagens_nao_lidas ?? 0) > 0;
          if (!temPend && !temMsg) continue;
          const detalhes: string[] = [];
          if (s.pendencias?.length) {
            const tipos = s.pendencias
              .map((p) => p.tipo)
              .filter(Boolean)
              .slice(0, 3)
              .join(", ");
            detalhes.push(
              `${s.pendencias.length} pendência(s)${tipos ? ` (${tipos})` : ""}`
            );
          }
          if (temMsg) {
            detalhes.push(`${s.mensagens_nao_lidas} msg(s) na caixa postal`);
          }
          items.push({
            id: `ecac-${s.id_sessao}`,
            tipo: "sessao_ecac",
            titulo: `e-CAC • ${s.clientes?.razao_social ?? "—"}`,
            subtitulo: detalhes.join(" · "),
            href: `/sessoes-ecac`,
            data: s.iniciada_em,
            prioridade: temPend ? "alta" : "media",
          });
        }
      }

      // 5) Certificados A1 vencendo em <30 dias ou já vencidos (só equipe)
      if (ehEquipe) {
        const em30 = isoFutDias(30);
        const { data: certs } = await supabase
          .from("certificados_digitais")
          .select(
            "id_certificado, titular_nome, validade_fim, id_cliente, clientes(razao_social)"
          )
          .not("validade_fim", "is", null)
          .lte("validade_fim", em30)
          .order("validade_fim", { ascending: true })
          .limit(10);
        for (const c of (certs ?? []) as Array<{
          id_certificado: string;
          titular_nome: string;
          validade_fim: string;
          id_cliente: string | null;
          clientes: { razao_social: string } | null;
        }>) {
          const venc = new Date(c.validade_fim + "T12:00");
          const dias = Math.ceil((venc.getTime() - Date.now()) / 86400000);
          const vencido = dias < 0;
          const dataBr = venc.toLocaleDateString("pt-BR");
          const escopo = c.clientes?.razao_social ?? "Escritório";
          items.push({
            id: `crt-${c.id_certificado}`,
            tipo: "certificado",
            titulo: `Certificado • ${c.titular_nome}`,
            subtitulo: vencido
              ? `VENCIDO há ${-dias}d (${dataBr}) — ${escopo}`
              : dias === 0
              ? `Vence HOJE (${dataBr}) — ${escopo}`
              : `Vence em ${dias}d (${dataBr}) — ${escopo}`,
            href: `/integracoes/certificados`,
            data: c.validade_fim,
            prioridade: vencido || dias <= 7 ? "alta" : "media",
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
    staleTime: 2 * 60_000,
  });
}

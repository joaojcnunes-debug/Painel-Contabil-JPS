// Edge Function: enviar-alertas-diarios-equipe
//
// Envia 1 e-mail consolidado por dia pra cada usuário da equipe
// (Admin/Contador) com todas as pendências críticas dos clientes.
// Diferente de `enviar-alertas-vencimento` (que envia pra cada cliente),
// essa é a VISÃO INTERNA da equipe.
//
// O que aparece no e-mail:
// 1. Obrigações fiscais atrasadas / vencendo em 3 dias
// 2. Faturas (honorários) em aberto / atrasadas
// 3. Sessões e-CAC registradas nos últimos 7 dias com pendência
// 4. Certificados A1 vencendo em <30 dias
//
// Modos:
//   GET ou POST {}              → envio real
//   POST { dry_run: true }      → não envia, devolve o que enviaria
//   POST { to: "x@y.com" }      → envia TUDO pra esse e-mail (teste)
//
// Variáveis:
//   - RESEND_API_KEY (obrigatório)
//   - EMAIL_FROM (opcional, default "JSP <onboarding@resend.dev>")
//
// Agendamento (pg_cron):
//   SELECT cron.schedule(
//     'alertas-diarios-equipe',
//     '0 11 * * *',  -- 8h Brasília (UTC-3)
//     $$
//       SELECT net.http_post(
//         url := 'https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-alertas-diarios-equipe',
//         headers := jsonb_build_object('Authorization', 'Bearer SEU_ANON_KEY'),
//         body := '{}'::jsonb
//       );
//     $$
//   );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ClienteMin = { razao_social: string };
type ObrigRow = {
  id_obrigacao: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  status: string;
  clientes: ClienteMin | null;
  obrigacoes_catalogo: { sigla: string } | null;
};
type FaturaRow = {
  id_fatura: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  status: string;
  clientes: ClienteMin | null;
};
type SessaoRow = {
  id_sessao: string;
  id_cliente: string;
  iniciada_em: string;
  situacao_fiscal: string | null;
  mensagens_nao_lidas: number | null;
  pendencias: Array<{
    tipo?: string;
    competencia?: string;
    valor?: number;
    descricao?: string;
  }> | null;
  clientes: ClienteMin | null;
};
type CertRow = {
  id_certificado: string;
  id_cliente: string | null;
  titular_nome: string;
  validade_fim: string;
  clientes: ClienteMin | null;
};
type UsuarioEquipe = {
  email: string;
  nome: string | null;
  perfil: string;
};

type ItemAlerta = {
  categoria: "obrigacao" | "fatura" | "ecac" | "certificado";
  cliente: string;
  titulo: string;
  detalhe: string;
  data: string | null;
  valor: number | null;
  severidade: "alta" | "media";
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function diff(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso.length === 10 ? iso + "T12:00" : iso);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST")
    return json({ error: "Método não permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM =
      Deno.env.get("EMAIL_FROM") ??
      "JSP Contabilidade <onboarding@resend.dev>";

    if (!RESEND_KEY) {
      return json(
        { error: "RESEND_API_KEY não configurado" },
        500
      );
    }

    let body: { dry_run?: boolean; to?: string } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        /* ok */
      }
    }
    const dryRun = !!body.dry_run;
    const forceTo = body.to ? String(body.to).trim().toLowerCase() : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const hoje = new Date().toISOString().slice(0, 10);
    const em3 = new Date();
    em3.setDate(em3.getDate() + 3);
    const em3Iso = em3.toISOString().slice(0, 10);
    const em30 = new Date();
    em30.setDate(em30.getDate() + 30);
    const em30Iso = em30.toISOString().slice(0, 10);
    const sete = new Date();
    sete.setDate(sete.getDate() - 7);
    const seteIso = sete.toISOString();

    const itens: ItemAlerta[] = [];

    // 1) Obrigações em aberto vencendo em <=3 dias
    const { data: obrigs } = await admin
      .from("obrigacoes")
      .select(
        "id_obrigacao, id_cliente, competencia, data_vencimento, status, clientes(razao_social), obrigacoes_catalogo(sigla)"
      )
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
      .lte("data_vencimento", em3Iso)
      .order("data_vencimento", { ascending: true });
    for (const o of (obrigs ?? []) as unknown as ObrigRow[]) {
      const atrasada = o.data_vencimento < hoje || o.status === "ATRASADA";
      itens.push({
        categoria: "obrigacao",
        cliente: o.clientes?.razao_social ?? "—",
        titulo: `${o.obrigacoes_catalogo?.sigla ?? "—"} • ${o.competencia}`,
        detalhe: atrasada
          ? `Vencida ${new Date(o.data_vencimento + "T12:00").toLocaleDateString("pt-BR")}`
          : `Vence ${new Date(o.data_vencimento + "T12:00").toLocaleDateString("pt-BR")}`,
        data: o.data_vencimento,
        valor: null,
        severidade: atrasada ? "alta" : "media",
      });
    }

    // 2) Faturas em aberto/atrasadas vencendo em <=3 dias
    const { data: fats } = await admin
      .from("faturas")
      .select(
        "id_fatura, id_cliente, competencia, data_vencimento, valor, status, clientes(razao_social)"
      )
      .in("status", ["ABERTA", "ATRASADA"])
      .lte("data_vencimento", em3Iso);
    for (const f of (fats ?? []) as unknown as FaturaRow[]) {
      const atrasada = f.data_vencimento < hoje || f.status === "ATRASADA";
      itens.push({
        categoria: "fatura",
        cliente: f.clientes?.razao_social ?? "—",
        titulo: `Honorário ${f.competencia}`,
        detalhe: atrasada
          ? `Atrasada (venc. ${new Date(f.data_vencimento + "T12:00").toLocaleDateString("pt-BR")})`
          : `Vence ${new Date(f.data_vencimento + "T12:00").toLocaleDateString("pt-BR")}`,
        data: f.data_vencimento,
        valor: Number(f.valor ?? 0),
        severidade: atrasada ? "alta" : "media",
      });
    }

    // 3) Sessões e-CAC últimos 7 dias com pendência
    const { data: sessoes } = await admin
      .from("sessoes_ecac")
      .select(
        "id_sessao, id_cliente, iniciada_em, situacao_fiscal, mensagens_nao_lidas, pendencias, clientes(razao_social)"
      )
      .gte("iniciada_em", seteIso)
      .order("iniciada_em", { ascending: false });
    for (const s of (sessoes ?? []) as unknown as SessaoRow[]) {
      const temPend =
        s.situacao_fiscal === "PENDENTE" || (s.pendencias?.length ?? 0) > 0;
      const temMsg = (s.mensagens_nao_lidas ?? 0) > 0;
      if (!temPend && !temMsg) continue;
      if (s.pendencias?.length) {
        for (const p of s.pendencias) {
          itens.push({
            categoria: "ecac",
            cliente: s.clientes?.razao_social ?? "—",
            titulo: `e-CAC: ${p.tipo ?? "Pendência"}`,
            detalhe: [p.competencia, p.descricao].filter(Boolean).join(" — "),
            data: null,
            valor: p.valor ?? null,
            severidade: "alta",
          });
        }
      }
      if (temMsg) {
        itens.push({
          categoria: "ecac",
          cliente: s.clientes?.razao_social ?? "—",
          titulo: "Caixa postal e-CAC",
          detalhe: `${s.mensagens_nao_lidas} mensagem(ns) não lida(s)`,
          data: null,
          valor: null,
          severidade: "media",
        });
      }
    }

    // 4) Certificados A1 vencendo em <=30 dias
    const { data: certs } = await admin
      .from("certificados_digitais")
      .select(
        "id_certificado, id_cliente, titular_nome, validade_fim, clientes(razao_social)"
      )
      .not("validade_fim", "is", null)
      .lte("validade_fim", em30Iso);
    for (const c of (certs ?? []) as unknown as CertRow[]) {
      const d = diff(c.validade_fim);
      const vencido = d > 0;
      itens.push({
        categoria: "certificado",
        cliente: c.clientes?.razao_social ?? "Escritório",
        titulo: `Cert A1 — ${c.titular_nome}`,
        detalhe: vencido
          ? `VENCIDO há ${d} dia(s)`
          : d === 0
          ? `Vence HOJE`
          : `Vence em ${-d} dia(s)`,
        data: c.validade_fim,
        valor: null,
        severidade: vencido || -d <= 7 ? "alta" : "media",
      });
    }

    // Sem nada a alertar
    if (itens.length === 0) {
      return json({
        ok: true,
        enviados: 0,
        mensagem: "Sem pendências críticas hoje 🎉",
      });
    }

    // Agrupa por cliente
    const porCliente = new Map<string, ItemAlerta[]>();
    for (const i of itens) {
      const arr = porCliente.get(i.cliente) ?? [];
      arr.push(i);
      porCliente.set(i.cliente, arr);
    }

    const totalAltas = itens.filter((i) => i.severidade === "alta").length;
    const clientesAfetados = porCliente.size;

    // Busca usuários equipe pra enviar
    const { data: usuariosData } = await admin
      .from("usuarios")
      .select("email, nome, perfil")
      .in("perfil", ["Admin", "Contador"])
      .eq("ativo", true);
    const usuarios = (usuariosData ?? []) as UsuarioEquipe[];

    if (usuarios.length === 0) {
      return json({
        ok: false,
        erro: "Nenhum Admin/Contador ativo encontrado",
      });
    }

    const enviar = forceTo
      ? [{ email: forceTo, nome: "Teste", perfil: "Admin" }]
      : usuarios;

    const html = buildHtml(porCliente, totalAltas, clientesAfetados);
    const subject = `JSP — ${itens.length} pendência(s) hoje (${totalAltas} crítica${totalAltas !== 1 ? "s" : ""})`;

    let enviados = 0;
    const falhas: Array<{ destinatario: string; erro: string }> = [];

    if (dryRun) {
      return json({
        ok: true,
        modo: "dry_run",
        total_itens: itens.length,
        criticas: totalAltas,
        clientes_afetados: clientesAfetados,
        destinatarios: enviar.map((u) => u.email),
        preview_html: html.slice(0, 500) + "...",
      });
    }

    for (const u of enviar) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: u.email,
            subject,
            html,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => res.statusText);
          falhas.push({
            destinatario: u.email,
            erro: `HTTP ${res.status} — ${txt}`,
          });
        } else {
          enviados++;
        }
      } catch (e) {
        falhas.push({
          destinatario: u.email,
          erro: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({
      ok: true,
      modo: forceTo ? "test_to" : "real",
      enviados,
      total_itens: itens.length,
      criticas: totalAltas,
      clientes_afetados: clientesAfetados,
      falhas,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function buildHtml(
  porCliente: Map<string, ItemAlerta[]>,
  totalAltas: number,
  clientesAfetados: number
): string {
  const hojeBr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const corCategoria: Record<string, string> = {
    obrigacao: "#3B82F6",
    fatura: "#A88440",
    ecac: "#10B981",
    certificado: "#6B7280",
  };

  const seccoes = Array.from(porCliente.entries())
    .map(([cliente, itens]) => {
      const altas = itens.filter((i) => i.severidade === "alta").length;
      const linhas = itens
        .map((i) => {
          const cor = i.severidade === "alta" ? "#B5462A" : "#A88440";
          const valorStr =
            i.valor != null
              ? `<span style="color:#2A3014;font-weight:600;">R$ ${i.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>`
              : "";
          return `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;border-left:3px solid ${cor};">
                <div style="font-size:13px;color:#2A3014;">
                  <strong>${escapeHtml(i.titulo)}</strong>
                  ${valorStr ? "&nbsp;·&nbsp;" + valorStr : ""}
                </div>
                <div style="font-size:11px;color:#666;margin-top:2px;">
                  <span style="display:inline-block;padding:1px 6px;background:${corCategoria[i.categoria]}20;color:${corCategoria[i.categoria]};border-radius:3px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">
                    ${i.categoria}
                  </span>
                  &nbsp;${escapeHtml(i.detalhe)}
                </div>
              </td>
            </tr>`;
        })
        .join("");

      return `
        <div style="margin-bottom:24px;">
          <h3 style="font-family:Georgia,serif;color:#2A3014;margin:0 0 8px;font-size:16px;">
            ${escapeHtml(cliente)}
            ${altas > 0 ? `<span style="font-size:11px;color:#B5462A;font-weight:normal;">&nbsp;· ${altas} crítica${altas !== 1 ? "s" : ""}</span>` : ""}
          </h3>
          <table style="width:100%;border-collapse:collapse;background:#fff;">
            <tbody>${linhas}</tbody>
          </table>
        </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4EFE0;font-family:Arial,Helvetica,sans-serif;color:#2A3014;">
  <div style="max-width:680px;margin:0 auto;padding:20px;">
    <div style="background:white;border-radius:12px;overflow:hidden;border:1px solid #E3DBC4;">
      <div style="text-align:center;padding:24px;border-bottom:2px solid #A88440;">
        <div style="font-family:Georgia,serif;font-size:34px;font-weight:bold;color:#A88440;letter-spacing:-2px;">JSP</div>
        <div style="font-size:10px;letter-spacing:4px;color:#A88440;margin-top:4px;">CONTABILIDADE PERSONALIZADA</div>
      </div>
      <div style="padding:24px;">
        <h2 style="font-family:Georgia,serif;color:#2A3014;margin:0 0 4px;">Alertas do dia</h2>
        <p style="color:#888;margin:0 0 20px;font-size:12px;text-transform:capitalize;">
          ${hojeBr}
        </p>

        <div style="background:#FFF3CD;border:1px solid #FFE69C;padding:12px;border-radius:8px;margin-bottom:20px;font-size:13px;">
          <strong style="color:#B5462A;">${totalAltas}</strong> pendência(s) crítica(s)
          em <strong>${clientesAfetados}</strong> cliente(s).
        </div>

        ${seccoes}

        <p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          E-mail automático enviado pela JSP Contabilidade.<br>
          Veja todos os detalhes no painel: <a href="https://painel-contabil-jps.vercel.app/inicio" style="color:#A88440;">painel-contabil-jps.vercel.app</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

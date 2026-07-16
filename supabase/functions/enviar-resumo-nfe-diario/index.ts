// Edge Function: enviar-resumo-nfe-diario
//
// Envia 1 e-mail por dia (padrão 8h Brasília) pra cada usuário da equipe
// com resumo das NFe capturadas pela Distribuição DFe nas últimas 24h.
// Só envia se houve movimento — nada de "0 NFe hoje" caindo na caixa.
//
// Contexto: cliente do escritório NÃO fica olhando o painel o dia inteiro.
// O email diário faz o painel "ir até ele" quando algo relevante acontece.
//
// Modos:
//   GET ou POST {}              → envio real
//   POST { dry_run: true }      → devolve o que enviaria sem mandar
//   POST { to: "x@y.com" }      → envia TUDO só pra esse email (teste)
//   POST { horas: 48 }          → janela custom (default 24)
//
// Variáveis:
//   - GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM_NAME
//
// Agendamento (pg_cron):
//   SELECT cron.schedule(
//     'resumo-nfe-diario',
//     '0 11 * * *',  -- 8h Brasília (UTC-3)
//     $$
//       SELECT net.http_post(
//         url := 'https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-resumo-nfe-diario',
//         headers := jsonb_build_object('Authorization', 'Bearer SEU_ANON_KEY'),
//         body := '{}'::jsonb
//       );
//     $$
//   );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type NfeRow = {
  chave: string;
  id_cliente: string;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  numero: string | null;
  valor_total: number | null;
  baixado_em: string;
  dh_emissao: string | null;
  clientes: { razao_social: string } | null;
};

type UsuarioEquipe = {
  email: string;
  nome: string | null;
  perfil: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST")
    return json({ error: "Método não permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") ?? "JSP Contabilidade";

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json(
        { error: "GMAIL_USER ou GMAIL_APP_PASSWORD não configurados" },
        500
      );
    }
    const FROM = `${FROM_NAME} <${GMAIL_USER}>`;

    let body: { dry_run?: boolean; to?: string; horas?: number } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        /* ok */
      }
    }
    const dryRun = !!body.dry_run;
    const forceTo = body.to ? String(body.to).trim().toLowerCase() : null;
    const horas = Math.max(1, Math.min(168, Number(body.horas ?? 24)));
    const desde = new Date(Date.now() - horas * 3600_000).toISOString();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: nfes } = await admin
      .from("nfe_dfe_recebidas")
      .select(
        "chave, id_cliente, emitente_cnpj, emitente_nome, numero, valor_total, baixado_em, dh_emissao, clientes(razao_social)"
      )
      .gte("baixado_em", desde)
      .order("baixado_em", { ascending: false })
      .limit(1000);

    const rows = (nfes ?? []) as unknown as NfeRow[];

    if (rows.length === 0) {
      return json({
        ok: true,
        enviados: 0,
        mensagem: "Sem NFe novas nas últimas horas — nada a enviar",
        horas,
      });
    }

    // Agrupa por cliente
    type GrupoCliente = {
      cliente_nome: string;
      total_qtd: number;
      total_valor: number;
      emitentes: Map<
        string,
        { nome: string; qtd: number; valor: number }
      >;
    };
    const porCliente = new Map<string, GrupoCliente>();
    for (const r of rows) {
      const cliNome = r.clientes?.razao_social ?? "—";
      const g = porCliente.get(r.id_cliente) ?? {
        cliente_nome: cliNome,
        total_qtd: 0,
        total_valor: 0,
        emitentes: new Map(),
      };
      g.total_qtd += 1;
      g.total_valor += Number(r.valor_total ?? 0);
      const emitKey = r.emitente_cnpj ?? r.emitente_nome ?? "?";
      const e = g.emitentes.get(emitKey) ?? {
        nome: r.emitente_nome ?? "Emitente desconhecido",
        qtd: 0,
        valor: 0,
      };
      e.qtd += 1;
      e.valor += Number(r.valor_total ?? 0);
      g.emitentes.set(emitKey, e);
      porCliente.set(r.id_cliente, g);
    }

    const totalQtd = rows.length;
    const totalValor = rows.reduce(
      (s, r) => s + Number(r.valor_total ?? 0),
      0
    );
    const totalClientes = porCliente.size;

    // Busca destinatários
    const { data: usuariosData } = await admin
      .from("usuarios")
      .select("email, nome, perfil")
      .in("perfil", ["Admin", "Contador", "Assistente"])
      .eq("ativo", true);
    const usuarios = (usuariosData ?? []) as UsuarioEquipe[];

    if (usuarios.length === 0 && !forceTo) {
      return json({
        ok: false,
        erro: "Nenhum Admin/Contador/Assistente ativo encontrado",
      });
    }

    const enviar = forceTo
      ? [{ email: forceTo, nome: "Teste", perfil: "Admin" }]
      : usuarios;

    const html = buildHtml(porCliente, totalQtd, totalValor, totalClientes, horas);
    const subject = `JSP — ${totalQtd} NFe nova${totalQtd > 1 ? "s" : ""} nas últimas ${horas}h (R$ ${totalValor.toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 2 }
    )})`;

    if (dryRun) {
      return json({
        ok: true,
        modo: "dry_run",
        horas,
        total_nfe: totalQtd,
        total_valor: totalValor,
        clientes_afetados: totalClientes,
        destinatarios: enviar.map((u) => u.email),
        preview_html: html.slice(0, 800) + "...",
      });
    }

    const smtp = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    let enviados = 0;
    const falhas: Array<{ destinatario: string; erro: string }> = [];

    try {
      for (const u of enviar) {
        try {
          await smtp.send({ from: FROM, to: u.email, subject, html });
          enviados++;
        } catch (e) {
          falhas.push({
            destinatario: u.email,
            erro: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } finally {
      await smtp.close();
    }

    return json({
      ok: true,
      modo: forceTo ? "test_to" : "real",
      horas,
      enviados,
      total_nfe: totalQtd,
      total_valor: totalValor,
      clientes_afetados: totalClientes,
      falhas,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function buildHtml(
  porCliente: Map<
    string,
    {
      cliente_nome: string;
      total_qtd: number;
      total_valor: number;
      emitentes: Map<string, { nome: string; qtd: number; valor: number }>;
    }
  >,
  totalQtd: number,
  totalValor: number,
  totalClientes: number,
  horas: number
): string {
  const hojeBr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const valorBr = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const seccoes = Array.from(porCliente.values())
    .sort((a, b) => b.total_valor - a.total_valor)
    .map((g) => {
      const emitentes = Array.from(g.emitentes.values())
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 8);
      const linhas = emitentes
        .map(
          (e) => `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">
                <div style="font-size:13px;color:#2A3014;">
                  ${escapeHtml(e.nome)}
                </div>
              </td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;color:#666;">
                ${e.qtd} NFe
              </td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:13px;color:#2A3014;font-weight:600;">
                ${valorBr(e.valor)}
              </td>
            </tr>`
        )
        .join("");
      const restantes = g.emitentes.size - emitentes.length;
      const rodape =
        restantes > 0
          ? `<tr><td colspan="3" style="padding:6px 10px;text-align:center;font-size:11px;color:#888;font-style:italic;">+ ${restantes} outro(s) emitente(s)</td></tr>`
          : "";

      return `
        <div style="margin-bottom:24px;">
          <h3 style="font-family:Georgia,serif;color:#2A3014;margin:0 0 8px;font-size:16px;">
            ${escapeHtml(g.cliente_nome)}
            <span style="font-size:11px;color:#A88440;font-weight:normal;">
              &nbsp;· ${g.total_qtd} NFe · ${valorBr(g.total_valor)}
            </span>
          </h3>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;">
            <tbody>${linhas}${rodape}</tbody>
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
        <h2 style="font-family:Georgia,serif;color:#2A3014;margin:0 0 4px;">Novas NFe capturadas</h2>
        <p style="color:#888;margin:0 0 20px;font-size:12px;text-transform:capitalize;">
          ${hojeBr} · últimas ${horas}h
        </p>

        <div style="background:#F4EFE0;border:1px solid #E3DBC4;padding:16px;border-radius:8px;margin-bottom:24px;">
          <div style="display:flex;gap:20px;flex-wrap:wrap;">
            <div>
              <div style="font-size:24px;font-weight:bold;color:#2A3014;font-family:Georgia,serif;">${totalQtd}</div>
              <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;">NFe capturadas</div>
            </div>
            <div>
              <div style="font-size:24px;font-weight:bold;color:#A88440;font-family:Georgia,serif;">${valorBr(totalValor)}</div>
              <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;">Valor total</div>
            </div>
            <div>
              <div style="font-size:24px;font-weight:bold;color:#2A3014;font-family:Georgia,serif;">${totalClientes}</div>
              <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;">Cliente(s)</div>
            </div>
          </div>
        </div>

        ${seccoes}

        <p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          E-mail automático da JSP Contabilidade. Todas as NFe foram baixadas via Distribuição DFe da SEFAZ e armazenadas no bucket privado.<br>
          Detalhes e download: <a href="https://painel-contabil-jps.vercel.app/integracoes/notas-fiscais/recebidas?desde=${horas}h" style="color:#A88440;">painel-contabil-jps.vercel.app</a>
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

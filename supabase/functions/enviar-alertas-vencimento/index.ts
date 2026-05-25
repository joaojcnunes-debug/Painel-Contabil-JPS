// Edge Function: enviar-alertas-vencimento
//
// Envia 1 e-mail por cliente listando as obrigações que vencem nos
// próximos N dias (default 3). Idempotente — pode ser chamada várias
// vezes no dia (idealmente uma vez ao dia via cron).
//
// Para quem manda? Prioridade:
//   1) Contato principal (clientes_contatos.principal = true) com email
//   2) Qualquer contato com email
//   3) Usuario perfil=Cliente ativo vinculado àquele id_cliente
//   Se nenhum desses tiver email, pula.
//
// Modos:
//   GET ou POST (vazio)         → envio real
//   POST { dry_run: true }      → não envia, devolve o que enviaria
//   POST { to: "x@y.com" }      → envia TUDO pra esse e-mail (teste)
//
// Variáveis necessárias (configurar como Secrets na Edge Function):
//   - RESEND_API_KEY   (obrigatório — re_xxxxx)
//   - EMAIL_FROM       (opcional — default "JSP <onboarding@resend.dev>")
//   - ALERTA_DIAS      (opcional — default 3)
//
// As 3 vars do Supabase (URL, ANON, SERVICE_ROLE) já vêm setadas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type CatalogoMin = { sigla: string; nome: string };
type ClienteMin = { razao_social: string };
type Obrig = {
  id_obrigacao: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  status: string;
  clientes: ClienteMin | null;
  obrigacoes_catalogo: CatalogoMin | null;
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
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM =
      Deno.env.get("EMAIL_FROM") ??
      "JSP Contabilidade <onboarding@resend.dev>";
    const DIAS = Number(Deno.env.get("ALERTA_DIAS") ?? "3");

    if (!RESEND_KEY) {
      return json(
        {
          error:
            "RESEND_API_KEY não configurado. Adicione em Edge Functions → Secrets.",
        },
        500
      );
    }

    // Lê body se for POST
    let body: { dry_run?: boolean; to?: string } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        /* body vazio é ok */
      }
    }
    const dryRun = !!body.dry_run;
    const forceTo = body.to ? String(body.to).trim().toLowerCase() : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS);
    const limiteIso = limite.toISOString().slice(0, 10);

    // 1) Busca obrigações pendentes que vencem no intervalo
    const { data: obrigData, error: errObr } = await admin
      .from("obrigacoes")
      .select(
        "id_obrigacao, id_cliente, competencia, data_vencimento, status, clientes(razao_social), obrigacoes_catalogo(sigla, nome)"
      )
      .in("status", ["PENDENTE", "EM_ANDAMENTO", "ATRASADA"])
      .lte("data_vencimento", limiteIso)
      .order("data_vencimento", { ascending: true });

    if (errObr) return json({ error: errObr.message }, 500);

    // Pega só as que vencem hoje ou nos próximos DIAS dias
    // (já atrasadas tb entram — ajuda a cobrar)
    const obrigacoes = (obrigData ?? []) as unknown as Obrig[];

    if (obrigacoes.length === 0) {
      return json({
        ok: true,
        enviados: 0,
        sem_email: 0,
        mensagem: "Nenhum vencimento próximo nos próximos " + DIAS + " dias",
      });
    }

    // 2) Agrupa por cliente
    const porCliente = new Map<string, Obrig[]>();
    for (const o of obrigacoes) {
      const arr = porCliente.get(o.id_cliente) ?? [];
      arr.push(o);
      porCliente.set(o.id_cliente, arr);
    }

    const idClientes = Array.from(porCliente.keys());

    // 3) Resolve e-mail destinatário por cliente:
    //    contato principal > qualquer contato > usuario portal
    const { data: contatosData } = await admin
      .from("clientes_contatos")
      .select("id_cliente, email, nome, principal")
      .in("id_cliente", idClientes)
      .not("email", "is", null);

    const dest = new Map<string, { email: string; nome: string }>();
    for (const c of (contatosData ?? []) as Array<{
      id_cliente: string;
      email: string | null;
      nome: string;
      principal: boolean;
    }>) {
      if (!c.email) continue;
      const cur = dest.get(c.id_cliente);
      if (!cur || c.principal) {
        dest.set(c.id_cliente, { email: c.email, nome: c.nome });
      }
    }

    const semContato = idClientes.filter((id) => !dest.has(id));
    if (semContato.length > 0) {
      const { data: usersData } = await admin
        .from("usuarios")
        .select("id_cliente, email, nome")
        .in("id_cliente", semContato)
        .eq("perfil", "Cliente")
        .eq("ativo", true);
      for (const u of (usersData ?? []) as Array<{
        id_cliente: string | null;
        email: string;
        nome: string;
      }>) {
        if (u.id_cliente && u.email && !dest.has(u.id_cliente)) {
          dest.set(u.id_cliente, { email: u.email, nome: u.nome });
        }
      }
    }

    // 4) Envia
    let enviados = 0;
    let semEmail = 0;
    const falhas: Array<{ cliente: string; erro: string }> = [];
    const preview: Array<{
      cliente: string;
      destinatario: string;
      qtd: number;
    }> = [];

    for (const [idCliente, items] of porCliente.entries()) {
      const contato = dest.get(idCliente);
      const cliente = items[0].clientes?.razao_social ?? "Cliente";
      if (!contato) {
        semEmail++;
        continue;
      }

      const destinoFinal = forceTo ?? contato.email;
      const html = buildHtml(cliente, contato.nome, items);
      const assunto = `JSP — ${items.length} obrigaç${items.length === 1 ? "ão" : "ões"} a vencer`;

      preview.push({
        cliente,
        destinatario: destinoFinal,
        qtd: items.length,
      });

      if (dryRun) {
        enviados++;
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: destinoFinal,
            subject: assunto,
            html,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => res.statusText);
          falhas.push({ cliente, erro: `HTTP ${res.status} — ${txt}` });
        } else {
          enviados++;
        }
      } catch (e) {
        falhas.push({
          cliente,
          erro: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({
      ok: true,
      modo: dryRun ? "dry_run" : forceTo ? "test_to" : "real",
      enviados,
      sem_email: semEmail,
      falhas,
      preview,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function buildHtml(empresa: string, contato: string, items: Obrig[]): string {
  const linhas = items
    .map((o) => {
      const dataBr = new Date(o.data_vencimento + "T12:00").toLocaleDateString(
        "pt-BR"
      );
      const corVenc =
        o.status === "ATRASADA"
          ? "#B5462A"
          : new Date(o.data_vencimento) <= new Date()
          ? "#B5462A"
          : "#2A3014";
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;">
            <strong style="color:#A88440;">${o.obrigacoes_catalogo?.sigla ?? "—"}</strong>
            <span style="color:#444;">&nbsp;${o.obrigacoes_catalogo?.nome ?? ""}</span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #eee;color:#666;">${o.competencia}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;color:${corVenc};font-weight:600;">
            ${dataBr}
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4EFE0;font-family:Arial,Helvetica,sans-serif;color:#2A3014;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:white;border-radius:12px;overflow:hidden;border:1px solid #E3DBC4;">
      <div style="text-align:center;padding:24px;border-bottom:2px solid #A88440;">
        <div style="font-family:Georgia,serif;font-size:34px;font-weight:bold;color:#A88440;letter-spacing:-2px;">JSP</div>
        <div style="font-size:10px;letter-spacing:4px;color:#A88440;margin-top:4px;">CONTABILIDADE PERSONALIZADA</div>
      </div>
      <div style="padding:24px;">
        <h2 style="font-family:Georgia,serif;color:#2A3014;margin:0 0 8px;">Olá, ${escapeHtml(contato)}!</h2>
        <p style="color:#555;margin:0 0 16px;">
          Os seguintes vencimentos da <strong>${escapeHtml(empresa)}</strong> estão se aproximando ou já passaram:
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#EAEDDA;color:#2A3014;">
              <th style="padding:10px;text-align:left;">Obrigação</th>
              <th style="padding:10px;text-align:left;">Competência</th>
              <th style="padding:10px;text-align:left;">Vencimento</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="font-size:12px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          Mensagem automática enviada pela JSP Contabilidade Personalizada.<br>
          Em caso de dúvidas, fale com sua contadora.
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

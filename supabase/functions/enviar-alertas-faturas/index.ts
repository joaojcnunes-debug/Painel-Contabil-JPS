// Edge Function: enviar-alertas-faturas
//
// Envia 1 e-mail por cliente listando as faturas ABERTA/ATRASADA
// que vencem nos próximos N dias (default 3) ou já estão vencidas.
//
// Para quem manda? Mesma prioridade do alerta de obrigações:
//   1) Contato principal com email
//   2) Qualquer contato com email
//   3) Usuario perfil=Cliente ativo vinculado
//
// Modos:
//   GET ou POST {}              → envio real
//   POST { dry_run: true }      → preview, não envia
//   POST { to: "x@y.com" }      → manda tudo pra esse e-mail (teste)
//
// Secrets necessários (compartilhados com enviar-alertas-vencimento):
//   - GMAIL_USER         (obrigatório)
//   - GMAIL_APP_PASSWORD (obrigatório)
//   - EMAIL_FROM_NAME    (opcional)
//   - ALERTA_DIAS        (opcional, default 3)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type ClienteMin = { razao_social: string };
type Fat = {
  id_fatura: string;
  id_cliente: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  status: string;
  descricao: string | null;
  clientes: ClienteMin | null;
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

function brl(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
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
    const DIAS = Number(Deno.env.get("ALERTA_DIAS") ?? "3");

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json(
        { error: "GMAIL_USER ou GMAIL_APP_PASSWORD não configurados" },
        500
      );
    }
    const FROM = `${FROM_NAME} <${GMAIL_USER}>`;

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

    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS);
    const limiteIso = limite.toISOString().slice(0, 10);

    // Faturas em aberto ou atrasadas com vencimento <= hoje + DIAS
    const { data: fatData, error: errFat } = await admin
      .from("faturas")
      .select(
        "id_fatura, id_cliente, competencia, data_vencimento, valor, status, descricao, clientes(razao_social)"
      )
      .in("status", ["ABERTA", "ATRASADA"])
      .lte("data_vencimento", limiteIso)
      .order("data_vencimento", { ascending: true });

    if (errFat) return json({ error: errFat.message }, 500);

    const faturas = (fatData ?? []) as unknown as Fat[];

    if (faturas.length === 0) {
      if (forceTo) {
        const smtp = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
          },
        });
        try {
          await smtp.send({
            from: FROM,
            to: forceTo,
            subject: "JSP — Teste SMTP (sem faturas)",
            html: `<p>Teste do botão "Teste" em <strong>Faturas a vencer</strong>.</p><p>Não havia faturas nos próximos ${DIAS} dias, então este é um email sintético só pra validar SMTP.</p><p>Hora: ${new Date().toISOString()}</p>`,
          });
          return json({ ok: true, modo: "test_smtp_empty", destinatario: forceTo });
        } catch (e) {
          return json({ ok: false, modo: "test_smtp_empty", erro: e instanceof Error ? e.message : String(e) }, 500);
        } finally {
          await smtp.close();
        }
      }
      return json({
        ok: true,
        enviados: 0,
        sem_email: 0,
        mensagem: `Nenhuma fatura vencendo nos próximos ${DIAS} dias`,
      });
    }

    // Agrupa por cliente
    const porCliente = new Map<string, Fat[]>();
    for (const f of faturas) {
      const arr = porCliente.get(f.id_cliente) ?? [];
      arr.push(f);
      porCliente.set(f.id_cliente, arr);
    }
    const idClientes = Array.from(porCliente.keys());

    // Resolve destinatário
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

    // Envia
    let enviados = 0;
    let semEmail = 0;
    const falhas: Array<{ cliente: string; erro: string }> = [];
    const preview: Array<{
      cliente: string;
      destinatario: string;
      qtd: number;
      total: number;
    }> = [];

    const smtp = dryRun
      ? null
      : new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
          },
        });

    try {
      for (const [idCliente, items] of porCliente.entries()) {
        const contato = dest.get(idCliente);
        const cliente = items[0].clientes?.razao_social ?? "Cliente";
        const total = items.reduce((acc, f) => acc + Number(f.valor ?? 0), 0);

        if (!contato) {
          semEmail++;
          continue;
        }

        const destinoFinal = forceTo ?? contato.email;
        const html = buildHtml(cliente, contato.nome, items, total);
        const temAtraso = items.some((f) => f.status === "ATRASADA");
        const assunto = temAtraso
          ? `JSP — Fatura${items.length === 1 ? "" : "s"} em atraso — ${brl(total)}`
          : `JSP — Fatura${items.length === 1 ? "" : "s"} a vencer — ${brl(total)}`;

        preview.push({
          cliente,
          destinatario: destinoFinal,
          qtd: items.length,
          total,
        });

        if (dryRun) {
          enviados++;
          continue;
        }

        try {
          await smtp!.send({
            from: FROM,
            to: destinoFinal,
            subject: assunto,
            html,
          });
          enviados++;
        } catch (e) {
          falhas.push({
            cliente,
            erro: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } finally {
      if (smtp) await smtp.close();
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

function buildHtml(
  empresa: string,
  contato: string,
  items: Fat[],
  total: number
): string {
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = items
    .map((f) => {
      const dataBr = new Date(
        f.data_vencimento + "T12:00"
      ).toLocaleDateString("pt-BR");
      const atrasada =
        f.status === "ATRASADA" || f.data_vencimento < hoje;
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;">
            <strong style="color:#2A3014;">${escapeHtml(f.descricao ?? `Honorários ${f.competencia}`)}</strong>
          </td>
          <td style="padding:10px;border-bottom:1px solid #eee;color:${atrasada ? "#B5462A" : "#2A3014"};font-weight:600;">
            ${dataBr}${atrasada ? " (atrasada)" : ""}
          </td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;color:#2A3014;font-weight:700;">
            ${brl(Number(f.valor))}
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
          As seguintes faturas da <strong>${escapeHtml(empresa)}</strong> estão se aproximando ou já passaram do vencimento:
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#EAEDDA;color:#2A3014;">
              <th style="padding:10px;text-align:left;">Descrição</th>
              <th style="padding:10px;text-align:left;">Vencimento</th>
              <th style="padding:10px;text-align:right;">Valor</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
          <tfoot>
            <tr style="background:#F4EFE0;">
              <td colspan="2" style="padding:12px 10px;text-align:right;font-weight:600;color:#2A3014;">Total:</td>
              <td style="padding:12px 10px;text-align:right;font-weight:700;color:#A88440;font-size:16px;">
                ${brl(total)}
              </td>
            </tr>
          </tfoot>
        </table>
        <p style="font-size:12px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          Caso o pagamento já tenha sido efetuado, desconsidere este aviso.<br>
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

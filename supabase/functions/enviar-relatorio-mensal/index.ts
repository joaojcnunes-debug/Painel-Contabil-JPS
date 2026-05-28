// Edge Function: enviar-relatorio-mensal
//
// Envia 1 e-mail por cliente ativo com resumo do mês:
// - Obrigações entregues / pendentes / atrasadas
// - Faturas pagas / em aberto
// - Receitas / despesas / saldo contábil
// - Documentos recebidos
// - Link pra acessar o portal
//
// Para quem manda? Mesma prioridade dos outros alertas:
//   1) Contato principal com email
//   2) Qualquer contato com email
//   3) Usuário perfil=Cliente ativo
//
// Modos:
//   POST {}                        → envio real (competência = mês anterior)
//   POST { competencia: "2026-04" } → competência específica
//   POST { dry_run: true }         → preview
//   POST { to: "x@y.com" }         → envia tudo pra esse e-mail (teste)
//
// Secrets:
//   - GMAIL_USER         (obrigatório)
//   - GMAIL_APP_PASSWORD (obrigatório)
//   - EMAIL_FROM_NAME    (opcional)
//   - PORTAL_URL         (opcional — default: https://painel-contabil-jps.vercel.app)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rangeDoMes(comp: string) {
  const [y, m] = comp.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return {
    ini: `${comp}-01`,
    fim: `${comp}-${String(ultimo).padStart(2, "0")}`,
    nome: new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    }),
  };
}

type Cliente = {
  id_cliente: string;
  razao_social: string;
  nome_fantasia: string | null;
};

type Resumo = {
  cliente: Cliente;
  obrigEntregues: number;
  obrigPendentes: number;
  obrigAtrasadas: number;
  fatPaga: number;
  fatAberta: number;
  receitas: number;
  despesas: number;
  saldo: number;
  docs: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "Use POST" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") ?? "JSP Contabilidade";
    const PORTAL_URL =
      Deno.env.get("PORTAL_URL") ?? "https://painel-contabil-jps.vercel.app";

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD)
      return json(
        { error: "GMAIL_USER ou GMAIL_APP_PASSWORD não configurados" },
        500
      );
    const FROM = `${FROM_NAME} <${GMAIL_USER}>`;

    let body: { competencia?: string; dry_run?: boolean; to?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* vazio ok */
    }
    const competencia = body.competencia ?? mesAnterior();
    if (!/^\d{4}-\d{2}$/.test(competencia))
      return json({ error: "competência inválida (YYYY-MM)" }, 400);
    const dryRun = !!body.dry_run;
    const forceTo = body.to ? String(body.to).trim().toLowerCase() : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { ini, fim, nome: mesNome } = rangeDoMes(competencia);

    // 1) Configurações
    const { data: cfgData } = await admin
      .from("configuracoes")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const cfg = cfgData as
      | {
          nome_escritorio?: string;
          logo_url?: string | null;
          email?: string | null;
          telefone?: string | null;
        }
      | null;

    // 2) Clientes ativos
    const { data: clData, error: errCl } = await admin
      .from("clientes")
      .select("id_cliente, razao_social, nome_fantasia")
      .eq("status", "Ativo");
    if (errCl) return json({ error: errCl.message }, 500);
    const clientes = (clData ?? []) as unknown as Cliente[];

    if (clientes.length === 0)
      return json({ ok: true, competencia, enviados: 0, sem_email: 0 });

    const idsClientes = clientes.map((c) => c.id_cliente);

    // 3) Busca todos os dados do período de uma vez (mais barato que N+1)
    const [
      { data: obrigData },
      { data: fatData },
      { data: lancData },
      { data: docData },
    ] = await Promise.all([
      admin
        .from("obrigacoes")
        .select("id_cliente, status")
        .in("id_cliente", idsClientes)
        .eq("competencia", competencia),
      admin
        .from("faturas")
        .select("id_cliente, valor, status")
        .in("id_cliente", idsClientes)
        .eq("competencia", competencia),
      admin
        .from("lancamentos")
        .select("id_cliente, tipo, valor")
        .in("id_cliente", idsClientes)
        .gte("data_lancamento", ini)
        .lte("data_lancamento", fim),
      admin
        .from("documentos")
        .select("id_cliente")
        .in("id_cliente", idsClientes)
        .gte("created_at", `${ini}T00:00:00`)
        .lte("created_at", `${fim}T23:59:59`),
    ]);

    // 4) Agrupa por cliente
    const resumos = new Map<string, Resumo>();
    for (const c of clientes) {
      resumos.set(c.id_cliente, {
        cliente: c,
        obrigEntregues: 0,
        obrigPendentes: 0,
        obrigAtrasadas: 0,
        fatPaga: 0,
        fatAberta: 0,
        receitas: 0,
        despesas: 0,
        saldo: 0,
        docs: 0,
      });
    }

    for (const o of (obrigData ?? []) as Array<{
      id_cliente: string;
      status: string;
    }>) {
      const r = resumos.get(o.id_cliente);
      if (!r) continue;
      if (o.status === "ENTREGUE") r.obrigEntregues++;
      else if (o.status === "ATRASADA") r.obrigAtrasadas++;
      else r.obrigPendentes++;
    }
    for (const f of (fatData ?? []) as Array<{
      id_cliente: string;
      valor: number;
      status: string;
    }>) {
      const r = resumos.get(f.id_cliente);
      if (!r) continue;
      const v = Number(f.valor);
      if (f.status === "PAGA") r.fatPaga += v;
      else if (f.status === "ABERTA" || f.status === "ATRASADA")
        r.fatAberta += v;
    }
    for (const l of (lancData ?? []) as Array<{
      id_cliente: string;
      tipo: string;
      valor: number;
    }>) {
      const r = resumos.get(l.id_cliente);
      if (!r) continue;
      const v = Number(l.valor);
      if (l.tipo === "RECEITA") r.receitas += v;
      else r.despesas += v;
    }
    for (const d of (docData ?? []) as Array<{ id_cliente: string }>) {
      const r = resumos.get(d.id_cliente);
      if (r) r.docs++;
    }
    for (const r of resumos.values()) {
      r.saldo = r.receitas - r.despesas;
    }

    // 5) Filtra clientes que tiveram alguma atividade (senão não envia)
    const comAtividade = Array.from(resumos.values()).filter(
      (r) =>
        r.obrigEntregues + r.obrigPendentes + r.obrigAtrasadas > 0 ||
        r.fatPaga + r.fatAberta > 0 ||
        r.receitas + r.despesas > 0 ||
        r.docs > 0
    );

    if (comAtividade.length === 0) {
      return json({
        ok: true,
        competencia,
        enviados: 0,
        sem_email: 0,
        mensagem: "Nenhum cliente com atividade no mês",
      });
    }

    // 6) Resolve destinatários
    const idsAtivos = comAtividade.map((r) => r.cliente.id_cliente);
    const { data: contData } = await admin
      .from("clientes_contatos")
      .select("id_cliente, email, nome, principal")
      .in("id_cliente", idsAtivos)
      .not("email", "is", null);
    const dest = new Map<string, { email: string; nome: string }>();
    for (const c of (contData ?? []) as Array<{
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

    const semContato = idsAtivos.filter((id) => !dest.has(id));
    if (semContato.length > 0) {
      const { data: userData } = await admin
        .from("usuarios")
        .select("id_cliente, email, nome")
        .in("id_cliente", semContato)
        .eq("perfil", "Cliente")
        .eq("ativo", true);
      for (const u of (userData ?? []) as Array<{
        id_cliente: string | null;
        email: string;
        nome: string;
      }>) {
        if (u.id_cliente && u.email && !dest.has(u.id_cliente)) {
          dest.set(u.id_cliente, { email: u.email, nome: u.nome });
        }
      }
    }

    // 7) Envia
    let enviados = 0;
    let semEmail = 0;
    const falhas: Array<{ cliente: string; erro: string }> = [];
    const preview: Array<{ cliente: string; destinatario: string }> = [];

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
      for (const r of comAtividade) {
        const contato = dest.get(r.cliente.id_cliente);
        if (!contato) {
          semEmail++;
          continue;
        }
        const destinoFinal = forceTo ?? contato.email;
        const html = buildHtml(r, contato.nome, mesNome, cfg, PORTAL_URL);
        const assunto = `${cfg?.nome_escritorio ?? "JSP"} — Relatório mensal • ${mesNome}`;

        preview.push({ cliente: r.cliente.razao_social, destinatario: destinoFinal });

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
            cliente: r.cliente.razao_social,
            erro: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } finally {
      if (smtp) await smtp.close();
    }

    return json({
      ok: true,
      competencia,
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
  r: Resumo,
  contatoNome: string,
  mesNome: string,
  cfg: {
    nome_escritorio?: string;
    logo_url?: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null,
  portalUrl: string
): string {
  const nomeEscritorio = cfg?.nome_escritorio ?? "JSP Contabilidade Personalizada";
  const totalObrig =
    r.obrigEntregues + r.obrigPendentes + r.obrigAtrasadas;
  const percEntregue =
    totalObrig > 0 ? Math.round((r.obrigEntregues / totalObrig) * 100) : 0;
  const corSaldo = r.saldo >= 0 ? "#2A3014" : "#B5462A";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4EFE0;font-family:Arial,Helvetica,sans-serif;color:#2A3014;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:white;border-radius:12px;overflow:hidden;border:1px solid #E3DBC4;">
      <div style="text-align:center;padding:24px;border-bottom:2px solid #A88440;">
        ${
          cfg?.logo_url
            ? `<img src="${cfg.logo_url}" alt="" style="max-width:80px;max-height:80px;" />`
            : `<div style="font-family:Georgia,serif;font-size:34px;font-weight:bold;color:#A88440;letter-spacing:-2px;">JSP</div>`
        }
        <div style="font-size:11px;letter-spacing:2px;color:#A88440;margin-top:6px;">
          ${escapeHtml(nomeEscritorio)}
        </div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#A88440;">
          Relatório mensal
        </div>
        <h2 style="font-family:Georgia,serif;color:#2A3014;margin:4px 0 16px;text-transform:capitalize;">
          ${escapeHtml(mesNome)}
        </h2>
        <p style="color:#555;margin:0 0 16px;">
          Olá, <strong>${escapeHtml(contatoNome)}</strong>! Aqui está o
          resumo de <strong>${escapeHtml(r.cliente.razao_social)}</strong> no
          mês:
        </p>

        <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:16px 0;">
          <tr>
            <td style="background:#EAEDDA;border-radius:8px;padding:12px;text-align:center;width:50%;">
              <div style="font-size:10px;text-transform:uppercase;color:#666;">Obrigações entregues</div>
              <div style="font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#2A3014;margin-top:4px;">
                ${r.obrigEntregues}<span style="font-size:14px;color:#999;">/${totalObrig}</span>
              </div>
              <div style="font-size:11px;color:#666;margin-top:2px;">${percEntregue}% no prazo</div>
            </td>
            <td style="background:#EAEDDA;border-radius:8px;padding:12px;text-align:center;width:50%;">
              <div style="font-size:10px;text-transform:uppercase;color:#666;">Honorários pagos</div>
              <div style="font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#2A3014;margin-top:4px;">
                ${brl(r.fatPaga)}
              </div>
              ${
                r.fatAberta > 0
                  ? `<div style="font-size:11px;color:#B5462A;margin-top:2px;">${brl(r.fatAberta)} em aberto</div>`
                  : `<div style="font-size:11px;color:#666;margin-top:2px;">tudo em dia ✓</div>`
              }
            </td>
          </tr>
          <tr>
            <td style="background:#F4EFE0;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#666;">Resultado contábil</div>
              <div style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:${corSaldo};margin-top:4px;">
                ${brl(r.saldo)}
              </div>
              <div style="font-size:11px;color:#666;margin-top:2px;">
                ${brl(r.receitas)} − ${brl(r.despesas)}
              </div>
            </td>
            <td style="background:#F4EFE0;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;text-transform:uppercase;color:#666;">Documentos no mês</div>
              <div style="font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#2A3014;margin-top:4px;">
                ${r.docs}
              </div>
            </td>
          </tr>
        </table>

        ${
          r.obrigAtrasadas > 0
            ? `<div style="background:#FEE2E2;border-left:4px solid #B5462A;padding:12px 16px;margin:16px 0;font-size:13px;color:#7F1D1D;">
                Atenção: você tem <strong>${r.obrigAtrasadas} obrigaç${r.obrigAtrasadas === 1 ? "ão atrasada" : "ões atrasadas"}</strong>.
              </div>`
            : ""
        }

        <div style="text-align:center;margin:24px 0;">
          <a href="${portalUrl}/portal" style="display:inline-block;background:#4A5326;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
            Acessar portal completo
          </a>
        </div>

        <p style="font-size:12px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          Esse e-mail é gerado automaticamente todo início de mês. Para
          dúvidas, responda esta mensagem ou fale com sua contadora.
        </p>
      </div>
    </div>
    <div style="text-align:center;color:#999;font-size:10px;margin-top:12px;">
      ${escapeHtml(nomeEscritorio)}
      ${cfg?.telefone ? ` • ${escapeHtml(cfg.telefone)}` : ""}
      ${cfg?.email ? ` • ${escapeHtml(cfg.email)}` : ""}
    </div>
  </div>
</body>
</html>`;
}

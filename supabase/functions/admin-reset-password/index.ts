// Edge Function: admin-reset-password
//
// Permite que um Admin redefine a senha de outro usuário sem e-mail de
// recuperação. Validações de segurança:
//   1) Token JWT do chamador é válido
//   2) Chamador existe em public.usuarios com perfil = 'Admin' e ativo = true
//   3) E-mail alvo existe em auth.users
//   4) Senha nova tem >= 6 caracteres
//
// Variáveis de ambiente (já vêm setadas automaticamente no Supabase):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente com o JWT do chamador — usado pra validar quem chamou
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await userClient.auth.getUser();
    if (callerErr || !caller?.email) return json({ error: "Invalid token" }, 401);

    const { data: callerProfile, error: profErr } = await userClient
      .from("usuarios")
      .select("perfil, ativo")
      .ilike("email", caller.email)
      .single();
    if (profErr || !callerProfile)
      return json({ error: "Caller has no profile" }, 403);
    if (callerProfile.perfil !== "Admin" || !callerProfile.ativo)
      return json({ error: "Forbidden: admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetEmail = String(body.email ?? "").trim().toLowerCase();
    const newPassword = String(body.new_password ?? "");
    if (!targetEmail || newPassword.length < 6) {
      return json(
        { error: "email e new_password (>=6 chars) sao obrigatorios" },
        400
      );
    }

    // Cliente admin com service role — único capaz de chamar auth.admin.*
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Procura o user alvo pelo e-mail (precisa varrer porque o filtro
    // de listUsers não aceita predicate; em escala grande, paginar).
    let target: { id: string; email: string | null } | undefined;
    let page = 1;
    const perPage = 200;
    while (!target) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) return json({ error: listErr.message }, 500);
      target = list.users.find(
        (u) => (u.email ?? "").toLowerCase() === targetEmail
      );
      if (target || list.users.length < perPage) break;
      page += 1;
      if (page > 50) break; // safety
    }
    if (!target) return json({ error: "Usuario nao encontrado em auth" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      password: newPassword,
    });
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, id: target.id, email: target.email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

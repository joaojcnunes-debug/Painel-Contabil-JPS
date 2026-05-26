// Edge Function: atualizar-status-vencidos
//
// Marca como ATRASADA toda obrigação PENDENTE/EM_ANDAMENTO com
// data_vencimento < hoje, e toda fatura ABERTA com data_vencimento
// < hoje. Idempotente — pode rodar quantas vezes quiser.
//
// Uso típico: cron diário no Supabase (1x por dia, manhã cedo).
// Pode ser chamada manualmente pelo botão em /config.
//
// Não precisa de body. Aceita GET ou POST.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const hoje = new Date().toISOString().slice(0, 10);

    // Obrigações: PENDENTE/EM_ANDAMENTO + vencimento < hoje → ATRASADA
    const { data: obrigUpd, error: errObr } = await admin
      .from("obrigacoes")
      .update({
        status: "ATRASADA",
        updated_at: new Date().toISOString(),
      })
      .in("status", ["PENDENTE", "EM_ANDAMENTO"])
      .lt("data_vencimento", hoje)
      .select("id_obrigacao");
    if (errObr) return json({ error: errObr.message }, 500);

    // Faturas: ABERTA + vencimento < hoje → ATRASADA
    const { data: fatUpd, error: errFat } = await admin
      .from("faturas")
      .update({
        status: "ATRASADA",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "ABERTA")
      .lt("data_vencimento", hoje)
      .select("id_fatura");
    if (errFat) return json({ error: errFat.message }, 500);

    return json({
      ok: true,
      hoje,
      obrigacoes_atualizadas: obrigUpd?.length ?? 0,
      faturas_atualizadas: fatUpd?.length ?? 0,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

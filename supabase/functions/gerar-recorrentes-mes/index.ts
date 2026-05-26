// Edge Function: gerar-recorrentes-mes
//
// Cria lançamentos contábeis a partir dos modelos ativos
// (public.lancamentos_modelos) para a competência informada.
// Idempotente — não duplica se já existe lançamento daquele
// modelo na competência (identifica via tag oculta na descrição:
// "[recorrente:<id_modelo>]").
//
// Uso típico: cron diário (idealmente dia 1 às 6h BRT).
//
// Body opcional:
//   { competencia: "2026-05" }  — força uma competência específica
//                                 (default: mês corrente)
//   { dry_run: true }           — não insere, só retorna preview
//
// Sem secrets extras (usa SERVICE_ROLE automático).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Modelo = {
  id_modelo: string;
  id_cliente: string;
  id_conta: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  dia_mes: number;
  descricao: string;
  documento_ref: string | null;
  observacoes: string | null;
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

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dataDoMes(comp: string, dia: number): string {
  const [y, m] = comp.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${comp}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

function gerarId(prefixo: string): string {
  // hex 8 chars random
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${prefixo}-${hex}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST")
    return json({ error: "Método não permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let body: { competencia?: string; dry_run?: boolean } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        /* body vazio é ok */
      }
    }
    const competencia = body.competencia ?? competenciaAtual();
    const dryRun = !!body.dry_run;

    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return json({ error: "competência inválida (use YYYY-MM)" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Modelos ativos
    const { data: modelosData, error: errMod } = await admin
      .from("lancamentos_modelos")
      .select(
        "id_modelo, id_cliente, id_conta, tipo, valor, dia_mes, descricao, documento_ref, observacoes"
      )
      .eq("ativo", true);
    if (errMod) return json({ error: errMod.message }, 500);
    const modelos = (modelosData ?? []) as unknown as Modelo[];

    if (modelos.length === 0) {
      return json({
        ok: true,
        competencia,
        criados: 0,
        pulados: 0,
        mensagem: "Nenhum modelo ativo cadastrado",
      });
    }

    // 2) Lançamentos já existentes desta competência marcados como recorrentes
    const { data: existentes, error: errEx } = await admin
      .from("lancamentos")
      .select("descricao")
      .eq("competencia", competencia)
      .like("descricao", "%[recorrente:%");
    if (errEx) return json({ error: errEx.message }, 500);

    const jaTem = new Set<string>();
    for (const e of (existentes ?? []) as Array<{ descricao: string }>) {
      const m = e.descricao.match(/\[recorrente:([^\]]+)\]/);
      if (m) jaTem.add(m[1]);
    }

    // 3) Monta payload dos que faltam
    const novos: Array<Record<string, unknown>> = [];
    let pulados = 0;
    for (const mdl of modelos) {
      if (jaTem.has(mdl.id_modelo)) {
        pulados++;
        continue;
      }
      novos.push({
        id_lancamento: gerarId("LCT"),
        id_cliente: mdl.id_cliente,
        id_conta: mdl.id_conta,
        data_lancamento: dataDoMes(competencia, mdl.dia_mes),
        competencia,
        tipo: mdl.tipo,
        valor: mdl.valor,
        descricao: `${mdl.descricao} [recorrente:${mdl.id_modelo}]`,
        documento_ref: mdl.documento_ref,
        observacoes: mdl.observacoes,
      });
    }

    if (dryRun) {
      return json({
        ok: true,
        modo: "dry_run",
        competencia,
        criariam: novos.length,
        pulariam: pulados,
        amostra: novos.slice(0, 5).map((n) => ({
          id_cliente: n.id_cliente,
          data: n.data_lancamento,
          tipo: n.tipo,
          valor: n.valor,
        })),
      });
    }

    if (novos.length === 0) {
      return json({
        ok: true,
        competencia,
        criados: 0,
        pulados,
        mensagem: "Tudo em dia — nenhum lançamento novo gerado",
      });
    }

    const { error: errIns } = await admin
      .from("lancamentos")
      .insert(novos as never);
    if (errIns) return json({ error: errIns.message }, 500);

    return json({
      ok: true,
      competencia,
      criados: novos.length,
      pulados,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

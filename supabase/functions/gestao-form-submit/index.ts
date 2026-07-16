// Edge Function: gestao-form-submit
//
// GET  ?token=<token>          → devolve definição pública do formulário (se ativo)
// POST { token, titulo, descricao?, prazo?, prioridade?, respostas? }
//                              → cria tarefa no quadro do formulário
//
// Público (sem JWT). Usa service role pra bypass do RLS.
// Valida obrigatórias, aplica defaults do formulário (etiquetas, prioridade,
// responsável, status inicial) e insere em gestao_tarefas com created_by='Formulário'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function gerarId(prefixo: string): string {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefixo}-${hex}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "Faltou ?token=" }, 400);
    const { data } = await admin
      .from("gestao_formularios")
      .select("titulo, descricao, mostra_descricao, mostra_prazo, mostra_prioridade, ativo, perguntas")
      .eq("token", token)
      .maybeSingle();
    const form = data as {
      titulo: string;
      descricao: string | null;
      mostra_descricao: boolean;
      mostra_prazo: boolean;
      mostra_prioridade: boolean;
      ativo: boolean;
      perguntas: Array<Record<string, unknown>>;
    } | null;
    if (!form || !form.ativo) return json({ error: "Formulário indisponível" }, 404);
    return json({ ok: true, form });
  }

  if (req.method === "POST") {
    let body: {
      token?: string;
      titulo?: string;
      descricao?: string;
      prazo?: string;
      prioridade?: string;
      respostas?: Array<{ id: string; label: string; valor: string }>;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }
    const { token, titulo, descricao, prazo, prioridade, respostas } = body;
    if (!token) return json({ error: "Token obrigatório" }, 400);
    if (!titulo || !titulo.trim()) return json({ error: "Título obrigatório" }, 400);

    const { data: formData } = await admin
      .from("gestao_formularios")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    const form = formData as {
      id_quadro: string;
      ativo: boolean;
      status_inicial: string | null;
      responsavel_padrao: string | null;
      etiquetas_padrao: string[];
      prioridade_padrao: string;
      mostra_prazo: boolean;
      mostra_prioridade: boolean;
    } | null;
    if (!form || !form.ativo) return json({ error: "Formulário indisponível" }, 404);

    // Monta descrição final concatenando respostas do form
    const partesDesc: string[] = [];
    if (descricao?.trim()) partesDesc.push(descricao.trim());
    if (respostas && respostas.length > 0) {
      partesDesc.push("---");
      for (const r of respostas) {
        if (r.valor?.trim()) partesDesc.push(`${r.label}: ${r.valor}`);
      }
    }
    const descFinal = partesDesc.join("\n\n") || null;

    // Pega slug de status inicial (ou 'A_FAZER' fallback)
    const statusInicial = form.status_inicial || "A_FAZER";

    const idTarefa = gerarId("TRF");
    const { error } = await admin.from("gestao_tarefas").insert({
      id_tarefa: idTarefa,
      id_quadro: form.id_quadro,
      titulo: titulo.trim(),
      descricao: descFinal,
      status: statusInicial,
      prioridade: (form.mostra_prioridade && prioridade) ? prioridade : form.prioridade_padrao,
      responsavel: form.responsavel_padrao,
      prazo: form.mostra_prazo && prazo ? prazo : null,
      etiquetas: form.etiquetas_padrao ?? [],
      created_by: "Formulário",
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id_tarefa: idTarefa });
  }

  return json({ error: "Método não permitido" }, 405);
});

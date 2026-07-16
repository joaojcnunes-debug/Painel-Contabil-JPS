// Edge Function: gestao-ia
//
// Assistente de IA pro TarefaModal.
// POST { acao: "subtarefas" | "descricao", titulo, descricao? }
//
// Ações:
// - subtarefas: recebe título+descrição, sugere lista de 3-8 subtarefas
// - descricao:  recebe título, sugere descrição estruturada
//
// Usa OPENAI_API_KEY (env). Se não configurada, retorna 501 com mensagem clara.
// Requer JWT válido (não é público — só usuário logado do painel).

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

const PROMPTS: Record<string, (t: string, d?: string) => string> = {
  subtarefas: (t, d) =>
    `Você é um assistente que quebra tarefas contábeis em subtarefas objetivas.

Tarefa: "${t}"
${d ? `Contexto: ${d}` : ""}

Gere de 3 a 8 subtarefas curtas, práticas, uma por linha (sem numeração, sem bullets, sem markdown). Cada subtarefa deve começar com verbo no infinitivo (ex: "Coletar", "Enviar", "Conferir"). Em português.`,
  descricao: (t) =>
    `Você é um assistente que escreve descrições de tarefas contábeis.

Tarefa: "${t}"

Escreva uma descrição em 2-4 parágrafos curtos, com contexto, resultado esperado e dicas relevantes. Português BR. Sem markdown.`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_KEY) {
    return json(
      {
        error:
          "OPENAI_API_KEY não configurada. Configure em Supabase → Edge Functions → Secrets pra habilitar sugestões de IA.",
      },
      501
    );
  }

  let body: { acao?: string; titulo?: string; descricao?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const acao = body.acao ?? "subtarefas";
  const titulo = (body.titulo ?? "").trim();
  const descricao = (body.descricao ?? "").trim();
  if (!titulo) return json({ error: "titulo obrigatório" }, 400);
  const promptFn = PROMPTS[acao];
  if (!promptFn) return json({ error: "acao inválida" }, 400);

  const prompt = promptFn(titulo, descricao);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você ajuda um escritório de contabilidade." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: `OpenAI: ${res.status} — ${t.slice(0, 200)}` }, 500);
    }
    const data = await res.json();
    const texto = data?.choices?.[0]?.message?.content ?? "";
    if (acao === "subtarefas") {
      const lista = texto
        .split(/\r?\n/)
        .map((s: string) => s.replace(/^[-*\d.\s]+/, "").trim())
        .filter((s: string) => s.length > 0)
        .slice(0, 12);
      return json({ ok: true, subtarefas: lista });
    }
    return json({ ok: true, texto: texto.trim() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

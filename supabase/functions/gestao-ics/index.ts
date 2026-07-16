// Edge Function: gestao-ics
//
// Feed público de calendário .ics pra um quadro.
// GET /?token=<ics_token do quadro>
//
// Retorna text/calendar com todas as tarefas com prazo (não concluídas).
// Serve pra assinar no Google Calendar, Outlook, Apple Calendar.
//
// Cache 5 min (X-Cache-Control) — atualização não é instantânea.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function isoDia(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function escICS(v: string | null | undefined): string {
  if (!v) return "";
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") {
    return new Response("Método não permitido", { status: 405 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Faltou ?token=", { status: 400 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: quadroData } = await admin
    .from("gestao_quadros")
    .select("id_quadro, nome")
    .eq("ics_token", token)
    .maybeSingle();
  const quadro = quadroData as { id_quadro: string; nome: string } | null;
  if (!quadro) return new Response("Token inválido", { status: 404 });

  // Puxa status "concluído" pra filtrar
  const { data: statusData } = await admin
    .from("gestao_status")
    .select("slug")
    .eq("id_quadro", quadro.id_quadro)
    .eq("tipo", "concluido");
  const slugsConcluidos = new Set(
    (statusData as Array<{ slug: string }> | null)?.map((s) => s.slug) ?? []
  );

  const { data: tarefasData } = await admin
    .from("gestao_tarefas")
    .select("id_tarefa, titulo, descricao, prazo, status, prioridade, responsavel")
    .eq("id_quadro", quadro.id_quadro)
    .not("prazo", "is", null)
    .order("prazo");

  const tarefas =
    (tarefasData as Array<{
      id_tarefa: string;
      titulo: string;
      descricao: string | null;
      prazo: string;
      status: string;
      prioridade: string;
      responsavel: string | null;
    }> | null) ?? [];

  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JSP Painel Contábil//Gestão//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escICS(quadro.nome)}`,
    `X-WR-TIMEZONE:America/Sao_Paulo`,
  ];

  const dhStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");

  for (const t of tarefas) {
    if (slugsConcluidos.has(t.status)) continue;
    const [y, m, d] = t.prazo.slice(0, 10).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dtFim = new Date(y, m - 1, d + 1);
    const summary = escICS(`[${t.prioridade}] ${t.titulo}`);
    const desc = escICS(
      [
        t.descricao ?? "",
        t.responsavel ? `Responsável: ${t.responsavel}` : "",
        `Status: ${t.status}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${t.id_tarefa}@painel-contabil-jps`,
      `DTSTAMP:${dhStamp}`,
      `DTSTART;VALUE=DATE:${isoDia(dt)}`,
      `DTEND;VALUE=DATE:${isoDia(dtFim)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      "END:VEVENT"
    );
  }
  linhas.push("END:VCALENDAR");

  const body = linhas.join("\r\n");
  return new Response(body, {
    headers: {
      ...cors,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="gestao-${quadro.id_quadro}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
});

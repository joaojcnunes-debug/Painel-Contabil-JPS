// API Route: eSocial — Consultar Lote por Protocolo.
//
// POST { id_cliente, id_lote, ambiente, senha }
//
// Faz polling do protocolo de um lote previamente enviado. Atualiza
// esocial_lotes e esocial_eventos conforme retorno. Cliente pode chamar
// várias vezes até status_lote sair de ENVIADO pra PROCESSADO.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  consultarLoteEventos,
  type EventoRetornado,
} from "@/lib/integracoes/esocial/consultar-lote";
import type { AmbienteEsocial } from "@/lib/integracoes/esocial/_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  id_cliente?: string;
  id_lote?: string;
  ambiente?: 1 | 2;
  senha?: string;
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json({ ok: false, erro: "Apenas equipe" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const { id_cliente, id_lote, ambiente, senha } = body;
  if (!id_cliente || !id_lote || !senha || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, id_lote, ambiente, senha" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteEsocial;

  // Carrega o lote
  const { data: loteData } = await supabase
    .from("esocial_lotes")
    .select("id_lote, id_cliente, ambiente, protocolo, status_lote")
    .eq("id_lote", id_lote)
    .eq("id_cliente", id_cliente)
    .single();
  type Lote = {
    id_lote: string;
    id_cliente: string;
    ambiente: number;
    protocolo: string | null;
    status_lote: string;
  };
  const lote = loteData as Lote | null;
  if (!lote) {
    return NextResponse.json({ ok: false, erro: "Lote não encontrado" }, { status: 404 });
  }
  if (!lote.protocolo) {
    return NextResponse.json(
      { ok: false, erro: "Lote sem protocolo (ainda não foi enviado com sucesso)" },
      { status: 400 }
    );
  }

  // Cert (mesma lógica das outras routes)
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj")
    .eq("id_cliente", id_cliente)
    .single();
  const cnpjLimpo = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "")
    .replace(/\D/g, "");

  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path, titular_documento")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });
  type Cert = { arquivo_path: string; titular_documento: string };
  const certList = (certs ?? []) as unknown as Cert[];
  if (certList.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum certificado A1 cadastrado" },
      { status: 400 }
    );
  }
  const cert =
    certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];

  const { data: pfxBlob, error: blobErr } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (blobErr || !pfxBlob) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao baixar cert: ${blobErr?.message}` },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  const resultado = await consultarLoteEventos({
    pfxBuffer,
    senha,
    ambiente: amb,
    protocolo: lote.protocolo,
  });

  // Atualiza polling timestamp sempre
  await supabase
    .from("esocial_lotes")
    .update({
      ultimo_polling_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id_lote", id_lote);

  if (!resultado.ok) {
    return NextResponse.json(resultado, { status: 400 });
  }

  // Se ainda em processamento, mantém status ENVIADO
  if (resultado.emProcessamento) {
    return NextResponse.json({
      ...resultado,
      id_lote,
      // status_lote do BD ainda é ENVIADO; cliente pode tentar de novo em 30s
    });
  }

  // Processado — atualiza status do lote pra PROCESSADO + cada evento
  await supabase
    .from("esocial_lotes")
    .update({
      status_lote: "PROCESSADO",
      cd_resposta: resultado.cdResposta,
      desc_resposta: resultado.descResposta,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id_lote", id_lote);

  // Atualiza cada evento individual
  for (const ev of resultado.eventos as EventoRetornado[]) {
    if (!ev.id) continue;
    // Determina status: 201 = VALIDADO, 202 = ADVERTENCIA (passou mas com warnings),
    // outros = REJEITADO
    let statusEvento: "VALIDADO" | "REJEITADO" | "ADVERTENCIA";
    if (ev.cdResposta === "201") statusEvento = "VALIDADO";
    else if (ev.cdResposta === "202") statusEvento = "ADVERTENCIA";
    else statusEvento = "REJEITADO";

    await supabase
      .from("esocial_eventos")
      .update({
        protocolo_evento: ev.protocoloEvento ?? null,
        cd_resposta: ev.cdResposta,
        desc_resposta: ev.descResposta,
        status_evento: statusEvento,
        erros: ev.ocorrencias.length > 0 ? ev.ocorrencias : null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_evento", ev.id);
  }

  return NextResponse.json({ ...resultado, id_lote });
}

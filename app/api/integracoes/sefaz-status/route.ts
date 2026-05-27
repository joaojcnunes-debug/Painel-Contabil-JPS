// API Route: NfeStatusServico — verifica se SEFAZ está no ar.
//
// POST { id_cliente, ambiente, senha }
// Usa a UF do endereço do cliente; cert A1 vinculado.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  consultarStatusServico,
  type AmbienteSefaz,
} from "@/lib/integracoes/notas-fiscais/sefaz-dfe";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  id_cliente?: string;
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
  const { id_cliente, ambiente, senha } = body;
  if (!id_cliente || !senha || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, ambiente (1|2), senha" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteSefaz;

  // Cliente + UF
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("estado")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as { estado?: string | null } | null;
  const uf = (cliente?.estado ?? "").toUpperCase();
  if (!uf || uf.length !== 2) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Cliente sem UF cadastrada. Preencha o estado no cadastro pra escolher a SEFAZ certa.",
      },
      { status: 400 }
    );
  }

  // Certificado
  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("id_certificado, arquivo_path")
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false })
    .limit(1);
  const cert = (certs?.[0] ?? null) as
    | { id_certificado: string; arquivo_path: string }
    | null;
  if (!cert) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum certificado A1 com arquivo cadastrado" },
      { status: 400 }
    );
  }

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

  const inicio = Date.now();
  const res = await consultarStatusServico({
    pfxBuffer,
    senha,
    uf,
    ambiente: amb,
  });
  const duracaoMs = Date.now() - inicio;

  // Log
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "NOTAS_FISCAIS",
    acao: "sefaz_status_servico",
    modo: "REAL",
    usuario_email: user.email,
    status: res.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `uf=${uf} amb=${amb}`,
    response_resumo: {
      cStat: res.ok ? res.cStat : res.cStat,
      xMotivo: res.ok ? res.xMotivo : "",
      tMed: res.ok ? res.tMed : null,
    },
    erro_codigo: res.ok ? null : "STATUS_ERRO",
    erro_mensagem: res.ok ? null : res.erro,
  } as never);

  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

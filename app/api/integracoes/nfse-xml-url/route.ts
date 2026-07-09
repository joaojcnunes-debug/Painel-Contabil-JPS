// API Route: gera signed URL pra baixar XML de NFSe do bucket privado.
//
// GET /api/integracoes/nfse-xml-url?chave=XXX
// Retorna { ok: true, url: "https://...?token=..." } válida por 60s.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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

  const chave = req.nextUrl.searchParams.get("chave");
  if (!chave) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetro 'chave' obrigatório" },
      { status: 400 }
    );
  }

  const { data: rec } = await supabase
    .from("nfse_recebidas")
    .select("xml_path")
    .eq("chave", chave)
    .maybeSingle();
  const row = rec as { xml_path?: string | null } | null;
  if (!row?.xml_path) {
    return NextResponse.json(
      { ok: false, erro: "NFSe não encontrada ou XML não persistido" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("nfse-xmls")
    .createSignedUrl(row.xml_path, 60);
  if (error || !signed) {
    return NextResponse.json(
      { ok: false, erro: error?.message ?? "Falha ao gerar URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}

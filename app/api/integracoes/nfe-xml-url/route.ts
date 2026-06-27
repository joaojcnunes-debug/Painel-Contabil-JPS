// API Route: gera signed URL pra baixar XML de NF-e do bucket privado.
//
// GET /api/integracoes/nfe-xml-url?chave=44digitos
// Retorna { ok: true, url: "https://...?token=..." } (válida por 60s).
//
// Auth: equipe-only (RLS do bucket bate igual).

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
  if (!chave || chave.length !== 44) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetro 'chave' obrigatório (44 dígitos)" },
      { status: 400 }
    );
  }

  // Busca o xml_path da NF (RLS já garante visibilidade do usuário)
  const { data: rec } = await supabase
    .from("nfe_dfe_recebidas")
    .select("xml_path")
    .eq("chave", chave)
    .maybeSingle();

  const row = rec as { xml_path?: string | null } | null;
  if (!row?.xml_path) {
    return NextResponse.json(
      { ok: false, erro: "NF não encontrada ou XML não persistido" },
      { status: 404 }
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("nfe-xmls")
    .createSignedUrl(row.xml_path, 60);
  if (error || !signed) {
    return NextResponse.json(
      { ok: false, erro: error?.message ?? "Falha ao gerar URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}

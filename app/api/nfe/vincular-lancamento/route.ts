// API Route: NFe — Vincular / desvincular a um lançamento contábil.
//
// POST { chave, id_lancamento | null }
// - Se id_lancamento != null → vincula
// - Se id_lancamento === null → desvincula
//
// Regra: só equipe. Valida que o lançamento pertence ao mesmo cliente da NFe.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export const runtime = "nodejs";

type Body = {
  chave?: string;
  id_lancamento?: string | null;
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
    return NextResponse.json(
      { ok: false, erro: "Não autenticado" },
      { status: 401 }
    );
  }
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json(
      { ok: false, erro: "Apenas equipe" },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "JSON inválido" },
      { status: 400 }
    );
  }

  const { chave, id_lancamento } = body;
  if (!chave || typeof chave !== "string") {
    return NextResponse.json(
      { ok: false, erro: "Parâmetro obrigatório: chave" },
      { status: 400 }
    );
  }

  // Se está vinculando, valida que o lançamento pertence ao mesmo cliente da NFe
  if (id_lancamento) {
    const { data: nfe } = await supabase
      .from("nfe_dfe_recebidas")
      .select("id_cliente")
      .eq("chave", chave)
      .maybeSingle();
    if (!nfe) {
      return NextResponse.json(
        { ok: false, erro: "NFe não encontrada" },
        { status: 404 }
      );
    }
    const { data: lanc } = await supabase
      .from("lancamentos")
      .select("id_cliente")
      .eq("id_lancamento", id_lancamento)
      .maybeSingle();
    if (!lanc) {
      return NextResponse.json(
        { ok: false, erro: "Lançamento não encontrado" },
        { status: 404 }
      );
    }
    const nfeRow = nfe as { id_cliente: string };
    const lancRow = lanc as { id_cliente: string };
    if (nfeRow.id_cliente !== lancRow.id_cliente) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Lançamento é de outro cliente — vinculação não permitida",
        },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from("nfe_dfe_recebidas")
    .update({
      id_lancamento: id_lancamento ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("chave", chave);

  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, chave, id_lancamento });
}

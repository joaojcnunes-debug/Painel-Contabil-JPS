// API Route: encripta e salva a senha do certificado A1 no banco.
//
// POST { id_certificado, senha }
//
// - Só equipe (perfil ≠ Cliente)
// - Encripta com AES-256-GCM (chave master do env CERT_SENHA_MASTER_KEY)
// - UPDATE em certificados_digitais (senha_encriptada, senha_iv)
// - Não retorna a senha em NENHUMA hipótese

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { encriptarSenha } from "@/lib/crypto/cert-senha";

export const runtime = "nodejs";

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

  let body: { id_certificado?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const { id_certificado, senha } = body;
  if (!id_certificado || !senha) {
    return NextResponse.json(
      { ok: false, erro: "id_certificado e senha obrigatórios" },
      { status: 400 }
    );
  }

  let encrypted: { senha_encriptada: Buffer; senha_iv: Buffer };
  try {
    encrypted = encriptarSenha(senha);
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao encriptar: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  // bytea vai como base64 pelo PostgREST
  const { error } = await supabase
    .from("certificados_digitais")
    .update({
      senha_encriptada: `\\x${encrypted.senha_encriptada.toString("hex")}`,
      senha_iv: `\\x${encrypted.senha_iv.toString("hex")}`,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id_certificado", id_certificado);

  if (error) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao salvar: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

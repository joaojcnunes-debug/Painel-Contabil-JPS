// API Route: faz upload do .pfx pro bucket privado 'certificados-jsp'.
//
// Etapas:
// 1. Auth (equipe apenas)
// 2. Recebe .pfx via FormData
// 3. Salva no bucket com path padronizado:
//    certificados/{id_certificado}-{timestamp}.pfx
// 4. Retorna o path pra ser persistido em certificados_digitais.arquivo_path
//
// NÃO salva senha. Não persiste nada no banco — apenas faz upload.
// A chamada que persiste fica no frontend (CertificadoFormModal).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";

const MAX_PFX_SIZE = 1024 * 1024; // 1MB

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

  // Equipe-only
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json(
      { ok: false, erro: "Apenas equipe pode enviar certificados" },
      { status: 403 }
    );
  }

  let pfxFile: File | null = null;
  let idCertificado: string | null = null;
  try {
    const fd = await req.formData();
    pfxFile = fd.get("pfx") as File | null;
    idCertificado = fd.get("id_certificado") as string | null;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Requisição inválida" },
      { status: 400 }
    );
  }

  if (!pfxFile || !idCertificado) {
    return NextResponse.json(
      { ok: false, erro: "Arquivo .pfx e id_certificado são obrigatórios" },
      { status: 400 }
    );
  }
  if (pfxFile.size > MAX_PFX_SIZE) {
    return NextResponse.json(
      { ok: false, erro: `Arquivo muito grande (máx ${MAX_PFX_SIZE / 1024}KB)` },
      { status: 400 }
    );
  }

  // Path no bucket: pasta por id_certificado, arquivo com timestamp
  // Isso permite ter histórico (em vez de sobrescrever).
  const timestamp = Date.now();
  const path = `${idCertificado}/${timestamp}.pfx`;

  try {
    const buffer = Buffer.from(await pfxFile.arrayBuffer());
    const { error } = await supabase.storage
      .from("certificados-jsp")
      .upload(path, buffer, {
        contentType: "application/x-pkcs12",
        upsert: false,
      });
    if (error) {
      return NextResponse.json(
        { ok: false, erro: `Falha no upload: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      path,
      size_bytes: pfxFile.size,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: `Erro inesperado: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

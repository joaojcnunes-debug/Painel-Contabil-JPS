// API Route: valida um arquivo .pfx (A1) com a senha digitada e extrai
// metadata (titular, CNPJ/CPF, emissor, validade) sem armazenar a senha.
//
// Segurança:
// - Senha vem no FormData, transita uma única vez por HTTPS, nunca é
//   persistida (banco, log, etc).
// - Apenas usuários autenticados como equipe podem chamar.
// - Limita o tamanho do .pfx pra evitar abuso (1MB máx — A1 típico tem 5-15KB).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import forge from "node-forge";
import { createSupabaseServerClient } from "@/lib/supabase/client";

const MAX_PFX_SIZE = 1024 * 1024; // 1MB

type ValidacaoOk = {
  ok: true;
  titular_nome: string;
  titular_documento: string;     // CNPJ ou CPF (só dígitos)
  tipo_documento: "CNPJ" | "CPF" | "OUTRO";
  emissor: string;
  validade_inicio: string;       // ISO YYYY-MM-DD
  validade_fim: string;
  dias_para_vencer: number;
};

type ValidacaoErro = {
  ok: false;
  erro: string;
};

export async function POST(
  req: NextRequest
): Promise<NextResponse<ValidacaoOk | ValidacaoErro>> {
  // Autenticação
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

  // Checa se é equipe (Admin/Contador/Assistente — não Cliente)
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json(
      { ok: false, erro: "Apenas equipe pode validar certificados" },
      { status: 403 }
    );
  }

  // Parse do FormData
  let pfxFile: File | null = null;
  let senha: string | null = null;
  try {
    const fd = await req.formData();
    pfxFile = fd.get("pfx") as File | null;
    senha = fd.get("senha") as string | null;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Requisição inválida (esperado FormData)" },
      { status: 400 }
    );
  }

  if (!pfxFile) {
    return NextResponse.json(
      { ok: false, erro: "Arquivo .pfx ausente" },
      { status: 400 }
    );
  }
  if (!senha) {
    return NextResponse.json(
      { ok: false, erro: "Senha do certificado ausente" },
      { status: 400 }
    );
  }
  if (pfxFile.size > MAX_PFX_SIZE) {
    return NextResponse.json(
      { ok: false, erro: `Arquivo muito grande (máx ${MAX_PFX_SIZE / 1024}KB)` },
      { status: 400 }
    );
  }

  try {
    // Carrega o .pfx
    const buffer = Buffer.from(await pfxFile.arrayBuffer());
    const p12Asn1 = forge.asn1.fromDer(buffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

    // Extrai o certificado X.509 do bag
    const certBags = p12.getBags({
      bagType: forge.pki.oids.certBag,
    });
    const certs = certBags[forge.pki.oids.certBag];
    if (!certs || certs.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Certificado não encontrado dentro do .pfx (arquivo possivelmente corrompido)",
        },
        { status: 400 }
      );
    }
    const cert = certs[0].cert;
    if (!cert) {
      return NextResponse.json(
        { ok: false, erro: "Certificado inválido" },
        { status: 400 }
      );
    }

    // Extrai subject (titular) e issuer (emissor)
    const subjectAttrs = cert.subject.attributes;
    const issuerAttrs = cert.issuer.attributes;

    // Common Name (CN) tem o nome do titular + CNPJ/CPF entre parênteses
    // Padrão ICP-Brasil: "RAZAO SOCIAL:11222333000144" ou "FULANO:12345678900"
    const cnAttr = subjectAttrs.find((a) => a.shortName === "CN");
    const cnRaw =
      cnAttr && typeof cnAttr.value === "string" ? cnAttr.value : "";

    let titular_nome = cnRaw;
    let titular_documento = "";
    let tipo_documento: "CNPJ" | "CPF" | "OUTRO" = "OUTRO";

    // Padrão ICP-Brasil pessoa jurídica: "NOME:CNPJ"
    const matchDoc = cnRaw.match(/^(.+?):(\d{11,14})$/);
    if (matchDoc) {
      titular_nome = matchDoc[1].trim();
      const docDigits = matchDoc[2];
      titular_documento = docDigits;
      tipo_documento =
        docDigits.length === 14 ? "CNPJ" : docDigits.length === 11 ? "CPF" : "OUTRO";
    }

    // Issuer CN: ex "AC SAFEWEB RFB v5"
    const issuerCnAttr = issuerAttrs.find((a) => a.shortName === "CN");
    const emissor =
      issuerCnAttr && typeof issuerCnAttr.value === "string"
        ? issuerCnAttr.value
        : "Não identificado";

    // Validade
    const notBefore = cert.validity.notBefore;
    const notAfter = cert.validity.notAfter;
    const validade_inicio = notBefore.toISOString().slice(0, 10);
    const validade_fim = notAfter.toISOString().slice(0, 10);
    const dias_para_vencer = Math.ceil(
      (notAfter.getTime() - Date.now()) / 86400000
    );

    return NextResponse.json({
      ok: true,
      titular_nome,
      titular_documento,
      tipo_documento,
      emissor,
      validade_inicio,
      validade_fim,
      dias_para_vencer,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const ml = msg.toLowerCase();
    const senhaErrada =
      ml.includes("mac") ||
      ml.includes("password") ||
      ml.includes("passphrase") ||
      ml.includes("invalid") ||
      ml.includes("decrypt");
    return NextResponse.json(
      {
        ok: false,
        erro: senhaErrada
          ? "Senha do certificado incorreta. Use a senha que você definiu junto à Autoridade Certificadora."
          : `Falha ao ler certificado: ${msg}`,
      },
      { status: 400 }
    );
  }
}

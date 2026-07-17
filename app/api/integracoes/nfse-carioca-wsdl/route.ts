// Diagnóstico: baixa o WSDL do Nota Carioca usando o cert do cliente,
// extrai os SOAPActions declarados no binding, e devolve.
//
// POST { id_cliente, senha, ambiente }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import forge from "node-forge";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINTS: Record<number, string> = {
  1: "https://notacarioca.rio.gov.br/WSNacional/nfse.asmx?wsdl",
  2: "https://notacariocahom.rio.gov.br/WSNacional/nfse.asmx?wsdl",
};

async function getMTLS(privateKeyPem: string, certPem: string, url: string) {
  const https = await import("node:https");
  const u = new URL(url);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request(
      {
        host: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "GET",
        agent: new https.Agent({ cert: certPem, key: privateKeyPem, rejectUnauthorized: true }),
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      }
    );
    req.on("error", (e) => reject(e));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id_cliente?: string; senha?: string; ambiente?: number;
  };
  const { id_cliente, senha } = body;
  const ambiente = body.ambiente ?? 1;
  if (!id_cliente || !senha) return NextResponse.json({ ok: false, erro: "id_cliente + senha" }, { status: 400 });

  const { data: clienteData } = await supabase.from("clientes").select("cnpj").eq("id_cliente", id_cliente).single();
  const cnpjLimpo = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "").replace(/\D/g, "");

  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path, titular_documento")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });
  type Cert = { arquivo_path: string; titular_documento: string };
  const certList = (certs ?? []) as unknown as Cert[];
  const cert = certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];
  if (!cert) return NextResponse.json({ ok: false, erro: "Sem cert" }, { status: 400 });

  const { data: pfxBlob } = await supabase.storage.from("certificados-jsp").download(cert.arquivo_path);
  if (!pfxBlob) return NextResponse.json({ ok: false, erro: "Sem arquivo cert" }, { status: 500 });
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  let privateKeyPem: string, certPem: string;
  try {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    if (!keyBag?.key || !certBag?.cert) throw new Error("bags incompletos");
    privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
    certPem = forge.pki.certificateToPem(certBag.cert);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: `pfx: ${(e as Error).message}` });
  }

  let res: { status: number; body: string };
  try {
    res = await getMTLS(privateKeyPem, certPem, ENDPOINTS[ambiente]);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: `conn: ${(e as Error).message}` });
  }

  if (res.status !== 200) {
    return NextResponse.json({
      ok: false,
      status: res.status,
      body_preview: res.body.slice(0, 800),
    });
  }

  // Extrai soapActions declarados no binding
  const actions = Array.from(
    res.body.matchAll(/soapAction=["']([^"']+)["']/gi)
  ).map((m) => m[1]);
  const namespaces = Array.from(
    res.body.matchAll(/(?:targetNamespace|xmlns[:\w]*)=["']([^"']+)["']/gi)
  ).map((m) => m[1]);

  return NextResponse.json({
    ok: true,
    wsdl_size: res.body.length,
    soapActions_unicos: [...new Set(actions)],
    namespaces_unicos: [...new Set(namespaces)].slice(0, 10),
    wsdl_preview_head: res.body.slice(0, 1000),
    wsdl_preview_middle: res.body.slice(3000, 4000),
  });
}

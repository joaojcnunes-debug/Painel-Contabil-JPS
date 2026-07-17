// Diagnóstico: faz a chamada SOAP crua ao Nota Carioca e retorna
// status + body completo, pra debug de erros como 503 sem detalhes.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import forge from "node-forge";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINTS: Record<number, string> = {
  1: "https://notacarioca.rio.gov.br/WSNacional/nfse.asmx",
  2: "https://notacariocahom.rio.gov.br/WSNacional/nfse.asmx",
};

async function soapRaw(privateKeyPem: string, certPem: string, url: string, envelope: string, soapAction: string) {
  const https = await import("node:https");
  const u = new URL(url);
  return new Promise<{ status: number; body: string; headers: Record<string, string> }>((resolve, reject) => {
    const req = https.request(
      {
        host: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
        agent: new https.Agent({ cert: certPem, key: privateKeyPem, rejectUnauthorized: true }),
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${soapAction}"`,
          "Content-Length": Buffer.byteLength(envelope, "utf-8"),
        },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf-8"),
          headers: res.headers as Record<string, string>,
        }));
      }
    );
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(envelope); req.end();
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

  const body = await req.json();
  const { id_cliente, senha, ambiente = 1 } = body;

  const { data: clienteData } = await supabase.from("clientes").select("cnpj").eq("id_cliente", id_cliente).single();
  const cnpjLimpo = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "").replace(/\D/g, "");

  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path, titular_documento")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1").not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });
  type Cert = { arquivo_path: string; titular_documento: string };
  const certList = (certs ?? []) as unknown as Cert[];
  const cert = certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];

  const { data: pfxBlob } = await supabase.storage.from("certificados-jsp").download(cert.arquivo_path);
  const pfxBuffer = Buffer.from(await pfxBlob!.arrayBuffer());

  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag!.key!);
  const certPem = forge.pki.certificateToPem(certBag!.cert!);

  // Envelope simples de teste — ConsultarNfse com período curto
  const hoje = new Date().toISOString().slice(0, 10);
  const inner = `<?xml version="1.0" encoding="UTF-8"?><ConsultarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><Prestador><Cnpj>${cnpjLimpo}</Cnpj></Prestador><PeriodoEmissao><DataInicial>2026-06-01</DataInicial><DataFinal>${hoje}</DataFinal></PeriodoEmissao></ConsultarNfseEnvio>`;

  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ConsultarNfse xmlns="http://notacarioca.rio.gov.br/"><inputXML><![CDATA[${inner}]]></inputXML></ConsultarNfse></soap:Body></soap:Envelope>`;

  const soapAction = "http://notacarioca.rio.gov.br/ConsultarNfse";

  try {
    const r = await soapRaw(privateKeyPem, certPem, ENDPOINTS[ambiente], envelope, soapAction);
    return NextResponse.json({
      ok: true,
      request: { endpoint: ENDPOINTS[ambiente], soapAction, envelope_length: envelope.length },
      response: {
        status: r.status,
        headers: r.headers,
        body: r.body,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message });
  }
}

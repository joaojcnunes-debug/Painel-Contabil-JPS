// Distribuição DFe SEFAZ — engine completa.
//
// Implementa o webservice NACIONAL NFeDistribuicaoDFe.asmx que retorna
// XMLs de NF-e emitidas contra o CNPJ do destinatário.
//
// Modos de operação:
// - distNSU: paginação por NSU (Número Sequencial Único)
// - consChNFe: consulta por chave de NF específica
//
// Refs:
// - Manual: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=GcEpqQDhSAQ=
// - Schema XSD: distDFeInt v1.01
//
// AVISO: SOAP da SEFAZ é notoriamente sensível a formatação.
// Pequenos detalhes (namespaces, ordem de atributos, whitespace)
// quebram a validação. POC pra começar.

import forge from "node-forge";
import { gunzipSync } from "zlib";
import { XMLParser } from "fast-xml-parser";
import { SignedXml } from "xml-crypto";

export type AmbienteSefaz = 1 | 2; // 1=Produção, 2=Homologação

const ENDPOINTS: Record<AmbienteSefaz, string> = {
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// cUF do solicitante — não precisa bater com UF da NF, é só pra rotear.
// 91 = AN (Ambiente Nacional). Usar 91 sempre pra DFe.
const C_UF_NACIONAL = "91";

export type DistribuirParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjOuCpfDestinatario: string;  // só dígitos
  ambiente: AmbienteSefaz;
  ultimoNsu?: string;             // se omitido, começa de "0"
};

export type DocumentoRecebido = {
  schema: string;              // ex: "procNFe_v4.00.xsd"
  nsu: string;
  xml: string;                 // XML decodificado
};

export type DistribuirOk = {
  ok: true;
  cStat: string;               // 137=sem novos, 138=com novos, 656=consumo indevido
  xMotivo: string;
  ambiente: AmbienteSefaz;
  ultimoNsu: string;           // pra persistir
  maxNsu: string;
  documentos: DocumentoRecebido[];
};

export type DistribuirErro = {
  ok: false;
  cStat?: string;
  xMotivo?: string;
  erro: string;
  raw?: string;                // resposta crua pra debug
};

// ─── Extrai chave privada e cert do .pfx ──────────────────
function extrairKeyECert(pfxBuffer: Buffer, senha: string): {
  privateKeyPem: string;
  certPem: string;
} {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  // Chave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    throw new Error("Chave privada não encontrada no .pfx");
  }
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

  // Certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error("Certificado não encontrado no .pfx");
  }
  const certPem = forge.pki.certificateToPem(certBag.cert);

  return { privateKeyPem, certPem };
}

// ─── Monta XML interno distDFeInt ────────────────────────
function montarDistDFeInt(
  cnpjOuCpf: string,
  ambiente: AmbienteSefaz,
  ultimoNsu: string
): string {
  const tipoTag = cnpjOuCpf.length === 14 ? "CNPJ" : "CPF";
  const nsuPadded = ultimoNsu.padStart(15, "0");

  // Importante: schemaLocation, namespaces e ordem exatos
  return `<?xml version="1.0" encoding="UTF-8"?>
<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
  <tpAmb>${ambiente}</tpAmb>
  <cUFAutor>${C_UF_NACIONAL}</cUFAutor>
  <${tipoTag}>${cnpjOuCpf}</${tipoTag}>
  <distNSU>
    <ultNSU>${nsuPadded}</ultNSU>
  </distNSU>
</distDFeInt>`;
}

// ─── Envelope SOAP do nfeDistDFeInteresse ────────────────
function montarEnvelopeSoap(distDFeIntXml: string): string {
  // Remove declaração XML interna (envelope já tem)
  const inner = distDFeIntXml.replace(/^<\?xml[^?]+\?>\s*/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>${inner}</nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`;
}

// ─── Função principal ────────────────────────────────────
export async function distribuirDFe(
  p: DistribuirParams
): Promise<DistribuirOk | DistribuirErro> {
  const ultimoNsu = p.ultimoNsu ?? "0";

  let privateKeyPem: string;
  let certPem: string;
  try {
    const k = extrairKeyECert(p.pfxBuffer, p.senha);
    privateKeyPem = k.privateKeyPem;
    certPem = k.certPem;
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao ler .pfx: ${(e as Error).message}. Confira a senha.`,
    };
  }

  // Distribuição DFe NÃO exige assinatura XMLDSig (diferente de outros
  // serviços SEFAZ). O envelope SOAP basta. Mas a conexão HTTPS exige
  // o certificado como mTLS.
  const distDFeIntXml = montarDistDFeInt(
    p.cnpjOuCpfDestinatario,
    p.ambiente,
    ultimoNsu
  );
  const soapEnvelope = montarEnvelopeSoap(distDFeIntXml);

  // Chamada HTTPS com mTLS
  let respostaXml: string;
  try {
    const https = await import("node:https");
    const url = new URL(ENDPOINTS[p.ambiente]);

    respostaXml = await new Promise<string>((resolve, reject) => {
      const agent = new https.Agent({
        cert: certPem,
        key: privateKeyPem,
        rejectUnauthorized: true,
      });

      const req = https.request(
        {
          host: url.hostname,
          port: 443,
          path: url.pathname,
          method: "POST",
          agent,
          headers: {
            "Content-Type": "application/soap+xml; charset=utf-8",
            SOAPAction: "",
            "Content-Length": Buffer.byteLength(soapEnvelope, "utf-8"),
          },
          timeout: 30000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(
                new Error(
                  `SEFAZ retornou HTTP ${res.statusCode}: ${body.slice(0, 500)}`
                )
              );
            }
          });
        }
      );

      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout na conexão com SEFAZ (30s)"));
      });

      req.write(soapEnvelope);
      req.end();
    });
  } catch (e) {
    return {
      ok: false,
      erro: `Erro na conexão SEFAZ: ${(e as Error).message}`,
    };
  }

  // Parse da resposta SOAP
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(respostaXml) as Record<string, unknown>;
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao parsear resposta XML: ${(e as Error).message}`,
      raw: respostaXml.slice(0, 1000),
    };
  }

  // Estrutura esperada:
  // Envelope > Body > nfeDistDFeInteresseResponse > nfeDistDFeInteresseResult > retDistDFeInt
  // (alguns retornos vêm direto sem Envelope)
  const envelope =
    (parsed.Envelope as Record<string, unknown> | undefined) ?? parsed;
  const body = envelope?.Body as Record<string, unknown> | undefined;
  const responseTag = body
    ? (Object.values(body).find(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          "nfeDistDFeInteresseResult" in
            (v as Record<string, unknown>)
      ) as Record<string, unknown> | undefined)
    : undefined;
  const result = responseTag?.nfeDistDFeInteresseResult as
    | Record<string, unknown>
    | undefined;
  const retDistDFeInt =
    (result?.retDistDFeInt as Record<string, unknown> | undefined) ??
    (parsed.retDistDFeInt as Record<string, unknown> | undefined);

  if (!retDistDFeInt) {
    return {
      ok: false,
      erro: "Resposta SOAP em formato inesperado (retDistDFeInt ausente)",
      raw: respostaXml.slice(0, 2000),
    };
  }

  const cStat = String(retDistDFeInt.cStat ?? "");
  const xMotivo = String(retDistDFeInt.xMotivo ?? "");
  const ultNSU = String(retDistDFeInt.ultNSU ?? ultimoNsu);
  const maxNSU = String(retDistDFeInt.maxNSU ?? ultNSU);

  // Códigos comuns:
  // 137 = Nenhum documento localizado
  // 138 = Documento localizado para o destinatário
  // 656 = Consumo indevido (muitas chamadas — aguardar)
  // 215 = Falha de schema XML
  // 252 = Ambiente diferente
  if (cStat !== "137" && cStat !== "138") {
    return {
      ok: false,
      cStat,
      xMotivo,
      erro: `SEFAZ retornou status ${cStat}: ${xMotivo}`,
      raw: respostaXml.slice(0, 1000),
    };
  }

  // cStat 137 = sem novos documentos. cStat 138 = tem documentos no loteDistDFeInt
  const documentos: DocumentoRecebido[] = [];
  if (cStat === "138") {
    const lote = retDistDFeInt.loteDistDFeInt as
      | Record<string, unknown>
      | undefined;
    const docZipArr = lote?.docZip;
    const docZips = Array.isArray(docZipArr)
      ? docZipArr
      : docZipArr
      ? [docZipArr]
      : [];

    for (const dz of docZips) {
      const docZip = dz as { "#text"?: string; "@_NSU"?: string; "@_schema"?: string };
      const base64 = docZip["#text"] ?? "";
      try {
        const gzipped = Buffer.from(base64, "base64");
        const xml = gunzipSync(gzipped).toString("utf-8");
        documentos.push({
          schema: docZip["@_schema"] ?? "",
          nsu: docZip["@_NSU"] ?? "",
          xml,
        });
      } catch {
        // Pula doc corrompido
      }
    }
  }

  return {
    ok: true,
    cStat,
    xMotivo,
    ambiente: p.ambiente,
    ultimoNsu: ultNSU,
    maxNsu: maxNSU,
    documentos,
  };
}

// Helper pra outros serviços SEFAZ que exigem assinatura XMLDSig
// (não usado em distDFe, mas vai ser útil pra eSocial/FGTS/etc)
export function assinarXml(
  xml: string,
  privateKeyPem: string,
  certPem: string,
  refXpath: string,
  refId: string
): string {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: refXpath,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    uri: `#${refId}`,
  });
  sig.computeSignature(xml, {
    location: { reference: refXpath, action: "after" },
  });
  return sig.getSignedXml();
}

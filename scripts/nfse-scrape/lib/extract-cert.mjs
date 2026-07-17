// Extrai chave privada + certificado de um PFX (PKCS#12).
// Retorna PEM strings prontas pra `clientCertificates` do Playwright.

import forge from "node-forge";

/**
 * @param {Buffer} pfxBuffer
 * @param {string} senha
 * @returns {{ keyPem: string, certPem: string, subjectCN: string }}
 */
export function extractCert(pfxBuffer, senha) {
  const asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX");
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no PFX");

  const subjectCN =
    certBag.cert.subject.getField("CN")?.value ?? "(sem CN)";

  return {
    keyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
    subjectCN,
  };
}

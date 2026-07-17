// Nota Carioca — webservice ABRASF Nacional 1.0 do Rio de Janeiro
//
// Endpoints:
// - Produção:    https://notacarioca.rio.gov.br/WSNacional/nfse.asmx
// - Homologação: https://notacariocahom.rio.gov.br/WSNacional/nfse.asmx
//
// Autenticação: mTLS com cert A1 ICP-Brasil (obrigatório).
// XMLDSig do XML interno é OPCIONAL — pra consulta não precisa assinar.
//
// Protocolo: SOAP 1.1 (ASMX). Content-Type: text/xml; charset=utf-8.
// SOAPAction: "http://notacarioca.rio.gov.br/wsnacional/ConsultarNfse"
//
// Fase 6 do NFSe: só CONSULTAR notas emitidas (não emite, não cancela).
// A emissão foi decommissionada em 01/01/2026 — mas a consulta segue viva
// pra puxar histórico.
//
// Uso:
//   const res = await consultarNfseCarioca({
//     pfxBuffer, senha, ambiente: 1,
//     cnpjPrestador: '42576469000113',
//     inscricaoMunicipal: '12345678', // opcional
//     dataInicial: '2026-01-01',
//     dataFinal: '2026-07-16',
//   });

import forge from "node-forge";

export type AmbienteCarioca = 1 | 2; // 1=Produção, 2=Homologação

const ENDPOINTS: Record<AmbienteCarioca, string> = {
  1: "https://notacarioca.rio.gov.br/WSNacional/nfse.asmx",
  2: "https://notacariocahom.rio.gov.br/WSNacional/nfse.asmx",
};

const ABRASF_NS = "http://www.abrasf.org.br/nfse.xsd";
// SOAPAction: o servidor Nota Carioca rejeita "wsnacional" minúsculo com
// "Server did not recognize the value of HTTP Header SOAPAction". O path
// do endpoint é /WSNacional/nfse.asmx (WS maiúsculo). ASMX é case-sensitive
// nesse header.
const SOAP_ACTION = "http://notacarioca.rio.gov.br/WSNacional/ConsultarNfse";

export type NfseCariocaDoc = {
  chave: string;
  numero: string | null;
  serie: string | null;
  codigoVerificacao: string | null;
  dhEmissao: string | null;
  prestadorCnpj: string | null;
  prestadorNome: string | null;
  prestadorInscricao: string | null;
  tomadorDocumento: string | null;
  tomadorNome: string | null;
  valorServicos: number | null;
  valorIss: number | null;
  aliquotaIss: number | null;
  valorLiquido: number | null;
  codigoServico: string | null;
  discriminacao: string | null;
  status: "AUTORIZADA" | "CANCELADA";
  xml: string; // XML original da <Nfse>
};

export type ConsultarNfseParams = {
  pfxBuffer: Buffer;
  senha: string;
  ambiente: AmbienteCarioca;
  cnpjPrestador: string;
  inscricaoMunicipal?: string;
  dataInicial: string; // YYYY-MM-DD
  dataFinal: string; // YYYY-MM-DD
  paginaInicial?: number;
};

export type ConsultarNfseOk = {
  ok: true;
  ambiente: AmbienteCarioca;
  documentos: NfseCariocaDoc[];
  proximaPagina: number | null;
};

export type ConsultarNfseErro = {
  ok: false;
  status?: number;
  erro: string;
  codigo?: string;
  raw?: string;
};

// ─── Certificado ──────────────────────────────────────────────
function extrairKeyECert(
  pfxBuffer: Buffer,
  senha: string
): { privateKeyPem: string; certPem: string } {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no .pfx");
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no .pfx");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}

// ─── HTTP mTLS SOAP ───────────────────────────────────────────
async function soapRequest(opts: {
  endpoint: string;
  soapAction: string;
  envelope: string;
  privateKeyPem: string;
  certPem: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: string }> {
  const https = await import("node:https");
  const url = new URL(opts.endpoint);
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      cert: opts.certPem,
      key: opts.privateKeyPem,
      rejectUnauthorized: true,
    });
    const req = https.request(
      {
        host: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        agent,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${opts.soapAction}"`,
          "Content-Length": Buffer.byteLength(opts.envelope, "utf-8"),
        },
        timeout: opts.timeoutMs ?? 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      }
    );
    req.on("error", (e) => reject(e));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout Nota Carioca (${(opts.timeoutMs ?? 60_000) / 1000}s)`));
    });
    req.write(opts.envelope);
    req.end();
  });
}

// ─── XML builder ──────────────────────────────────────────────
function montarEnvelope(p: {
  cnpjPrestador: string;
  inscricaoMunicipal?: string;
  dataInicial: string;
  dataFinal: string;
  pagina: number;
}): string {
  // ConsultarNfseEnvio (ABRASF Nacional 1.0)
  // Referência: schemas.zip do notacarioca.rio.gov.br/files/WSNacional/
  const prestadorBlock = p.inscricaoMunicipal
    ? `<Prestador><Cnpj>${p.cnpjPrestador}</Cnpj><InscricaoMunicipal>${p.inscricaoMunicipal}</InscricaoMunicipal></Prestador>`
    : `<Prestador><Cnpj>${p.cnpjPrestador}</Cnpj></Prestador>`;

  const inner = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ConsultarNfseEnvio xmlns="${ABRASF_NS}">`,
    prestadorBlock,
    `<PeriodoEmissao>`,
    `<DataInicial>${p.dataInicial}</DataInicial>`,
    `<DataFinal>${p.dataFinal}</DataFinal>`,
    `</PeriodoEmissao>`,
    `</ConsultarNfseEnvio>`,
  ].join("");

  // O ASMX expõe um método `ConsultarNfse` que recebe a mensagem XML como string.
  // Envelope SOAP 1.1 padrão com CDATA no inner XML.
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">`,
    `<soap:Body>`,
    `<ConsultarNfse xmlns="http://notacarioca.rio.gov.br/WSNacional/">`,
    `<inputXML><![CDATA[${inner}]]></inputXML>`,
    `</ConsultarNfse>`,
    `</soap:Body>`,
    `</soap:Envelope>`,
  ].join("");
}

// ─── Parser ───────────────────────────────────────────────────
// Retorno do WS ASMX vem embrulhado:
// <soap:Envelope>
//   <soap:Body>
//     <ConsultarNfseResponse>
//       <ConsultarNfseResult> [XML escapado ou CDATA] </ConsultarNfseResult>
//     </ConsultarNfseResponse>
//   </soap:Body>
// </soap:Envelope>
function extrairInnerXml(soapBody: string): string {
  const m = soapBody.match(
    /<ConsultarNfseResult[^>]*>([\s\S]*?)<\/ConsultarNfseResult>/i
  );
  if (!m) return soapBody;
  // Desescapa entidades HTML se veio escapado
  return m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#xD;/g, "\r")
    .replace(/&#10;/g, "\n");
}

function pegarTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<[\\w:]*${tag}[^>]*>([\\s\\S]*?)</[\\w:]*${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : undefined;
}

function pegarNumero(xml: string, tag: string): number | undefined {
  const v = pegarTag(xml, tag);
  if (v == null || v === "") return undefined;
  const n = Number(v.replace(",", "."));
  return isFinite(n) ? n : undefined;
}

// Extrai lista de <ComplNfse> ou <Nfse> da resposta ConsultarNfse
function extrairDocumentos(innerXml: string): NfseCariocaDoc[] {
  const docs: NfseCariocaDoc[] = [];
  // Cada nota vem dentro de <CompNfse>...</CompNfse>
  const compRe = /<[\w:]*CompNfse[^>]*>([\s\S]*?)<\/[\w:]*CompNfse>/gi;
  let m: RegExpExecArray | null;
  while ((m = compRe.exec(innerXml)) !== null) {
    const compXml = m[1];
    const infNfse = pegarBloco(compXml, "InfNfse") ?? compXml;
    const chave = pegarTag(compXml, "Id") ?? pegarTag(infNfse, "CodigoVerificacao") ?? "";
    const cancelada = /<[\w:]*NfseCancelamento/i.test(compXml);

    // Prestador
    const prestadorBloco = pegarBloco(infNfse, "PrestadorServico") ?? "";
    const emitBloco = pegarBloco(prestadorBloco, "IdentificacaoPrestador") ?? "";
    // Tomador
    const tomadorBloco = pegarBloco(infNfse, "TomadorServico") ?? "";
    const idTomBloco = pegarBloco(tomadorBloco, "IdentificacaoTomador") ?? "";

    // Serviço
    const servBloco = pegarBloco(infNfse, "Servico") ?? "";
    const valoresBloco = pegarBloco(servBloco, "Valores") ?? "";

    docs.push({
      chave,
      numero: pegarTag(infNfse, "Numero") ?? null,
      serie: pegarTag(infNfse, "SerieRps") ?? null,
      codigoVerificacao: pegarTag(infNfse, "CodigoVerificacao") ?? null,
      dhEmissao: pegarTag(infNfse, "DataEmissao") ?? null,
      prestadorCnpj: pegarTag(emitBloco, "Cnpj") ?? pegarTag(emitBloco, "Cpf") ?? null,
      prestadorNome: pegarTag(prestadorBloco, "RazaoSocial") ?? null,
      prestadorInscricao: pegarTag(emitBloco, "InscricaoMunicipal") ?? null,
      tomadorDocumento:
        pegarTag(idTomBloco, "Cnpj") ?? pegarTag(idTomBloco, "Cpf") ?? null,
      tomadorNome: pegarTag(tomadorBloco, "RazaoSocial") ?? null,
      valorServicos: pegarNumero(valoresBloco, "ValorServicos") ?? null,
      valorIss: pegarNumero(valoresBloco, "ValorIss") ?? null,
      aliquotaIss: pegarNumero(valoresBloco, "Aliquota") ?? null,
      valorLiquido: pegarNumero(valoresBloco, "ValorLiquidoNfse") ?? null,
      codigoServico: pegarTag(servBloco, "ItemListaServico") ?? null,
      discriminacao: pegarTag(servBloco, "Discriminacao") ?? null,
      status: cancelada ? "CANCELADA" : "AUTORIZADA",
      xml: compXml,
    });
  }
  return docs;
}

function pegarBloco(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<[\\w:]*${tag}[^>]*>([\\s\\S]*?)</[\\w:]*${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

// ─── Ponto de entrada ─────────────────────────────────────────
export async function consultarNfseCarioca(
  p: ConsultarNfseParams
): Promise<ConsultarNfseOk | ConsultarNfseErro> {
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

  const envelope = montarEnvelope({
    cnpjPrestador: p.cnpjPrestador.replace(/\D/g, ""),
    inscricaoMunicipal: p.inscricaoMunicipal,
    dataInicial: p.dataInicial,
    dataFinal: p.dataFinal,
    pagina: p.paginaInicial ?? 1,
  });

  let res: { status: number; body: string };
  try {
    res = await soapRequest({
      endpoint: ENDPOINTS[p.ambiente],
      soapAction: SOAP_ACTION,
      envelope,
      privateKeyPem,
      certPem,
    });
  } catch (e) {
    return { ok: false, erro: `Conexão Nota Carioca: ${(e as Error).message}` };
  }

  if (res.status !== 200) {
    // SOAP Fault pode vir com 500. Tentamos extrair a mensagem.
    const fault = res.body.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
    return {
      ok: false,
      status: res.status,
      erro: fault ? fault[1].trim() : `HTTP ${res.status}`,
      raw: res.body.slice(0, 800),
    };
  }

  const inner = extrairInnerXml(res.body);

  // ListaMensagemRetorno (erros dentro do body 200)
  const codigo = pegarTag(inner, "Codigo");
  const mensagem = pegarTag(inner, "Mensagem");
  const documentos = extrairDocumentos(inner);

  if (documentos.length === 0 && codigo) {
    return {
      ok: false,
      erro: mensagem ?? `Nota Carioca: ${codigo}`,
      codigo,
      raw: inner.slice(0, 800),
    };
  }

  return {
    ok: true,
    ambiente: p.ambiente,
    documentos,
    proximaPagina: null,
  };
}

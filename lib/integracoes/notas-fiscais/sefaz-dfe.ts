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

const ENDPOINTS_DFE: Record<AmbienteSefaz, string> = {
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// Manifestação do Destinatário usa o NFeRecepcaoEvento4 do Ambiente Nacional
const ENDPOINTS_EVENTO: Record<AmbienteSefaz, string> = {
  1: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  2: "https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

// Códigos dos eventos de manifestação (Anexo II, NT 2012/002)
export const TIPOS_MANIFESTACAO = {
  CIENCIA: "210210",
  CONFIRMACAO: "210200",
  DESCONHECIMENTO: "210220",
  NAO_REALIZADA: "210240",
} as const;
export type TipoManifestacao = keyof typeof TIPOS_MANIFESTACAO;

const DESC_MANIFESTACAO: Record<string, string> = {
  "210210": "Ciencia da Operacao",
  "210200": "Confirmacao da Operacao",
  "210220": "Desconhecimento da Operacao",
  "210240": "Operacao nao Realizada",
};

// Mapa UF → código IBGE (cUF) — usado em todos os serviços SEFAZ
export const UF_TO_C_UF: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26",
  AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};

export function cUfDeEstado(uf: string | null | undefined): string {
  if (!uf) return "33"; // RJ default
  const code = UF_TO_C_UF[uf.toUpperCase()];
  return code ?? "33";
}

// ─── Status Servico — endpoints por UF (SVRS cobre vários) ────
// Aqui mapeio só UFs comuns + SVRS como fallback.
// SVRS atende: RJ, ES, MA, PA, RN, PB, PI, RR, AP, AM, DF, MT, MS, AC, AL, SE, TO, GO
const SVRS_HOM = "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx";
const SVRS_PROD = "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx";

const ENDPOINTS_STATUS: Record<string, Record<AmbienteSefaz, string>> = {
  // Estados com SEFAZ própria
  SP: {
    1: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    2: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  },
  RS: {
    1: "https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    2: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  },
  MG: {
    1: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
    2: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
  },
  PR: {
    1: "https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4",
    2: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4",
  },
  BA: {
    1: "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
    2: "https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
  },
};

function endpointStatusPorUf(uf: string, amb: AmbienteSefaz): string {
  const proprio = ENDPOINTS_STATUS[uf.toUpperCase()];
  if (proprio) return proprio[amb];
  return amb === 1 ? SVRS_PROD : SVRS_HOM;
}

export type DistribuirParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjOuCpfDestinatario: string;  // só dígitos
  ambiente: AmbienteSefaz;
  cUFAutor: string;               // código IBGE da UF (33, 35, etc.)
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
// IMPORTANTE: SEFAZ rejeita schema (cStat 215) se houver whitespace
// entre tags ou declaração XML interna. Tudo em UMA linha, sem indent.
function montarDistDFeInt(
  cnpjOuCpf: string,
  ambiente: AmbienteSefaz,
  cUFAutor: string,
  ultimoNsu: string
): string {
  const tipoTag = cnpjOuCpf.length === 14 ? "CNPJ" : "CPF";
  const nsuPadded = ultimoNsu.padStart(15, "0");
  return `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${ambiente}</tpAmb><cUFAutor>${cUFAutor}</cUFAutor><${tipoTag}>${cnpjOuCpf}</${tipoTag}><distNSU><ultNSU>${nsuPadded}</ultNSU></distNSU></distDFeInt>`;
}

// ─── Envelope SOAP do nfeDistDFeInteresse ────────────────
// Single line também — SEFAZ não tolera pretty-print.
function montarEnvelopeSoap(distDFeIntXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${distDFeIntXml}</nfeDadosMsg></nfeDistDFeInteresse></soap:Body></soap:Envelope>`;
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
    p.cUFAutor,
    ultimoNsu
  );
  const soapEnvelope = montarEnvelopeSoap(distDFeIntXml);

  // Chamada HTTPS com mTLS
  let respostaXml: string;
  try {
    const https = await import("node:https");
    const url = new URL(ENDPOINTS_DFE[p.ambiente]);

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

// ─── NfeStatusServico — verifica se SEFAZ está no ar ────────
// Não exige NF; só consulta o status do webservice de autorização.
// Útil antes de transmitir NF/eventos.

export type StatusServicoParams = {
  pfxBuffer: Buffer;
  senha: string;
  uf: string;                     // sigla "RJ", "SP", etc.
  ambiente: AmbienteSefaz;
};

export type StatusServicoOk = {
  ok: true;
  uf: string;
  ambiente: AmbienteSefaz;
  cStat: string;                  // 107 = Em operação
  xMotivo: string;
  tpAmb: string;
  verAplic: string;
  dhRecbto: string;               // data/hora
  tMed: string;                   // tempo médio de resposta (segundos)
  endpoint: string;
};

export type StatusServicoErro = {
  ok: false;
  uf: string;
  endpoint: string;
  erro: string;
  cStat?: string;
  raw?: string;
};

export async function consultarStatusServico(
  p: StatusServicoParams
): Promise<StatusServicoOk | StatusServicoErro> {
  const uf = p.uf.toUpperCase();
  const endpoint = endpointStatusPorUf(uf, p.ambiente);
  const cUF = cUfDeEstado(uf);

  let privateKeyPem: string;
  let certPem: string;
  try {
    const k = extrairKeyECert(p.pfxBuffer, p.senha);
    privateKeyPem = k.privateKeyPem;
    certPem = k.certPem;
  } catch (e) {
    return {
      ok: false,
      uf,
      endpoint,
      erro: `Falha ao ler .pfx: ${(e as Error).message}. Confira a senha.`,
    };
  }

  // XML interno consStatServ
  const consStatServ = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${p.ambiente}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">${consStatServ}</nfeDadosMsg></soap:Body></soap:Envelope>`;

  let respostaXml: string;
  try {
    const https = await import("node:https");
    const url = new URL(endpoint);

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
            "Content-Length": Buffer.byteLength(envelope, "utf-8"),
          },
          timeout: 15000,
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
                new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`)
              );
            }
          });
        }
      );
      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout (15s)"));
      });
      req.write(envelope);
      req.end();
    });
  } catch (e) {
    return {
      ok: false,
      uf,
      endpoint,
      erro: `Conexão SEFAZ: ${(e as Error).message}`,
    };
  }

  // Parse
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
      uf,
      endpoint,
      erro: `Parse XML: ${(e as Error).message}`,
      raw: respostaXml.slice(0, 1000),
    };
  }

  // Encontra retConsStatServ — pode estar em vários níveis dependendo do servidor
  function findRet(obj: unknown): Record<string, unknown> | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (o.retConsStatServ) return o.retConsStatServ as Record<string, unknown>;
    for (const v of Object.values(o)) {
      const r = findRet(v);
      if (r) return r;
    }
    return null;
  }
  const ret = findRet(parsed);
  if (!ret) {
    return {
      ok: false,
      uf,
      endpoint,
      erro: "retConsStatServ ausente na resposta",
      raw: respostaXml.slice(0, 1500),
    };
  }

  const cStat = String(ret.cStat ?? "");
  const xMotivo = String(ret.xMotivo ?? "");

  // cStat 107 = "Servico em Operacao" (OK)
  // 108 = "Servico Paralisado Momentaneamente" (manutenção curta)
  // 109 = "Servico Paralisado sem Previsao" (problemão)
  return {
    ok: true,
    uf,
    ambiente: p.ambiente,
    cStat,
    xMotivo,
    tpAmb: String(ret.tpAmb ?? ""),
    verAplic: String(ret.verAplic ?? ""),
    dhRecbto: String(ret.dhRecbto ?? ""),
    tMed: String(ret.tMed ?? ""),
    endpoint,
  };
}

// ─── Manifestação do Destinatário ──────────────────────────
// Envia evento (Ciência/Confirmação/Desconhecimento/Operação não realizada)
// pra uma chave de NF-e. Exige XML assinado com XMLDSig.

export type ManifestarParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjOuCpfDestinatario: string;  // só dígitos
  ambiente: AmbienteSefaz;
  chaveNFe: string;               // 44 dígitos
  tipoEvento: "210210" | "210200" | "210220" | "210240";
  numeroSequencia?: number;       // default 1; >1 se reenvio
  justificativa?: string;         // só obrigatório em desconhecimento/operação não realizada
};

export type ManifestarOk = {
  ok: true;
  cStat: string;                  // 128=Lote processado, 135=Evento registrado e vinculado
  xMotivo: string;
  protocolo?: string;
  dhRegEvento?: string;
  cStatEvento?: string;           // status do evento individual
  xMotivoEvento?: string;
};

export type ManifestarErro = {
  ok: false;
  cStat?: string;
  xMotivo?: string;
  erro: string;
  raw?: string;
};

function isoComOffset(d: Date): string {
  // SEFAZ exige formato ISO com offset (não Z): 2026-05-27T15:00:00-03:00
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  // offset em minutos
  const tz = -d.getTimezoneOffset();
  const tzSign = tz >= 0 ? "+" : "-";
  const tzh = pad(Math.floor(Math.abs(tz) / 60));
  const tzm = pad(Math.abs(tz) % 60);
  return `${y}-${m}-${day}T${h}:${min}:${sec}${tzSign}${tzh}:${tzm}`;
}

export async function manifestarNFe(
  p: ManifestarParams
): Promise<ManifestarOk | ManifestarErro> {
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

  const tpEvento = p.tipoEvento;
  const desc = DESC_MANIFESTACAO[tpEvento];
  const nSeqEvento = p.numeroSequencia ?? 1;
  const tipoTag = p.cnpjOuCpfDestinatario.length === 14 ? "CNPJ" : "CPF";
  const dhEvento = isoComOffset(new Date());

  // ID do evento: "ID" + tpEvento(6) + chNFe(44) + nSeqEvento(2 dígitos)
  const seqStr = String(nSeqEvento).padStart(2, "0");
  const idEvento = `ID${tpEvento}${p.chaveNFe}${seqStr}`;

  // detEvento varia: cnchamentos 210220/240 exigem justificativa.
  const exigeJust = tpEvento === "210220" || tpEvento === "210240";
  if (exigeJust && (!p.justificativa || p.justificativa.length < 15)) {
    return {
      ok: false,
      erro:
        "Eventos 210220 e 210240 exigem justificativa com no mínimo 15 caracteres.",
    };
  }
  const detEvento = exigeJust
    ? `<detEvento versao="1.00"><descEvento>${desc}</descEvento><xJust>${p.justificativa}</xJust></detEvento>`
    : `<detEvento versao="1.00"><descEvento>${desc}</descEvento></detEvento>`;

  // XML do evento (sem indentação)
  const infEvento = `<infEvento Id="${idEvento}"><cOrgao>91</cOrgao><tpAmb>${p.ambiente}</tpAmb><${tipoTag}>${p.cnpjOuCpfDestinatario}</${tipoTag}><chNFe>${p.chaveNFe}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeqEvento}</nSeqEvento><verEvento>1.00</verEvento>${detEvento}</infEvento>`;
  const eventoUnsigned = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${infEvento}</evento>`;

  // Assina o infEvento com XMLDSig
  let eventoAssinado: string;
  try {
    eventoAssinado = assinarXml(
      eventoUnsigned,
      privateKeyPem,
      certPem,
      "//*[local-name(.)='infEvento']",
      idEvento
    );
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao assinar evento: ${(e as Error).message}`,
    };
  }

  // Envelope envEvento (NFeRecepcaoEvento4 aceita lote com 1+ eventos)
  // idLote: identificador único do lote (timestamp curto)
  const idLote = String(Date.now()).slice(-15);
  const envEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${eventoAssinado}</envEvento>`;

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${envEvento}</nfeDadosMsg></soap:Body></soap:Envelope>`;

  // Envia
  let respostaXml: string;
  try {
    const https = await import("node:https");
    const url = new URL(ENDPOINTS_EVENTO[p.ambiente]);

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
              reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
            }
          });
        }
      );
      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout (30s)"));
      });
      req.write(soapEnvelope);
      req.end();
    });
  } catch (e) {
    return {
      ok: false,
      erro: `Conexão SEFAZ: ${(e as Error).message}`,
    };
  }

  // Parse retEnvEvento
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
      erro: `Parse XML: ${(e as Error).message}`,
      raw: respostaXml.slice(0, 1500),
    };
  }

  function findKey(
    obj: unknown,
    key: string
  ): Record<string, unknown> | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (o[key]) return o[key] as Record<string, unknown>;
    for (const v of Object.values(o)) {
      const r = findKey(v, key);
      if (r) return r;
    }
    return null;
  }

  const retEnv = findKey(parsed, "retEnvEvento");
  if (!retEnv) {
    return {
      ok: false,
      erro: "retEnvEvento ausente na resposta SEFAZ",
      raw: respostaXml.slice(0, 1500),
    };
  }

  const cStatLote = String(retEnv.cStat ?? "");
  const xMotivoLote = String(retEnv.xMotivo ?? "");

  // Status do evento individual (dentro do retEvento)
  const retEvento = findKey(retEnv, "retEvento") ?? findKey(retEnv, "infEvento");
  const infEv = retEvento ? findKey(retEvento, "infEvento") ?? retEvento : null;
  const cStatEv = infEv ? String(infEv.cStat ?? "") : undefined;
  const xMotivoEv = infEv ? String(infEv.xMotivo ?? "") : undefined;
  const protocolo = infEv ? String(infEv.nProt ?? "") : undefined;
  const dhReg = infEv ? String(infEv.dhRegEvento ?? "") : undefined;

  // Lote OK (128) E evento OK (135 Vinculado, 136 Não-vinculado mas registrado)
  const ok = cStatLote === "128" && (cStatEv === "135" || cStatEv === "136");
  if (!ok) {
    return {
      ok: false,
      cStat: cStatEv ?? cStatLote,
      xMotivo: xMotivoEv ?? xMotivoLote,
      erro: `Lote ${cStatLote} (${xMotivoLote})${cStatEv ? ` — Evento ${cStatEv} (${xMotivoEv})` : ""}`,
      raw: respostaXml.slice(0, 1500),
    };
  }

  return {
    ok: true,
    cStat: cStatEv ?? "",
    xMotivo: xMotivoEv ?? "",
    protocolo: protocolo || undefined,
    dhRegEvento: dhReg || undefined,
    cStatEvento: cStatEv,
    xMotivoEvento: xMotivoEv,
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

// Helpers compartilhados pelas 4 operações de Consulta a Identificadores
// de Eventos do eSocial. Cada operação (Empregador, NaoPeriodicos,
// Trabalhador, Tabela) tem seu próprio body XML + SOAPAction, mas reusa
// auth, transporte HTTPS, assinatura XMLDSig e parse de resposta.
//
// Gotchas validados na sessão de 2026-06-27 (vide
// reference_esocial_webservice_gotchas.md):
// - Path /dwlcirurgico/ (não /consultaridentificadoreseventos/)
// - SOAP 1.1 (Content-Type text/xml, SOAPAction header)
// - SOAPAction tem sufixo específico da operação (Empregador,
//   NaoPeriodicos, Trabalhador, Tabela)
// - SHA-256 RSA (não SHA-1 do SEFAZ)
// - isEmptyUri: true no xml-crypto v6 (sem isso, gera Id="_0" no <eSocial>)

import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { SignedXml } from "xml-crypto";

export type AmbienteEsocial = 1 | 2; // 1=Produção, 2=Produção Restrita (homologação)

// URLs corretas (jun/2026) — path /dwlcirurgico/ + subdomínio dedicado.
export const ENDPOINT_CONSULTA_IDS: Record<AmbienteEsocial, string> = {
  1: "https://webservices.download.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc",
  2: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc",
};

const SOAP_ACTION_BASE =
  "http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0/ServicoConsultarIdentificadoresEventos/";

// SOAPActions por operação (sufixo importa — WCF é estrito)
export const SOAP_ACTIONS = {
  Empregador: SOAP_ACTION_BASE + "ConsultarIdentificadoresEventosEmpregador",
  NaoPeriodicos: SOAP_ACTION_BASE + "ConsultarIdentificadoresEventosNaoPeriodicos",
  Trabalhador: SOAP_ACTION_BASE + "ConsultarIdentificadoresEventosTrabalhador",
  Tabela: SOAP_ACTION_BASE + "ConsultarIdentificadoresEventosTabela",
} as const;

export type OperacaoConsulta = keyof typeof SOAP_ACTIONS;

export type EventoIdentificado = {
  id: string;
  tpEvt: string;
  nrRecArqBase?: string;
};

export type RetornoConsultaOk = {
  ok: true;
  ambiente: AmbienteEsocial;
  cdResposta: string;
  descResposta: string;
  total: number;
  eventos: EventoIdentificado[];
};

export type RetornoConsultaErro = {
  ok: false;
  cdResposta?: string;
  descResposta?: string;
  erro: string;
  raw?: string;
};

// Códigos que indicam sucesso (mesmo vazio)
const CODIGOS_OK_VAZIO = new Set(["211", "406"]);
const CODIGO_OK_COM_DADOS = "201";

// Extrai chave + cert do .pfx
export function extrairKeyECert(
  pfxBuffer: Buffer,
  senha: string
): { privateKeyPem: string; certPem: string } {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    throw new Error("Chave privada não encontrada no .pfx");
  }
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error("Certificado não encontrado no .pfx");
  }
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}

// Assina <eSocial> raiz com XMLDSig SHA-256 (URI vazia, sem Id auto)
export function assinarESocial(
  xml: string,
  privateKeyPem: string,
  certPem: string
): string {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='eSocial']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: "",
    isEmptyUri: true, // não gerar Id automático que viola XSD
  });
  sig.computeSignature(xml, {
    location: {
      reference: "//*[local-name(.)='eSocial']",
      action: "append",
    },
  });
  return sig.getSignedXml();
}

// Envelope SOAP 1.1 padrão pra todas as operações de consulta
export function montarEnvelopeSoap(
  consultaXmlAssinado: string,
  operacao: OperacaoConsulta
): string {
  const opNome = `ConsultarIdentificadoresEventos${operacao}`;
  // Nome da tag interna SOAP varia ligeiramente por operação
  const innerTag = `consultaEventos${operacao}`;
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0"><soap:Header/><soap:Body><v1:${opNome}><v1:${innerTag}>${consultaXmlAssinado}</v1:${innerTag}></v1:${opNome}></soap:Body></soap:Envelope>`;
}

// Faz POST SOAP via mTLS — comum a todas as operações
export async function enviarSoapMTLS(
  endpoint: string,
  soapAction: string,
  soapEnvelope: string,
  privateKeyPem: string,
  certPem: string,
  timeoutMs = 20000
): Promise<string> {
  const https = await import("node:https");
  const url = new URL(endpoint);

  return new Promise<string>((resolve, reject) => {
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
          // SOAP 1.1 obrigatório (endpoint /dwlcirurgico/ rejeita SOAP 1.2)
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapAction,
          "Content-Length": Buffer.byteLength(soapEnvelope, "utf-8"),
        },
        timeout: timeoutMs,
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
      reject(new Error(`Timeout (${timeoutMs / 1000}s)`));
    });
    req.write(soapEnvelope);
    req.end();
  });
}

// Parse genérico da resposta — funciona pras 4 operações (estrutura igual)
export function parseRetornoConsulta(
  respostaXml: string,
  ambiente: AmbienteEsocial
): RetornoConsultaOk | RetornoConsultaErro {
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

  const retorno =
    findKey(parsed, "retornoConsultaIdentificadoresEvts") ??
    findKey(parsed, "retornoConsulta");
  if (!retorno) {
    return {
      ok: false,
      erro: "retorno ausente na resposta do eSocial",
      raw: respostaXml.slice(0, 1500),
    };
  }

  const status = findKey(retorno, "status");
  const cdResposta = String((status?.cdResposta as string | undefined) ?? "");
  const descResposta = String(
    (status?.descResposta as string | undefined) ?? ""
  );

  const ehSucesso =
    cdResposta === CODIGO_OK_COM_DADOS || CODIGOS_OK_VAZIO.has(cdResposta);

  if (!ehSucesso) {
    return {
      ok: false,
      cdResposta,
      descResposta,
      erro: `eSocial retornou ${cdResposta}: ${descResposta}`,
      raw: respostaXml.slice(0, 1500),
    };
  }

  // Coleta eventos quando houver
  const ideEventos = findKey(retorno, "ideEventos");
  const eventosArr = ideEventos?.ideEvento;
  const eventos: EventoIdentificado[] = [];
  if (eventosArr) {
    const lista = Array.isArray(eventosArr) ? eventosArr : [eventosArr];
    for (const e of lista as Array<Record<string, unknown>>) {
      eventos.push({
        id: String(e.id ?? ""),
        tpEvt: String(e.tpEvt ?? ""),
        nrRecArqBase: e.nrRecArqBase ? String(e.nrRecArqBase) : undefined,
      });
    }
  }

  return {
    ok: true,
    ambiente,
    cdResposta,
    descResposta,
    total: eventos.length,
    eventos,
  };
}

// Date helpers
export function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function primeiroDiaMesCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ultimoDiaMesCorrente(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// eSocial — Consultar Identificadores de Eventos do Empregador.
//
// Webservice: WsConsultarIdentificadoresEventos
// Schema: consulta-identificadores-eventos/empregador/v1_0_0
//
// Esta operação NÃO exige assinatura XMLDSig (diferente de envio de eventos).
// Basta mTLS com cert A1 + SOAP envelope. Retorna lista de IDs de eventos
// já enviados pra aquele empregador no período.
//
// Uso típico:
// - "Status check": chamar com período curto (hoje), retorno vazio = WS no ar
// - Auditoria: listar tudo que foi enviado num mês
//
// Refs:
// - Manual Orientação Desenvolvedor (MOD) v1.1
// - WSDL: https://webservices.envio.esocial.gov.br/...?wsdl

import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { SignedXml } from "xml-crypto";

export type AmbienteEsocial = 1 | 2; // 1=Produção, 2=Produção Restrita (homologação)

// Endpoints corretos (jun/2026): o path é /dwlcirurgico/ (download cirúrgico),
// não /consultaridentificadoreseventos/. Subdomínio de Produção é "download".
// Validado contra nfephp-org/sped-esocial PR #208 e webservices.download.esocial.gov.br
const ENDPOINTS_CONSULTA_IDS: Record<AmbienteEsocial, string> = {
  1: "https://webservices.download.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc",
  2: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc",
};

// SOAPAction esperado pelo WCF do eSocial. O nome da operação tem que bater
// EXATAMENTE com o body (ConsultarIdentificadoresEventosEmpregador, com
// sufixo Empregador). Genérico "ConsultarIdentificadoresEventos" retorna
// ActionNotSupported / ContractFilter mismatch.
const SOAP_ACTION_CONSULTAR =
  "http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0/ServicoConsultarIdentificadoresEventos/ConsultarIdentificadoresEventosEmpregador";

// Tipos de evento aceitos no eSocial (subset comum)
export type TipoEventoEsocial =
  | "S-1000" // Cadastro empregador
  | "S-1005" // Tabela estabelecimentos
  | "S-1010" // Tabela rubricas
  | "S-1020" // Tabela lotações
  | "S-1070" // Tabela processos administrativos/judiciais
  | "S-1200" // Remuneração trabalhador
  | "S-1210" // Pagamentos
  | "S-1299" // Fechamento eventos periódicos
  | "S-2200" // Admissão
  | "S-2299" // Desligamento
  | "S-2299_PROC" // Desligamento processado
  | "S-2399" // TSV término
  | "S-2210" // CAT
  | "S-2220" // ASO
  | "S-2240"; // Riscos

export type ConsultarIdsParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjEmpregador: string;     // só dígitos (raíz 8 OU completo 14 — função extrai raíz)
  ambiente: AmbienteEsocial;
  // Filtros opcionais. Se omitir, consulta o período atual (mês corrente).
  tpEvt?: TipoEventoEsocial;
  perApur?: string;            // YYYY-MM (eventos periódicos)
  dtIni?: string;              // YYYY-MM-DD (eventos não-periódicos)
  dtFim?: string;              // YYYY-MM-DD
};

export type EventoIdentificado = {
  id: string;                  // ID do evento eSocial
  tpEvt: string;
  nrRecArqBase?: string;       // recibo de transmissão
};

export type ConsultarIdsOk = {
  ok: true;
  ambiente: AmbienteEsocial;
  cdResposta: string;          // 201 = consulta processada com sucesso
  descResposta: string;
  total: number;
  eventos: EventoIdentificado[];
};

export type ConsultarIdsErro = {
  ok: false;
  cdResposta?: string;
  descResposta?: string;
  erro: string;
  raw?: string;
};

// Extrai chave + cert do .pfx
function extrairKeyECert(pfxBuffer: Buffer, senha: string): {
  privateKeyPem: string;
  certPem: string;
} {
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

function monthCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Monta o XML eSocial de consulta (sem assinatura — operação só de leitura)
function montarConsultaXml(p: ConsultarIdsParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const tpEvt = p.tpEvt ?? "S-1200";
  const eventoPerApur = !p.dtIni && !p.dtFim;
  const perApur = p.perApur ?? monthCorrente();

  const filtro = eventoPerApur
    ? `<consultaEvtsEmpregador><tpEvt>${tpEvt}</tpEvt><perApur>${perApur}</perApur></consultaEvtsEmpregador>`
    : `<consultaEvtsTabela><tpEvt>${tpEvt}</tpEvt><dtIni>${p.dtIni}</dtIni><dtFim>${p.dtFim}</dtFim></consultaEvtsTabela>`;

  return `<eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/empregador/v1_0_0"><consultaIdentificadoresEvts><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador>${filtro}</consultaIdentificadoresEvts></eSocial>`;
}

function montarEnvelopeSoap(consultaXml: string): string {
  // O endpoint dwlcirurgico do eSocial usa SOAP 1.1 (text/xml + SOAPAction
  // em header separado). Tentar SOAP 1.2 (application/soap+xml) retorna
  // HTTP 415 Unsupported Media Type.
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0"><soap:Header/><soap:Body><v1:ConsultarIdentificadoresEventosEmpregador><v1:consultaEventosEmpregador>${consultaXml}</v1:consultaEventosEmpregador></v1:ConsultarIdentificadoresEventosEmpregador></soap:Body></soap:Envelope>`;
}

// Assina o elemento <eSocial> raiz com XMLDSig (URI vazia = documento inteiro).
// O eSocial exige assinatura mesmo em operações de só consulta — sem ela
// o servidor retorna 417 "List of possible elements expected: 'Signature'".
function assinarESocial(
  xml: string,
  privateKeyPem: string,
  certPem: string
): string {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='eSocial']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    uri: "",
  });
  sig.computeSignature(xml, {
    location: {
      reference: "//*[local-name(.)='eSocial']",
      action: "append",
    },
  });
  return sig.getSignedXml();
}

export async function consultarIdentificadoresEsocial(
  p: ConsultarIdsParams
): Promise<ConsultarIdsOk | ConsultarIdsErro> {
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

  const consultaXmlUnsigned = montarConsultaXml(p);
  let consultaXml: string;
  try {
    consultaXml = assinarESocial(consultaXmlUnsigned, privateKeyPem, certPem);
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao assinar XML: ${(e as Error).message}`,
    };
  }
  const soapEnvelope = montarEnvelopeSoap(consultaXml);
  const endpoint = ENDPOINTS_CONSULTA_IDS[p.ambiente];

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
            // SOAP 1.1: text/xml + SOAPAction em header separado.
            // (Endpoint dwlcirurgico rejeita SOAP 1.2 com HTTP 415.)
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: SOAP_ACTION_CONSULTAR,
            "Content-Length": Buffer.byteLength(soapEnvelope, "utf-8"),
          },
          timeout: 20000,
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
                new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`)
              );
            }
          });
        }
      );
      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout na conexão com eSocial (20s)"));
      });
      req.write(soapEnvelope);
      req.end();
    });
  } catch (e) {
    return {
      ok: false,
      erro: `Conexão eSocial: ${(e as Error).message}`,
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
      erro: `Parse XML: ${(e as Error).message}`,
      raw: respostaXml.slice(0, 1500),
    };
  }

  // Recursivo: procura retornoConsulta no XML aninhado
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
      erro: "retornoConsultaIdentificadoresEvts ausente na resposta",
      raw: respostaXml.slice(0, 1500),
    };
  }

  const status = findKey(retorno, "status");
  const cdResposta = String(
    (status?.cdResposta as string | undefined) ?? ""
  );
  const descResposta = String(
    (status?.descResposta as string | undefined) ?? ""
  );

  // cdResposta 201 = Consulta processada com sucesso
  // Outros códigos: 211 = empregador sem eventos no período, 401 = erro
  if (cdResposta !== "201" && cdResposta !== "211") {
    return {
      ok: false,
      cdResposta,
      descResposta,
      erro: `eSocial retornou ${cdResposta}: ${descResposta}`,
      raw: respostaXml.slice(0, 1500),
    };
  }

  // Coleta eventos (estrutura: ideEventos > ideEvento[])
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
    ambiente: p.ambiente,
    cdResposta,
    descResposta,
    total: eventos.length,
    eventos,
  };
}

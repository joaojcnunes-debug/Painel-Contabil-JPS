// eSocial — EnviarLoteEventos
//
// Operação de ENVIO de eventos ao eSocial. Recebe um array de XMLs de
// eventos JÁ ASSINADOS individualmente (a função montaEvento+assina é
// responsabilidade de quem chama — ver builders/s1000.ts, etc).
//
// Workflow:
// 1. Cliente monta XML do evento (formato S-1000, S-2200, etc)
// 2. Cliente assina cada XML de evento individualmente com XMLDSig SHA-256
// 3. enviarLoteEventos envelopa tudo em <envioLoteEventos> + envia via mTLS
// 4. Resposta traz cdResposta + nrRecibo (protocolo) se cdResposta=201
// 5. Cliente faz polling via consultar-lote.ts até processar
//
// Refs:
// - Schema: envioLoteEventos v1_1_1 (S-1.3 ainda usa 1_1_1)
// - Endpoint: WsEnviarLoteEventos.svc (subdomínio "envio" não "download")
// - SOAP 1.1, action específico

import {
  assinarESocial,
  enviarSoapMTLS,
  extrairKeyECert,
  type AmbienteEsocial,
} from "./_shared";
import { XMLParser } from "fast-xml-parser";

const ENDPOINT_ENVIO: Record<AmbienteEsocial, string> = {
  1: "https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
  2: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
};

const SOAP_ACTION_ENVIO =
  "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_1/ServicoEnviarLoteEventos/EnviarLoteEventos";

export type GrupoEnvio = 1 | 2 | 3;
// 1 = Empresas com faturamento > 78M
// 2 = Demais entidades privadas
// 3 = Órgãos públicos

export type EnviarLoteParams = {
  pfxBuffer: Buffer;
  senha: string;
  ambiente: AmbienteEsocial;
  cnpjEmpregador: string;     // 14 dígitos — raíz será extraída (8 dígitos)
  cnpjTransmissor?: string;   // se omitido, usa o do empregador
  grupo: GrupoEnvio;
  // Lista de XMLs de eventos JÁ ASSINADOS (cada um já com sua <Signature>).
  // Cada string deve ser um <eSocial>...</eSocial> completo com signature.
  eventosAssinadosXml: string[];
};

export type EnviarLoteOk = {
  ok: true;
  ambiente: AmbienteEsocial;
  cdResposta: string;          // 201 = lote aceito; outros = rejeitado
  descResposta: string;
  protocolo: string;           // nrRecibo (usar pra consultar processamento)
  dhRecepcao?: string;
  rawXml?: string;
};

export type EnviarLoteErro = {
  ok: false;
  cdResposta?: string;
  descResposta?: string;
  erro: string;
  rawXml?: string;
};

function montarEnvioLoteXml(p: EnviarLoteParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const cnpjTx = (p.cnpjTransmissor ?? p.cnpjEmpregador).replace(/\D/g, "");

  // Cada XML de evento vira <evento Id="..."> dentro de <eventos>.
  // O ID do <evento> wrapper é arbitrário; usaremos um sequencial baseado
  // no hash do conteúdo pra ficar determinístico.
  const eventosBlock = p.eventosAssinadosXml
    .map((xmlEvt, idx) => {
      // Extrai o Id do evento interno se houver, senão gera
      const idMatch = xmlEvt.match(/Id="([^"]+)"/);
      const id = idMatch ? idMatch[1] : `EV${String(idx + 1).padStart(2, "0")}`;
      return `<evento Id="${id}">${xmlEvt}</evento>`;
    })
    .join("");

  return `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1"><envioLoteEventos grupo="${p.grupo}"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador><ideTransmissor><tpInsc>1</tpInsc><nrInsc>${cnpjTx}</nrInsc></ideTransmissor><eventos>${eventosBlock}</eventos></envioLoteEventos></eSocial>`;
}

function montarEnvelopeSoapEnvio(loteXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_1"><soap:Header/><soap:Body><v1:EnviarLoteEventos><v1:loteEventos>${loteXml}</v1:loteEventos></v1:EnviarLoteEventos></soap:Body></soap:Envelope>`;
}

export async function enviarLoteEventos(
  p: EnviarLoteParams
): Promise<EnviarLoteOk | EnviarLoteErro> {
  if (p.eventosAssinadosXml.length === 0) {
    return { ok: false, erro: "Lote vazio (informe ao menos 1 evento)" };
  }
  if (p.eventosAssinadosXml.length > 50) {
    return {
      ok: false,
      erro: `Lote excede limite eSocial de 50 eventos (recebido ${p.eventosAssinadosXml.length})`,
    };
  }

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

  // O envelope de envio (envioLoteEventos) NÃO precisa de assinatura no
  // root — só os eventos individuais dentro de <eventos>. Esses já vêm
  // assinados pelo caller.
  const loteXml = montarEnvioLoteXml(p);
  const soapEnvelope = montarEnvelopeSoapEnvio(loteXml);

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_ENVIO[p.ambiente],
      SOAP_ACTION_ENVIO,
      soapEnvelope,
      privateKeyPem,
      certPem,
      30000 // envio pode demorar mais que consulta
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRespostaEnvio(respostaXml, p.ambiente);
}

function parseRespostaEnvio(
  respostaXml: string,
  ambiente: AmbienteEsocial
): EnviarLoteOk | EnviarLoteErro {
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
      rawXml: respostaXml.slice(0, 1500),
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
    findKey(parsed, "retornoEnvioLoteEventos") ??
    findKey(parsed, "retornoEnvioLote");
  if (!retorno) {
    return {
      ok: false,
      erro: "retornoEnvioLoteEventos ausente na resposta",
      rawXml: respostaXml.slice(0, 2000),
    };
  }

  const status = findKey(retorno, "status");
  const cdResposta = String((status?.cdResposta as string | undefined) ?? "");
  const descResposta = String(
    (status?.descResposta as string | undefined) ?? ""
  );

  // 201 = Lote recebido com sucesso (vai ter <dadosRecebimentoLote>)
  // Outros = rejeitado na recepção (XML mal-formado, lote >50, etc)
  if (cdResposta !== "201") {
    return {
      ok: false,
      cdResposta,
      descResposta,
      erro: `eSocial recusou o lote: ${cdResposta} ${descResposta}`,
      rawXml: respostaXml.slice(0, 2000),
    };
  }

  const dadosRecebimento = findKey(retorno, "dadosRecebimentoLote");
  const nrRecibo = String(
    (dadosRecebimento?.nrRecibo as string | undefined) ??
      (dadosRecebimento?.protocoloEnvio as string | undefined) ??
      ""
  );
  const dhRecepcao = dadosRecebimento?.dhRecepcao
    ? String(dadosRecebimento.dhRecepcao)
    : undefined;

  if (!nrRecibo) {
    return {
      ok: false,
      cdResposta,
      descResposta,
      erro: "eSocial aceitou o lote mas não retornou nrRecibo",
      rawXml: respostaXml.slice(0, 2000),
    };
  }

  return {
    ok: true,
    ambiente,
    cdResposta,
    descResposta,
    protocolo: nrRecibo,
    dhRecepcao,
    rawXml: respostaXml.slice(0, 5000),
  };
}

// eSocial — ConsultarLoteEventos
//
// Após enviarLoteEventos retornar nrRecibo, o lote vai pra fila de
// processamento do eSocial. Este endpoint consulta o STATUS de cada
// evento do lote pelo protocolo recebido.
//
// Workflow esperado pelo eSocial:
// - Cliente chama envio → recebe protocolo
// - AGUARDA pelo menos 30s antes de consultar (servidor enfileira)
// - Consulta. Se status_lote ainda "EM_PROCESSAMENTO", aguardar +30s
// - Quando finalizado, response traz lista <retornoEvento> com cdResposta
//   individual de cada evento (validado / rejeitado / advertência)

import {
  enviarSoapMTLS,
  extrairKeyECert,
  type AmbienteEsocial,
} from "./_shared";
import { XMLParser } from "fast-xml-parser";

const ENDPOINT_CONSULTA_LOTE: Record<AmbienteEsocial, string> = {
  1: "https://webservices.envio.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
  2: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
};

const SOAP_ACTION_CONSULTA_LOTE =
  "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0/ServicoConsultarLoteEventos/ConsultarLoteEventos";

export type ConsultarLoteParams = {
  pfxBuffer: Buffer;
  senha: string;
  ambiente: AmbienteEsocial;
  protocolo: string;  // nrRecibo retornado pelo enviarLoteEventos
};

export type EventoRetornado = {
  id: string;
  cdResposta: string;
  descResposta: string;
  protocoloEvento?: string;     // nrRecibo individual (gerado após validado)
  hash?: string;                // hash de validação do evento
  ocorrencias: Array<{
    tipo: string;               // "1"=erro, "2"=advertência
    codigo: string;
    descricao: string;
    localizacao?: string;
  }>;
};

export type ConsultarLoteOk = {
  ok: true;
  ambiente: AmbienteEsocial;
  cdResposta: string;
  descResposta: string;
  // 101 = em processamento (polling)
  // 201 = todos eventos processados
  emProcessamento: boolean;
  eventos: EventoRetornado[];
  rawXml?: string;
};

export type ConsultarLoteErro = {
  ok: false;
  cdResposta?: string;
  descResposta?: string;
  erro: string;
  rawXml?: string;
};

function montarConsultaXml(protocolo: string): string {
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0"><consultaLoteEventos><protocoloEnvio>${protocolo}</protocoloEnvio></consultaLoteEventos></eSocial>`;
}

function montarEnvelopeSoap(consultaXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0"><soap:Header/><soap:Body><v1:ConsultarLoteEventos><v1:consulta>${consultaXml}</v1:consulta></v1:ConsultarLoteEventos></soap:Body></soap:Envelope>`;
}

export async function consultarLoteEventos(
  p: ConsultarLoteParams
): Promise<ConsultarLoteOk | ConsultarLoteErro> {
  if (!p.protocolo) {
    return { ok: false, erro: "Protocolo obrigatório" };
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

  // Consulta de protocolo NÃO precisa de XMLDSig (só o envio dos eventos).
  const consultaXml = montarConsultaXml(p.protocolo);
  const soapEnvelope = montarEnvelopeSoap(consultaXml);

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_CONSULTA_LOTE[p.ambiente],
      SOAP_ACTION_CONSULTA_LOTE,
      soapEnvelope,
      privateKeyPem,
      certPem,
      20000
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRespostaConsulta(respostaXml, p.ambiente);
}

function parseRespostaConsulta(
  respostaXml: string,
  ambiente: AmbienteEsocial
): ConsultarLoteOk | ConsultarLoteErro {
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
    findKey(parsed, "retornoProcessamentoLoteEventos") ??
    findKey(parsed, "retornoConsultaLoteEventos") ??
    findKey(parsed, "retornoProcessamento");
  if (!retorno) {
    return {
      ok: false,
      erro: "retornoProcessamentoLoteEventos ausente na resposta",
      rawXml: respostaXml.slice(0, 2000),
    };
  }

  const status = findKey(retorno, "status");
  const cdResposta = String((status?.cdResposta as string | undefined) ?? "");
  const descResposta = String(
    (status?.descResposta as string | undefined) ?? ""
  );

  // 101 = lote em processamento (cliente deve aguardar e consultar de novo)
  // 201 = lote processado (eventos individuais já têm cdResposta próprio)
  const emProcessamento = cdResposta === "101";
  const processado = cdResposta === "201";

  if (!emProcessamento && !processado) {
    return {
      ok: false,
      cdResposta,
      descResposta,
      erro: `eSocial retornou ${cdResposta}: ${descResposta}`,
      rawXml: respostaXml.slice(0, 2000),
    };
  }

  // Quando emProcessamento, não há lista de eventos ainda
  if (emProcessamento) {
    return {
      ok: true,
      ambiente,
      cdResposta,
      descResposta,
      emProcessamento: true,
      eventos: [],
      rawXml: respostaXml.slice(0, 1500),
    };
  }

  // Quando processado, retornoEventos > evento[] com retornoEvento dentro
  const retornoEventos = findKey(retorno, "retornoEventos");
  const eventos: EventoRetornado[] = [];
  if (retornoEventos) {
    const lista = retornoEventos.evento;
    const arr = Array.isArray(lista) ? lista : lista ? [lista] : [];
    for (const ev of arr as Array<Record<string, unknown>>) {
      const retornoEvt = findKey(ev, "retornoEvento") ?? ev;
      const statusEvt = findKey(retornoEvt, "status");
      const recibo = findKey(retornoEvt, "recibo");
      const ocorr = findKey(retornoEvt, "ocorrencias");
      const id = String((ev["@_Id"] as string | undefined) ?? "");

      const ocorrencias: EventoRetornado["ocorrencias"] = [];
      if (ocorr) {
        const occList = ocorr.ocorrencia;
        const occArr = Array.isArray(occList)
          ? occList
          : occList
          ? [occList]
          : [];
        for (const o of occArr as Array<Record<string, unknown>>) {
          ocorrencias.push({
            tipo: String(o.tipo ?? ""),
            codigo: String(o.codigo ?? ""),
            descricao: String(o.descricao ?? ""),
            localizacao: o.localizacao ? String(o.localizacao) : undefined,
          });
        }
      }

      eventos.push({
        id,
        cdResposta: String((statusEvt?.cdResposta as string | undefined) ?? ""),
        descResposta: String(
          (statusEvt?.descResposta as string | undefined) ?? ""
        ),
        protocoloEvento: recibo?.nrRecibo
          ? String(recibo.nrRecibo)
          : undefined,
        hash: recibo?.hash ? String(recibo.hash) : undefined,
        ocorrencias,
      });
    }
  }

  return {
    ok: true,
    ambiente,
    cdResposta,
    descResposta,
    emProcessamento: false,
    eventos,
    rawXml: respostaXml.slice(0, 5000),
  };
}

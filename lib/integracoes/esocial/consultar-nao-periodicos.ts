// eSocial — ConsultarIdentificadoresEventosNaoPeriodicos
//
// Operação: lista eventos NÃO-PERIÓDICOS do empregador. Filtra por
// data (dtIni/dtFim YYYY-MM-DD), não por competência.
//
// Tipos cobertos: S-2190 (admissão preliminar), S-2200 (admissão),
// S-2205 (alt cadastrais), S-2206 (alt contrato), S-2210 (CAT),
// S-2220 (ASO), S-2230 (afastamento), S-2240 (riscos), S-2250 (aviso
// prévio), S-2260 (convocação), S-2298 (reintegração), S-2299
// (desligamento — também listado em Trabalhador), S-2300 (TSV início),
// S-2306 (TSV alt), S-2399 (TSV término), S-2400 (cad. benef. PJ),
// etc.

import {
  ENDPOINT_CONSULTA_IDS,
  SOAP_ACTIONS,
  assinarESocial,
  enviarSoapMTLS,
  extrairKeyECert,
  montarEnvelopeSoap,
  parseRetornoConsulta,
  primeiroDiaMesCorrente,
  ultimoDiaMesCorrente,
  type AmbienteEsocial,
  type RetornoConsultaErro,
  type RetornoConsultaOk,
} from "./_shared";

export type TipoEventoNaoPeriodico =
  | "S-2190"
  | "S-2200"
  | "S-2205"
  | "S-2206"
  | "S-2210"
  | "S-2220"
  | "S-2230"
  | "S-2240"
  | "S-2250"
  | "S-2260"
  | "S-2298"
  | "S-2299"
  | "S-2300"
  | "S-2306"
  | "S-2399"
  | "S-2400"
  | "S-2405";

export type ConsultarNaoPeriodicosParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjEmpregador: string;
  ambiente: AmbienteEsocial;
  tpEvt: TipoEventoNaoPeriodico;
  dtIni?: string; // YYYY-MM-DD
  dtFim?: string; // YYYY-MM-DD
};

function montarConsultaXml(p: ConsultarNaoPeriodicosParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const dtIni = p.dtIni ?? primeiroDiaMesCorrente();
  const dtFim = p.dtFim ?? ultimoDiaMesCorrente();
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/empregador/v1_0_0"><consultaIdentificadoresEvts><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador><consultaEvtsNaoPeriodicos><tpEvt>${p.tpEvt}</tpEvt><dtIni>${dtIni}</dtIni><dtFim>${dtFim}</dtFim></consultaEvtsNaoPeriodicos></consultaIdentificadoresEvts></eSocial>`;
}

export async function consultarNaoPeriodicosEsocial(
  p: ConsultarNaoPeriodicosParams
): Promise<RetornoConsultaOk | RetornoConsultaErro> {
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

  let consultaXml: string;
  try {
    consultaXml = assinarESocial(
      montarConsultaXml(p),
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao assinar XML: ${(e as Error).message}`,
    };
  }

  const soapEnvelope = montarEnvelopeSoap(consultaXml, "NaoPeriodicos");

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_CONSULTA_IDS[p.ambiente],
      SOAP_ACTIONS.NaoPeriodicos,
      soapEnvelope,
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRetornoConsulta(respostaXml, p.ambiente);
}

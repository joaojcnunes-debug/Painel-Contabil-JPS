// eSocial — ConsultarIdentificadoresEventosEmpregador
//
// Operação: lista eventos PERIÓDICOS do empregador (S-1298 reabertura,
// S-1299 fechamento) por competência. Filtro: perApur (YYYY-MM).
//
// Esta é a operação mais simples (sem precisar CPF). Pra outros eventos
// veja:
// - consultar-nao-periodicos.ts: S-2200, S-2300 (filtro dtIni/dtFim)
// - consultar-trabalhador.ts:    S-1200, S-2299 (precisa CPF)
// - consultar-tabela.ts:         S-1010, S-1020 (filtro dtIni/dtFim)

import {
  ENDPOINT_CONSULTA_IDS,
  SOAP_ACTIONS,
  assinarESocial,
  competenciaAtual,
  enviarSoapMTLS,
  extrairKeyECert,
  montarEnvelopeSoap,
  parseRetornoConsulta,
  type AmbienteEsocial,
  type RetornoConsultaErro,
  type RetornoConsultaOk,
} from "./_shared";

// Re-exports pra manter compat com imports antigos
export type { AmbienteEsocial, EventoIdentificado } from "./_shared";
export type ConsultarIdsOk = RetornoConsultaOk;
export type ConsultarIdsErro = RetornoConsultaErro;

// Tipos de evento periódicos do empregador
export type TipoEventoEsocial = "S-1298" | "S-1299";

export type ConsultarIdsParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjEmpregador: string;
  ambiente: AmbienteEsocial;
  tpEvt?: TipoEventoEsocial;
  perApur?: string; // YYYY-MM
};

function montarConsultaXml(p: ConsultarIdsParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const tpEvt = p.tpEvt ?? "S-1299";
  const perApur = p.perApur ?? competenciaAtual();
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/empregador/v1_0_0"><consultaIdentificadoresEvts><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador><consultaEvtsEmpregador><tpEvt>${tpEvt}</tpEvt><perApur>${perApur}</perApur></consultaEvtsEmpregador></consultaIdentificadoresEvts></eSocial>`;
}

export async function consultarIdentificadoresEsocial(
  p: ConsultarIdsParams
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

  const soapEnvelope = montarEnvelopeSoap(consultaXml, "Empregador");

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_CONSULTA_IDS[p.ambiente],
      SOAP_ACTIONS.Empregador,
      soapEnvelope,
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRetornoConsulta(respostaXml, p.ambiente);
}

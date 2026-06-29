// eSocial — ConsultarIdentificadoresEventosTabela
//
// Operação: lista eventos de TABELA (tipo S-10xx). Filtros: dtIni/dtFim
// (YYYY-MM-DD) — período de vigência da tabela.
//
// Tipos cobertos: S-1005 (estabelecimentos / obras), S-1010 (rubricas),
// S-1020 (lotações tributárias), S-1030 (cargos), S-1035 (carreiras
// públicas), S-1040 (funções e cargos em comissão), S-1050 (horários e
// turnos), S-1060 (ambientes de trabalho), S-1070 (processos
// administrativos/judiciais), S-1080 (operadores portuários).

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

export type TipoEventoTabela =
  | "S-1005"
  | "S-1010"
  | "S-1020"
  | "S-1030"
  | "S-1035"
  | "S-1040"
  | "S-1050"
  | "S-1060"
  | "S-1070"
  | "S-1080";

export type ConsultarTabelaParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjEmpregador: string;
  ambiente: AmbienteEsocial;
  tpEvt: TipoEventoTabela;
  dtIni?: string; // YYYY-MM-DD
  dtFim?: string; // YYYY-MM-DD
  // chvEvento opcional (chave da tabela específica) — só pra filtrar por 1 registro
  chvEvento?: string;
};

function montarConsultaXml(p: ConsultarTabelaParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const dtIni = p.dtIni ?? primeiroDiaMesCorrente();
  const dtFim = p.dtFim ?? ultimoDiaMesCorrente();
  const chvEvento = p.chvEvento
    ? `<chvEvento>${p.chvEvento}</chvEvento>`
    : "";
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/empregador/v1_0_0"><consultaIdentificadoresEvts><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador><consultaEvtsTabela><tpEvt>${p.tpEvt}</tpEvt>${chvEvento}<dtIni>${dtIni}</dtIni><dtFim>${dtFim}</dtFim></consultaEvtsTabela></consultaIdentificadoresEvts></eSocial>`;
}

export async function consultarTabelaEsocial(
  p: ConsultarTabelaParams
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

  const soapEnvelope = montarEnvelopeSoap(consultaXml, "Tabela");

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_CONSULTA_IDS[p.ambiente],
      SOAP_ACTIONS.Tabela,
      soapEnvelope,
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRetornoConsulta(respostaXml, p.ambiente);
}

// eSocial — ConsultarIdentificadoresEventosTrabalhador
//
// Operação: lista eventos PERIÓDICOS relativos a um trabalhador específico.
// Filtros: perApur (YYYY-MM) + cpfTrab (CPF do trabalhador).
//
// Tipos cobertos: S-1200 (remunerações), S-1202 (RPPS), S-1207 (benefícios
// RPPS), S-1210 (pagamentos), S-1260 (aquisição produção rural pessoa
// física), S-1270 (contratação de avulsos não portuários), S-1280
// (contribuições convenções coletivas), S-1295 (totalização para
// recolhimento), S-2299 (desligamento — também listável em NaoPeriodicos),
// S-2399 (TSV término).

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

export type TipoEventoTrabalhador =
  | "S-1200"
  | "S-1202"
  | "S-1207"
  | "S-1210"
  | "S-1260"
  | "S-1270"
  | "S-1280"
  | "S-1295"
  | "S-2299"
  | "S-2399";

export type ConsultarTrabalhadorParams = {
  pfxBuffer: Buffer;
  senha: string;
  cnpjEmpregador: string;
  ambiente: AmbienteEsocial;
  tpEvt: TipoEventoTrabalhador;
  cpfTrab: string;       // só dígitos (11)
  perApur?: string;      // YYYY-MM
};

function montarConsultaXml(p: ConsultarTrabalhadorParams): string {
  const raiz8 = p.cnpjEmpregador.replace(/\D/g, "").slice(0, 8);
  const cpf = p.cpfTrab.replace(/\D/g, "");
  const perApur = p.perApur ?? competenciaAtual();
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/empregador/v1_0_0"><consultaIdentificadoresEvts><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz8}</nrInsc></ideEmpregador><consultaEvtsTrabalhador><cpfTrab>${cpf}</cpfTrab><tpEvt>${p.tpEvt}</tpEvt><perApur>${perApur}</perApur></consultaEvtsTrabalhador></consultaIdentificadoresEvts></eSocial>`;
}

export async function consultarTrabalhadorEsocial(
  p: ConsultarTrabalhadorParams
): Promise<RetornoConsultaOk | RetornoConsultaErro> {
  // Validações de input
  const cpfLimpo = p.cpfTrab.replace(/\D/g, "");
  if (cpfLimpo.length !== 11) {
    return {
      ok: false,
      erro: `CPF deve ter 11 dígitos (recebido ${cpfLimpo.length}).`,
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

  const soapEnvelope = montarEnvelopeSoap(consultaXml, "Trabalhador");

  let respostaXml: string;
  try {
    respostaXml = await enviarSoapMTLS(
      ENDPOINT_CONSULTA_IDS[p.ambiente],
      SOAP_ACTIONS.Trabalhador,
      soapEnvelope,
      privateKeyPem,
      certPem
    );
  } catch (e) {
    return { ok: false, erro: `Conexão eSocial: ${(e as Error).message}` };
  }

  return parseRetornoConsulta(respostaXml, p.ambiente);
}

// eSocial S-1000 — Informações do Empregador / Contribuinte / Órgão Público
//
// Evento de TABELA (não-periódico). Identifica o empregador no eSocial.
// Geralmente enviado uma vez (inclusão), depois alterações conforme mudam
// dados cadastrais.
//
// Esta versão cobre apenas a operação INCLUSÃO — alteração e exclusão
// ficam pra versão futura.
//
// Schema: evtInfoEmpregador v_S_01_03_00 (versão S-1.3)

import { assinarESocial } from "../_shared";

export type ContatoS1000 = {
  nmCtt: string;          // Nome do contato
  cpfCtt: string;         // CPF (11 dígitos)
  foneFixo?: string;
  foneCel?: string;
  email?: string;
};

export type S1000IncParams = {
  // Ambiente afeta tag <tpAmb>
  ambiente: 1 | 2;
  // Identificação do software emissor (procEmi=1 e verProc do nosso sistema)
  verProc: string;        // Versão do nosso sistema, ex: "PainelContabil-1.0"
  // Empregador
  cnpjCompleto: string;   // 14 dígitos (será reduzido pra raiz 8 no XML)
  // Início de validade do registro (YYYY-MM)
  iniValid: string;
  // Cadastro
  nmRazao: string;
  classTrib: string;      // ex: "00" (empresa em geral)
  natJurid: string;       // ex: "2062" (Soc Empresária Ltda)
  indCoop?: "0" | "1" | "2" | "3" | "4" | "5";
  indConstr?: "0" | "1" | "2";
  indDesFolha?: "0" | "1";
  indOptRegEletron?: "0" | "1";
  indEntEd?: "S" | "N";
  indEtt?: "S" | "N";
  nrRegEtt?: string;      // Só se indEtt = S
  dtRegEtt?: string;      // Só se indEtt = S (YYYY-MM-DD)
  contato: ContatoS1000;
};

const NS_EVT_S1000 =
  "http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00";

function dhEventoOrdinal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

// ID do evento: "ID" + tpInsc(1) + nrInsc(14) + dhEvento(14) + seq(5) = 36 chars
// tpInsc=1 fixo (CNPJ)
function gerarIdEvento(cnpj14: string, sequencial = 1): string {
  const dh = dhEventoOrdinal();
  const seq = String(sequencial).padStart(5, "0");
  return `ID1${cnpj14.padStart(14, "0")}${dh}${seq}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Monta XML do evento S-1000 (inclusão) SEM assinatura.
// Retorna { id, xml } pra o caller poder rastrear o ID.
export function montarS1000Inclusao(p: S1000IncParams): {
  id: string;
  xml: string;
} {
  const cnpj14 = p.cnpjCompleto.replace(/\D/g, "").padStart(14, "0");
  const raiz8 = cnpj14.slice(0, 8);
  const id = gerarIdEvento(cnpj14);

  const c = p.contato;
  const indCoop = p.indCoop ?? "0";
  const indConstr = p.indConstr ?? "0";
  const indDesFolha = p.indDesFolha ?? "0";
  const indOptRegEletron = p.indOptRegEletron ?? "0";
  const indEntEd = p.indEntEd ?? "N";
  const indEtt = p.indEtt ?? "N";

  // Bloco ETT (Empresa de Trabalho Temporário) só aparece se indEtt=S
  const blocoEtt =
    indEtt === "S" && p.nrRegEtt && p.dtRegEtt
      ? `<nrRegEtt>${escapeXml(p.nrRegEtt)}</nrRegEtt><dtRegEtt>${p.dtRegEtt}</dtRegEtt>`
      : "";

  // Bloco contato (foneFixo, foneCel, email são opcionais)
  const partesContato = [
    `<nmCtt>${escapeXml(c.nmCtt)}</nmCtt>`,
    `<cpfCtt>${c.cpfCtt.replace(/\D/g, "")}</cpfCtt>`,
  ];
  if (c.foneFixo) {
    partesContato.push(`<foneFixo>${c.foneFixo.replace(/\D/g, "")}</foneFixo>`);
  }
  if (c.foneCel) {
    partesContato.push(`<foneCel>${c.foneCel.replace(/\D/g, "")}</foneCel>`);
  }
  if (c.email) {
    partesContato.push(`<email>${escapeXml(c.email)}</email>`);
  }
  const blocoContato = `<contato>${partesContato.join("")}</contato>`;

  const xml =
    `<eSocial xmlns="${NS_EVT_S1000}">` +
    `<evtInfoEmpregador Id="${id}">` +
    `<ideEvento>` +
    `<tpAmb>${p.ambiente}</tpAmb>` +
    `<procEmi>1</procEmi>` +
    `<verProc>${escapeXml(p.verProc)}</verProc>` +
    `</ideEvento>` +
    `<ideEmpregador>` +
    `<tpInsc>1</tpInsc>` +
    `<nrInsc>${raiz8}</nrInsc>` +
    `</ideEmpregador>` +
    `<infoEmpregador>` +
    `<inclusao>` +
    `<idePeriodo>` +
    `<iniValid>${p.iniValid}</iniValid>` +
    `</idePeriodo>` +
    `<infoCadastro>` +
    `<nmRazao>${escapeXml(p.nmRazao)}</nmRazao>` +
    `<classTrib>${p.classTrib}</classTrib>` +
    `<natJurid>${p.natJurid}</natJurid>` +
    `<indCoop>${indCoop}</indCoop>` +
    `<indConstr>${indConstr}</indConstr>` +
    `<indDesFolha>${indDesFolha}</indDesFolha>` +
    `<indOptRegEletron>${indOptRegEletron}</indOptRegEletron>` +
    `<indEntEd>${indEntEd}</indEntEd>` +
    `<indEtt>${indEtt}</indEtt>` +
    blocoEtt +
    blocoContato +
    `</infoCadastro>` +
    `</inclusao>` +
    `</infoEmpregador>` +
    `</evtInfoEmpregador>` +
    `</eSocial>`;

  return { id, xml };
}

// Helper que monta + assina em um passo só (caso típico).
// Retorna { id, xmlAssinado } pronto pra ser passado em eventosAssinadosXml.
export function montarS1000InclusaoAssinado(
  p: S1000IncParams,
  privateKeyPem: string,
  certPem: string
): { id: string; xmlOriginal: string; xmlAssinado: string } {
  const { id, xml } = montarS1000Inclusao(p);
  const xmlAssinado = assinarESocial(xml, privateKeyPem, certPem);
  return { id, xmlOriginal: xml, xmlAssinado };
}

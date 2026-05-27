// Parser de OFX 1.x e 2.x (SGML/XML) — extrai transações bancárias.
//
// Cobre os formatos exportados pelos principais bancos brasileiros
// (BB, Bradesco, Itaú, Caixa, Santander, Inter, Nubank, etc).
//
// Não é validador estrito de OFX — é tolerante: usa regex pra pegar
// só as tags que importam.

export type OfxTransacao = {
  fitid: string;          // ID único do banco (pra dedupe futuro)
  data: string;           // YYYY-MM-DD
  valor: number;          // signed: positivo = crédito, negativo = débito
  descricao: string;
  tipo: string;           // CREDIT, DEBIT, etc (do banco)
  ref?: string;           // CHECKNUM ou REFNUM se houver
};

export type OfxExtrato = {
  banco?: string;
  agencia?: string;
  conta?: string;
  transacoes: OfxTransacao[];
};

export function isOfx(texto: string): boolean {
  const t = texto.trimStart().slice(0, 200).toUpperCase();
  return t.startsWith("OFXHEADER") || t.includes("<OFX>") || t.includes("<?XML");
}

function extractTag(bloco: string, tag: string): string | undefined {
  // OFX 1.x (SGML): <TAG>valor (sem fechamento) ou <TAG>valor</TAG>
  // OFX 2.x (XML):  <TAG>valor</TAG>
  // Tenta primeiro com fechamento, depois sem
  const reFechada = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m1 = bloco.match(reFechada);
  if (m1) return m1[1].trim();
  // SGML sem fechamento — captura até a próxima tag ou quebra
  const reAberta = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m2 = bloco.match(reAberta);
  if (m2) return m2[1].trim();
  return undefined;
}

function parseDataOfx(s: string): string | null {
  // Formato OFX: YYYYMMDD ou YYYYMMDDHHMMSS ou YYYYMMDDHHMMSS.XXX[TZ]
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseOfx(texto: string): OfxExtrato {
  // Header do OFX 1.x: vem antes de <OFX>. Remove pra simplificar.
  const idxOfx = texto.search(/<OFX>/i);
  const corpo = idxOfx > 0 ? texto.slice(idxOfx) : texto;

  // Metadados do banco
  const banco = extractTag(corpo, "BANKID");
  const agencia = extractTag(corpo, "BRANCHID");
  const conta = extractTag(corpo, "ACCTID");

  // Captura todos os blocos <STMTTRN>...</STMTTRN>
  const transacoes: OfxTransacao[] = [];
  const reTrn = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  while ((match = reTrn.exec(corpo)) !== null) {
    const bloco = match[1];
    const tipo = extractTag(bloco, "TRNTYPE") ?? "";
    const dataRaw = extractTag(bloco, "DTPOSTED") ?? "";
    const valorRaw = extractTag(bloco, "TRNAMT") ?? "";
    const descricao =
      extractTag(bloco, "MEMO") ??
      extractTag(bloco, "NAME") ??
      "(sem descrição)";
    const fitid = extractTag(bloco, "FITID") ?? "";
    const ref = extractTag(bloco, "CHECKNUM") ?? extractTag(bloco, "REFNUM");

    const data = parseDataOfx(dataRaw);
    const valor = Number(valorRaw.replace(",", "."));
    if (!data || !isFinite(valor) || valor === 0) continue;

    transacoes.push({
      fitid,
      data,
      valor,
      descricao: descricao.replace(/\s+/g, " ").trim(),
      tipo,
      ref,
    });
  }

  return { banco, agencia, conta, transacoes };
}

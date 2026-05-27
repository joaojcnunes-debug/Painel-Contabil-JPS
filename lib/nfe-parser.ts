// Parser de NF-e (XML SEFAZ) — layout 4.0.
//
// Cobre o XML padrão emitido por qualquer emissor (NF-e modelo 55).
// Tolerante a variações: aceita <nfeProc>, <NFe> ou <enviNFe> como raiz,
// e prefixos de namespace opcionais.
//
// NÃO faz validação XSD nem assinatura digital. Foco em extrair os dados
// que importam pro lançamento contábil: emit, dest, totais e itens.

export type NfeItem = {
  numero: number;
  codigo: string;          // cProd
  descricao: string;       // xProd
  ncm: string;             // NCM
  cfop: string;            // CFOP
  unidade: string;         // uCom
  quantidade: number;      // qCom
  valorUnitario: number;   // vUnCom
  valorTotal: number;      // vProd
};

export type NfeParsed = {
  chave: string;                 // 44 dígitos
  numero: string;                // nNF
  serie: string;                 // serie
  dataEmissao: string | null;    // YYYY-MM-DD
  naturezaOperacao: string;      // natOp
  modelo: string;                // 55 (NF-e) ou 65 (NFC-e)
  // Emitente
  emit: {
    cnpj: string;
    nome: string;
    uf: string;
  };
  // Destinatário
  dest: {
    documento: string;           // CNPJ ou CPF
    tipoDoc: "CNPJ" | "CPF" | "UNKNOWN";
    nome: string;
  };
  // Totais
  totais: {
    vProd: number;
    vDesc: number;
    vFrete: number;
    vICMS: number;
    vIPI: number;
    vPIS: number;
    vCOFINS: number;
    vNF: number;
  };
  itens: NfeItem[];
};

export type NfeParseError = {
  arquivo: string;
  erro: string;
};

export function isXmlNfe(texto: string): boolean {
  const t = texto.trimStart().slice(0, 500).toUpperCase();
  return (
    (t.startsWith("<?XML") || t.includes("<NFE") || t.includes("<NFEPROC")) &&
    (t.includes("<INFNFE") || t.includes("<INFNFCE"))
  );
}

// Remove namespace prefix (ex: <ns:cProd> → <cProd>) e tudo dentro de
// <protNFe> (que confunde os matches dos campos da NF original)
function normalizar(xml: string): string {
  // Remove prefixos de namespace tipo <ns:cProd>
  let limpo = xml.replace(/<([a-zA-Z0-9]+):/g, "<");
  limpo = limpo.replace(/<\/([a-zA-Z0-9]+):/g, "</");
  return limpo;
}

function extractTag(bloco: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : undefined;
}

function extractAttr(bloco: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, "i");
  const m = bloco.match(re);
  return m ? m[1] : undefined;
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(",", "."));
  return isFinite(n) ? n : 0;
}

function parseDataDhEmi(s: string | undefined): string | null {
  if (!s) return null;
  // dhEmi formato: 2025-01-15T10:30:00-03:00
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseNfe(xml: string): NfeParsed | null {
  if (!isXmlNfe(xml)) return null;

  const limpo = normalizar(xml);

  // Pega o bloco <infNFe> (ignora protNFe que vem depois)
  const infMatch = limpo.match(/<infNFe[^>]*>([\s\S]*?)<\/infNFe>/i);
  if (!infMatch) return null;
  const inf = infMatch[1];

  // Chave: vem como atributo Id="NFe..." em infNFe
  const idAttr =
    extractAttr(limpo, "infNFe", "Id") ?? extractAttr(limpo, "infNFCe", "Id");
  const chave = idAttr ? idAttr.replace(/^NFe?/i, "") : "";

  // ─── ide
  const ideBlocoMatch = inf.match(/<ide>([\s\S]*?)<\/ide>/i);
  const ide = ideBlocoMatch?.[1] ?? "";
  const numero = extractTag(ide, "nNF") ?? "";
  const serie = extractTag(ide, "serie") ?? "";
  const dhEmi = extractTag(ide, "dhEmi") ?? extractTag(ide, "dEmi");
  const dataEmissao = parseDataDhEmi(dhEmi);
  const naturezaOperacao = extractTag(ide, "natOp") ?? "";
  const modelo = extractTag(ide, "mod") ?? "";

  // ─── emit
  const emitMatch = inf.match(/<emit>([\s\S]*?)<\/emit>/i);
  const emitBloco = emitMatch?.[1] ?? "";
  const emitCnpj = extractTag(emitBloco, "CNPJ") ?? extractTag(emitBloco, "CPF") ?? "";
  const emitNome = extractTag(emitBloco, "xNome") ?? "";
  const emitUf =
    extractTag(emitBloco, "UF") ??
    (() => {
      const ender = emitBloco.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/i);
      return ender ? extractTag(ender[1], "UF") ?? "" : "";
    })();

  // ─── dest
  const destMatch = inf.match(/<dest>([\s\S]*?)<\/dest>/i);
  const destBloco = destMatch?.[1] ?? "";
  const destCnpj = extractTag(destBloco, "CNPJ");
  const destCpf = extractTag(destBloco, "CPF");
  const destDoc = destCnpj ?? destCpf ?? "";
  const destTipo: "CNPJ" | "CPF" | "UNKNOWN" = destCnpj
    ? "CNPJ"
    : destCpf
    ? "CPF"
    : "UNKNOWN";
  const destNome = extractTag(destBloco, "xNome") ?? "";

  // ─── itens (<det nItem="N">)
  const itens: NfeItem[] = [];
  const reDet = /<det[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/gi;
  let match: RegExpExecArray | null;
  while ((match = reDet.exec(inf)) !== null) {
    const nItem = Number(match[1]);
    const detInner = match[2];
    const prodMatch = detInner.match(/<prod>([\s\S]*?)<\/prod>/i);
    if (!prodMatch) continue;
    const prod = prodMatch[1];
    itens.push({
      numero: nItem,
      codigo: extractTag(prod, "cProd") ?? "",
      descricao: extractTag(prod, "xProd") ?? "",
      ncm: extractTag(prod, "NCM") ?? "",
      cfop: extractTag(prod, "CFOP") ?? "",
      unidade: extractTag(prod, "uCom") ?? "",
      quantidade: num(extractTag(prod, "qCom")),
      valorUnitario: num(extractTag(prod, "vUnCom")),
      valorTotal: num(extractTag(prod, "vProd")),
    });
  }

  // ─── totais (<total><ICMSTot>)
  const totMatch = inf.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/i);
  const tot = totMatch?.[1] ?? "";
  const totais = {
    vProd: num(extractTag(tot, "vProd")),
    vDesc: num(extractTag(tot, "vDesc")),
    vFrete: num(extractTag(tot, "vFrete")),
    vICMS: num(extractTag(tot, "vICMS")),
    vIPI: num(extractTag(tot, "vIPI")),
    vPIS: num(extractTag(tot, "vPIS")),
    vCOFINS: num(extractTag(tot, "vCOFINS")),
    vNF: num(extractTag(tot, "vNF")),
  };

  return {
    chave,
    numero,
    serie,
    dataEmissao,
    naturezaOperacao,
    modelo,
    emit: { cnpj: emitCnpj, nome: emitNome, uf: emitUf },
    dest: { documento: destDoc, tipoDoc: destTipo, nome: destNome },
    totais,
    itens,
  };
}

// Helper: decide tipo (ENTRADA/SAIDA) baseado no CNPJ do cliente
export function detectarTipo(
  nfe: NfeParsed,
  cnpjCliente: string | null
): "ENTRADA" | "SAIDA" {
  if (!cnpjCliente) return "ENTRADA";
  const c = cnpjCliente.replace(/\D/g, "");
  if (nfe.emit.cnpj.replace(/\D/g, "") === c) return "SAIDA";
  return "ENTRADA";
}

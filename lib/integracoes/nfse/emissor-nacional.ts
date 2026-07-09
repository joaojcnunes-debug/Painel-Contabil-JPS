// NFSe Emissor Nacional — API REST oficial (jun/2026)
//
// Endpoints:
// - ADN (distribuição/listagem):
//   https://adn.nfse.gov.br/contribuinte/nfse?ultimoNSU=N       (prod)
//   https://adn.producaorestrita.nfse.gov.br/contribuinte/nfse  (homol)
// - SefinNacional (baixar XML por chave):
//   https://sefin.nfse.gov.br/SefinNacional/nfse/{chave}          (prod)
//   https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse (homol)
//
// Auth: mTLS puro com cert A1 (e-CNPJ). SEM OAuth gov.br pra API.
// CNPJ do cert = ator (prestador, tomador ou intermediário) das NFSe
// que serão listadas. Sigilo fiscal é aplicado no servidor.
//
// Padrões:
// - Cursor por NSU (igual SEFAZ DFe)
// - XML vem gzip+base64 dentro de JSON (campo nfseXmlGZipB64)
// - Rate limits não documentados publicamente
//
// Refs:
// - Manual APIs ADN v1.2 (out/2025)
// - Swagger contribuintes: https://www.nfse.gov.br/swagger/contribuintesissqn/

import forge from "node-forge";
import { gunzipSync } from "zlib";

export type AmbienteNfse = 1 | 2; // 1=Produção, 2=Produção Restrita

// Endpoint ADN — tanto pra distribuição por NSU quanto pra baixar NFSe
// individual por chave. SefinNacional (que apareceu em pesquisa antiga)
// é rota diferente pra outras operações.
const ENDPOINT_ADN: Record<AmbienteNfse, string> = {
  1: "https://adn.nfse.gov.br",
  2: "https://adn.producaorestrita.nfse.gov.br",
};

// Extrai key + cert do PFX (mesma técnica do SEFAZ/eSocial)
function extrairKeyECert(
  pfxBuffer: Buffer,
  senha: string
): { privateKeyPem: string; certPem: string } {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no .pfx");
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no .pfx");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}

// Client HTTPS genérico com mTLS + parse JSON
async function requestJsonMTLS<T>(opts: {
  endpoint: string;
  method: "GET" | "POST";
  path: string;
  privateKeyPem: string;
  certPem: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: T | string }> {
  const https = await import("node:https");
  const url = new URL(opts.path, opts.endpoint);

  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      cert: opts.certPem,
      key: opts.privateKeyPem,
      rejectUnauthorized: true,
    });
    const req = https.request(
      {
        host: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: opts.method,
        agent,
        headers: {
          Accept: "application/json",
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
          ...(opts.body
            ? { "Content-Length": Buffer.byteLength(opts.body, "utf-8") }
            : {}),
          ...(opts.headers ?? {}),
        },
        timeout: opts.timeoutMs ?? 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let parsed: unknown = raw;
          if (
            res.headers["content-type"]?.includes("application/json") &&
            raw.trim()
          ) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              /* mantém raw */
            }
          }
          resolve({ status: res.statusCode ?? 0, body: parsed as T | string });
        });
      }
    );
    req.on("error", (e) => reject(e));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout (${(opts.timeoutMs ?? 30000) / 1000}s)`));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ─── Listar NFSe via ADN por NSU ────────────────────────────

export type ListarNfseParams = {
  pfxBuffer: Buffer;
  senha: string;
  ambiente: AmbienteNfse;
  ultimoNsu?: string; // se omitido, começa em "0"
};

export type NfseDoc = {
  chave: string;              // chave nacional (~50 chars)
  nsu: string;
  papel: "PRESTADOR" | "TOMADOR" | "INTERMEDIARIO";
  xml: string;                // XML já descomprimido (utf-8)
  // Metadata extraída do XML (best-effort)
  numero?: string;
  serie?: string;
  dhEmissao?: string;
  prestadorCnpj?: string;
  prestadorNome?: string;
  tomadorCnpj?: string;
  tomadorNome?: string;
  valorServicos?: number;
  valorIss?: number;
  aliquotaIss?: number;
  valorLiquido?: number;
  codigoServico?: string;
  discriminacao?: string;
  status?: "AUTORIZADA" | "CANCELADA" | "SUBSTITUIDA";
};

export type ListarNfseOk = {
  ok: true;
  ambiente: AmbienteNfse;
  ultimoNsuConsultado: string;
  proximoNsu: string;         // pra continuar paginando
  maxNsu?: string;
  documentos: NfseDoc[];
  temMais: boolean;            // true se documentos.length === maxBatch
};

export type ListarNfseErro = {
  ok: false;
  status?: number;
  erro: string;
  raw?: string;
};

export async function listarNfsePorNsu(
  p: ListarNfseParams
): Promise<ListarNfseOk | ListarNfseErro> {
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

  const ultimoNsu = p.ultimoNsu ?? "0";

  // Path CORRETO (validado no swagger contribuintes ISSQN, jun/2026):
  // GET /contribuintes/DFe/{NSU}?tipoNSU=DISTRIBUICAO&lote=true
  // - "contribuintes" plural (não singular)
  // - "DFe" (não "nfse") — rota compartilha padrão DF-e
  // - NSU no PATH parameter, não em query
  // - tipoNSU=DISTRIBUICAO obrigatório
  // - lote=true traz várias notas em uma chamada
  let res: { status: number; body: unknown };
  try {
    res = await requestJsonMTLS<unknown>({
      endpoint: ENDPOINT_ADN[p.ambiente],
      method: "GET",
      path: `/contribuintes/DFe/${encodeURIComponent(ultimoNsu)}?tipoNSU=DISTRIBUICAO&lote=true`,
      privateKeyPem,
      certPem,
    });
  } catch (e) {
    return { ok: false, erro: `Conexão ADN NFSe: ${(e as Error).message}` };
  }

  if (res.status !== 200) {
    const rawStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
    return {
      ok: false,
      status: res.status,
      erro: `ADN retornou HTTP ${res.status}: ${rawStr.slice(0, 400)}`,
      raw: rawStr.slice(0, 1500),
    };
  }

  // Parser tolerante — a estrutura da resposta pode variar entre versões.
  // Suporta formatos:
  // (a) v1.2 antiga: { loteDistNfse: { docsZip: [{ nsu, chaveAcesso, tipo, nfseXmlGZipB64 }] } }
  // (b) v1.2 atual (?lote=true): { ultimoNSU, maxNSU, LoteDFe: [{ NSU, chNFSe, tipo, arqNFSe }] }
  // (c) documento único: { NSU, chNFSe, arqNFSe, tipo } (sem wrapper)
  const body = res.body as {
    ultimoNSU?: string;
    maxNSU?: string;
    loteDistNfse?: {
      docsZip?: Array<{
        nsu?: string;
        NSU?: string;
        chaveAcesso?: string;
        chNFSe?: string;
        tipo?: string;
        nfseXmlGZipB64?: string;
        arqNFSe?: string;
      }>;
    };
    LoteDFe?: Array<{
      nsu?: string;
      NSU?: string;
      chaveAcesso?: string;
      chNFSe?: string;
      tipo?: string;
      nfseXmlGZipB64?: string;
      arqNFSe?: string;
    }>;
    // Documento único (sem wrapper)
    NSU?: string;
    chNFSe?: string;
    arqNFSe?: string;
    tipo?: string;
  };

  // Tenta cada formato possível
  let docsZip: Array<{
    nsu?: string;
    NSU?: string;
    chaveAcesso?: string;
    chNFSe?: string;
    tipo?: string;
    nfseXmlGZipB64?: string;
    arqNFSe?: string;
  }> = [];
  if (body.loteDistNfse?.docsZip) {
    docsZip = body.loteDistNfse.docsZip;
  } else if (Array.isArray(body.LoteDFe)) {
    docsZip = body.LoteDFe;
  } else if (body.arqNFSe || body.chNFSe) {
    docsZip = [body];
  }
  const documentos: NfseDoc[] = [];
  for (const d of docsZip) {
    try {
      // Aceita ambas as convenções de nomeação (v1.2 antiga e atual)
      const b64 = d.nfseXmlGZipB64 ?? d.arqNFSe;
      const chave = d.chaveAcesso ?? d.chNFSe;
      const nsu = d.nsu ?? d.NSU ?? "";
      if (!b64 || !chave) continue;
      const gzipped = Buffer.from(b64, "base64");
      const xml = gunzipSync(gzipped).toString("utf-8");
      const papel = (d.tipo?.toUpperCase() as NfseDoc["papel"]) ?? "PRESTADOR";
      const meta = extrairResumoNfse(xml);
      documentos.push({
        chave,
        nsu,
        papel,
        xml,
        ...meta,
      });
    } catch {
      // pula doc corrompido
    }
  }

  const proximoNsu = body.ultimoNSU ?? ultimoNsu;
  const temMais =
    documentos.length >= 50 || // ADN retorna até 50 por chamada
    (body.maxNSU != null && body.maxNSU > proximoNsu);

  return {
    ok: true,
    ambiente: p.ambiente,
    ultimoNsuConsultado: ultimoNsu,
    proximoNsu,
    maxNsu: body.maxNSU,
    documentos,
    temMais,
  };
}

// ─── Baixar XML por chave (SefinNacional) ────────────────────

export type BaixarNfseParams = {
  pfxBuffer: Buffer;
  senha: string;
  ambiente: AmbienteNfse;
  chave: string;
};

export type BaixarNfseOk = {
  ok: true;
  chave: string;
  xml: string;
};

export type BaixarNfseErro = {
  ok: false;
  status?: number;
  erro: string;
};

export async function baixarNfsePorChave(
  p: BaixarNfseParams
): Promise<BaixarNfseOk | BaixarNfseErro> {
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

  // Path CORRETO validado: /contribuintes/NFSe/{chave}
  let res: { status: number; body: unknown };
  try {
    res = await requestJsonMTLS<unknown>({
      endpoint: ENDPOINT_ADN[p.ambiente],  // ADN, não SefinNacional
      method: "GET",
      path: `/contribuintes/NFSe/${encodeURIComponent(p.chave)}`,
      privateKeyPem,
      certPem,
    });
  } catch (e) {
    return { ok: false, erro: `Conexão ADN NFSe: ${(e as Error).message}` };
  }

  if (res.status !== 200) {
    const rawStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
    return {
      ok: false,
      status: res.status,
      erro: `SefinNacional retornou HTTP ${res.status}: ${rawStr.slice(0, 400)}`,
    };
  }

  const body = res.body as { nfseXmlGZipB64?: string; arqNFSe?: string };
  const b64 = body.nfseXmlGZipB64 ?? body.arqNFSe;
  if (!b64) {
    return {
      ok: false,
      erro: "Resposta sem XML (nfseXmlGZipB64 nem arqNFSe)",
    };
  }

  try {
    const gzipped = Buffer.from(b64, "base64");
    const xml = gunzipSync(gzipped).toString("utf-8");
    return { ok: true, chave: p.chave, xml };
  } catch (e) {
    return { ok: false, erro: `Falha ao descomprimir XML: ${(e as Error).message}` };
  }
}

// ─── Parse leve de metadata do XML NFSe ─────────────────────

function extrairResumoNfse(xml: string): Partial<NfseDoc> {
  // Layout unificado do Emissor Nacional (NFSePadraoNacional).
  // Elementos comuns (tags variam levemente entre versões):
  const get = (tag: string): string | undefined => {
    const m = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]+)<`));
    return m ? m[1].trim() : undefined;
  };
  const getNum = (tag: string): number | undefined => {
    const v = get(tag);
    return v && !isNaN(Number(v)) ? Number(v) : undefined;
  };

  // Status: nota tem <infNFSe> (autorizada), <substituicaoNFSe> ou <cancNFSe>
  let status: NfseDoc["status"] = "AUTORIZADA";
  if (/<cancNFSe/i.test(xml)) status = "CANCELADA";
  else if (/<substituicaoNFSe/i.test(xml)) status = "SUBSTITUIDA";

  return {
    numero: get("nNFSe") ?? get("numero"),
    serie: get("serie"),
    dhEmissao: get("dhEmi") ?? get("dhProc"),
    prestadorCnpj: extrairCnpjDentro(xml, "emit") ?? extrairCnpjDentro(xml, "prest"),
    prestadorNome: extrairNomeDentro(xml, "emit") ?? extrairNomeDentro(xml, "prest"),
    tomadorCnpj: extrairCnpjDentro(xml, "toma") ?? extrairCnpjDentro(xml, "dest"),
    tomadorNome: extrairNomeDentro(xml, "toma") ?? extrairNomeDentro(xml, "dest"),
    valorServicos: getNum("vServPrest") ?? getNum("valorServicos") ?? getNum("vServ"),
    valorIss: getNum("vISS") ?? getNum("valorIss"),
    aliquotaIss: getNum("pAliq") ?? getNum("aliquota"),
    valorLiquido: getNum("vLiq") ?? getNum("valorLiquido"),
    codigoServico: get("cServ") ?? get("codServ"),
    discriminacao: get("xDescServ") ?? get("discriminacao"),
    status,
  };
}

function extrairCnpjDentro(xml: string, tagBase: string): string | undefined {
  // Busca CNPJ dentro do bloco <tagBase>...</tagBase>
  const bloco = xml.match(new RegExp(`<[^>]*${tagBase}[^>]*>([\\s\\S]*?)</[^>]*${tagBase}[^>]*>`, "i"));
  if (!bloco) return undefined;
  const cnpj = bloco[1].match(/<[^>]*CNPJ[^>]*>(\d{14})<\/[^>]*CNPJ[^>]*>/i);
  return cnpj ? cnpj[1] : undefined;
}

function extrairNomeDentro(xml: string, tagBase: string): string | undefined {
  const bloco = xml.match(new RegExp(`<[^>]*${tagBase}[^>]*>([\\s\\S]*?)</[^>]*${tagBase}[^>]*>`, "i"));
  if (!bloco) return undefined;
  const nome = bloco[1].match(/<[^>]*x?Nome[^>]*>([^<]+)</i) ??
               bloco[1].match(/<[^>]*x?Razao[^>]*>([^<]+)</i);
  return nome ? nome[1].trim() : undefined;
}

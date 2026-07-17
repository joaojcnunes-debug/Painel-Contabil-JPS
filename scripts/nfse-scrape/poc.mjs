// POC: baixa NFSe emitidas do portal nfse.gov.br pra 1 cliente hardcoded
// (SCHEIDT REIS) + baixa XML autenticado de cada nota. Salva tudo em output/.
//
// Descoberta na 1a execução: o portal já expõe download direto de XML na
// mesma sessão em /EmissorNacional/Notas/Download/NFSe/{CHAVE}. Não precisa
// chamar a SefinNacional depois.
//
// Uso:
//   1) salve o PFX em certs/scheidt-reis.pfx (bucket → CRT-B4BD4FCF/…pfx)
//   2) node poc.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractCert } from "./lib/extract-cert.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PFX_PATH = path.join(__dirname, "certs", "scheidt-reis.pfx");
const SENHA = "123456";
const OUTPUT_DIR = path.join(__dirname, "output");
const XML_DIR = path.join(OUTPUT_DIR, "xmls");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "scheidt-reis.json");

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  await mkdir(XML_DIR, { recursive: true });

  log(`Lendo PFX: ${PFX_PATH}`);
  const pfxBuffer = await readFile(PFX_PATH);
  const { keyPem, certPem, subjectCN } = extractCert(pfxBuffer, SENHA);
  log(`Cert extraído — titular: ${subjectCN}`);

  log("Lançando Chromium headless…");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    // cert client em AMBOS os hosts — nfse.gov.br pede mTLS pra download
    clientCertificates: [
      {
        origin: "https://certificado.nfse.gov.br",
        cert: Buffer.from(certPem),
        key: Buffer.from(keyPem),
      },
      {
        origin: "https://www.nfse.gov.br",
        cert: Buffer.from(certPem),
        key: Buffer.from(keyPem),
      },
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  log("Login mTLS…");
  const loginResp = await page.goto(
    "https://certificado.nfse.gov.br/EmissorNacional/Certificado",
    { waitUntil: "domcontentloaded" }
  );
  if (loginResp?.status() !== 200 || /Login/i.test(page.url())) {
    throw new Error(`Login falhou: ${loginResp?.status()} ${page.url()}`);
  }
  log(`  logado — ${page.url()}`);

  log("Navegando pra Notas Emitidas (padrão: últimos 30 dias)…");
  await page.goto("https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas", {
    waitUntil: "domcontentloaded",
  });
  await page
    .waitForSelector("table tbody tr", { timeout: 10_000 })
    .catch(() => log("  tabela não carregou — sem notas? seguindo…"));

  // Extrai metadata + chave de cada linha.
  // A chave real (50 dígitos) fica no href de "Visualizar" (/Visualizar/Index/<chave>).
  // data-chave é ID interno codificado, ignoramos.
  const notas = await page.$$eval("table tbody tr", (trs) => {
    return trs.map((tr) => {
      const linkVis = tr.querySelector('a[href*="/Visualizar/Index/"]');
      const chaveMatch = linkVis?.getAttribute("href")?.match(/\/Visualizar\/Index\/(\d+)/);
      const chave = chaveMatch?.[1] ?? null;

      const tds = tr.querySelectorAll("td");
      const data = tds[0]?.textContent?.trim() ?? "";
      const cnpjEl = tds[1]?.querySelector(".cnpj");
      const cnpj_tomador = cnpjEl?.textContent?.trim() ?? "";
      // nome depois do CNPJ (texto após o hífen)
      const bloco = tds[1]?.textContent?.trim().replace(/\s+/g, " ") ?? "";
      const nome_tomador = bloco.split("-").slice(1).join("-").trim();
      const competencia = tds[2]?.textContent?.trim() ?? "";
      const municipio = tds[3]?.textContent?.trim() ?? "";
      const valor = tds[4]?.textContent?.trim() ?? "";
      const statusImg = tds[5]?.querySelector("img");
      const status =
        statusImg?.getAttribute("data-original-title") ??
        statusImg?.getAttribute("title") ??
        "";
      const situacaoRaw = tr.getAttribute("data-situacao") ?? "";

      return { chave, data, cnpj_tomador, nome_tomador, competencia, municipio, valor, status, situacaoRaw };
    });
  });

  log(`Notas encontradas: ${notas.length}`);
  const comChave = notas.filter((n) => n.chave);
  log(`  com chave válida: ${comChave.length}`);

  // Baixa o XML dentro do próprio contexto da PÁGINA (page.evaluate + fetch).
  // Isso garante cookies + antiforgery + fingerprint iguais aos do browser real.
  // Retorna { status, base64 } por chave.
  let ok = 0, falha = 0;
  for (const n of comChave) {
    try {
      const resp = await page.evaluate(async (chave) => {
        const r = await fetch(`/EmissorNacional/Notas/Download/NFSe/${chave}`, {
          method: "GET",
          credentials: "include",
        });
        const ab = await r.arrayBuffer();
        // encode base64 no browser
        const bin = Array.from(new Uint8Array(ab), (b) => String.fromCharCode(b)).join("");
        return { status: r.status, base64: btoa(bin) };
      }, n.chave);

      if (resp.status !== 200) {
        log(`  ✗ ${n.chave.slice(0, 20)}… HTTP ${resp.status}`);
        falha++;
        continue;
      }
      const buf = Buffer.from(resp.base64, "base64");
      await writeFile(path.join(XML_DIR, `${n.chave}.xml`), buf);
      ok++;
    } catch (e) {
      log(`  ✗ ${n.chave.slice(0, 20)}… erro: ${e.message}`);
      falha++;
    }
  }
  log(`Downloads XML: ${ok} OK, ${falha} falhas`);

  const out = {
    executado_em: new Date().toISOString(),
    cliente: subjectCN,
    total_notas: notas.length,
    total_xmls_baixados: ok,
    total_xmls_falha: falha,
    notas,
  };
  await writeFile(OUTPUT_JSON, JSON.stringify(out, null, 2));
  log(`✓ Metadata salva em ${OUTPUT_JSON}`);
  log(`✓ XMLs salvos em ${XML_DIR}`);

  await context.close();
  await browser.close();
}

main().catch(async (e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});

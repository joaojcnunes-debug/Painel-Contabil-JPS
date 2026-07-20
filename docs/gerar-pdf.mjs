// Renderiza docs/painel-contabil.html em PDF via Chromium (Playwright).
// Reusa a instalação do chromium do scripts/nfse-scrape/ pra evitar
// baixar de novo. Executa: node docs/gerar-pdf.mjs

import { chromium } from "../scripts/nfse-scrape/node_modules/playwright/index.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, "painel-contabil.html");
const PDF = path.join(__dirname, "painel-contabil.pdf");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle" });
await page.pdf({
  path: PDF,
  format: "A4",
  margin: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="width:100%;font-size:8px;color:#666;padding:0 18mm;display:flex;justify-content:space-between"><span>Painel Contábil JPS</span><span class="date"></span></div>`,
  footerTemplate: `<div style="width:100%;font-size:8px;color:#666;padding:0 18mm;text-align:center">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
});
console.log("PDF gerado em", PDF);
await browser.close();

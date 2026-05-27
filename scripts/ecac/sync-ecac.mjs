#!/usr/bin/env node
/**
 * sync-ecac.mjs — RPA semi-automático para o e-CAC.
 *
 * Como funciona:
 * 1. Abre o Chromium em modo visível (não-headless)
 * 2. Navega pro e-CAC. Você faz login MANUALMENTE como preferir:
 *    - Via gov.br (CPF+senha, certificado nuvem, banco, QR Code)
 *    - Via certificado A1 instalado no Windows
 * 3. Quando detecta que você entrou (URL muda pra /ecac/), começa o RPA:
 *    - Caixa Postal (mensagens não lidas)
 *    - Situação Fiscal (pendências)
 *    - Tira screenshot de cada tela
 * 4. Salva tudo em ./output/{cnpj}-{timestamp}/
 *
 * Uso:
 *   npm run ecac:sync
 *
 * O perfil do browser é persistido em ./browser-profile/, então a sessão
 * fica logada entre execuções (não precisa logar toda vez).
 *
 * AVISO: a Receita Federal monitora RPA. Não rode em loop, não exceda
 * volumes. Use com bom senso. Termos de uso do e-CAC:
 * https://cav.receita.fazenda.gov.br/autenticacao/login
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "browser-profile");
const OUTPUT_DIR = join(__dirname, "output");

const URL_LOGIN = "https://cav.receita.fazenda.gov.br/autenticacao/login";
// URL "raiz" depois do login — varia, mas começa com /ecac/
const URL_LOGADO_REGEX = /cav\.receita\.fazenda\.gov\.br\/ecac\//;

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function timestampPasta() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    "-" +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0")
  );
}

async function aguardarLogin(page, timeoutMs = 5 * 60 * 1000) {
  log("⏳", "Aguardando você fazer login no e-CAC...");
  log("💡", "Faça login do jeito que preferir (gov.br, cert A1, etc.)");
  log("💡", `Vou detectar automaticamente quando a URL mudar pra /ecac/`);
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const url = page.url();
    if (URL_LOGADO_REGEX.test(url)) {
      log("✓", `Login detectado! URL: ${url}`);
      return true;
    }
    await page.waitForTimeout(2000);
  }
  log("✗", `Timeout (${timeoutMs / 1000}s) — login não detectado`);
  return false;
}

async function raspar(page, nomeTela, urlOpt, pastaSaida) {
  log("📷", `Raspando: ${nomeTela}`);
  if (urlOpt) {
    try {
      await page.goto(urlOpt, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      log("⚠️", `Falha ao navegar (${nomeTela}): ${e.message}`);
      return;
    }
  }
  // Aguarda render
  await page.waitForTimeout(2000);

  // Screenshot
  const safe = nomeTela.toLowerCase().replace(/\s+/g, "-");
  await page.screenshot({
    path: join(pastaSaida, `${safe}.png`),
    fullPage: true,
  });

  // HTML completo
  const html = await page.content();
  await writeFile(join(pastaSaida, `${safe}.html`), html, "utf-8");

  // Texto visível (sem HTML)
  const texto = await page.evaluate(() => {
    // Pega só o conteúdo principal, ignora menu/footer
    const main =
      document.querySelector("main, #conteudo, .conteudo, body") ||
      document.body;
    return main.innerText;
  });
  await writeFile(join(pastaSaida, `${safe}.txt`), texto, "utf-8");

  log("✓", `Salvo: ${safe}.png + .html + .txt`);
}

async function main() {
  if (!existsSync(PROFILE_DIR)) {
    await mkdir(PROFILE_DIR, { recursive: true });
  }

  log("🚀", "Lançando Chromium (visível, perfil persistente)...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    locale: "pt-BR",
    // Aumenta timeout porque login manual demora
    timeout: 120000,
    // User-Agent humano (não Playwright/HeadlessChrome)
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    log("🌐", `Navegando: ${URL_LOGIN}`);
    await page.goto(URL_LOGIN, { waitUntil: "domcontentloaded" });

    const logado = await aguardarLogin(page);
    if (!logado) {
      log("✗", "Saindo sem fazer scraping.");
      return;
    }

    // Pasta de output desta execução
    const pasta = join(OUTPUT_DIR, timestampPasta());
    await mkdir(pasta, { recursive: true });
    log("📁", `Salvando resultados em: ${pasta}`);

    // ─── Telas a raspar (URLs do e-CAC) ──────────────────────
    // Algumas URLs são "atalhos" diretos; outras precisam navegar pelo menu.
    const telas = [
      {
        nome: "Dashboard e-CAC",
        url: null, // só usa a URL atual (após login)
      },
      {
        nome: "Caixa Postal",
        url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10005",
      },
      {
        nome: "Situacao Fiscal",
        url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10004",
      },
      {
        nome: "DCTFWeb",
        url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10056",
      },
      {
        nome: "PerDComp Web",
        url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10133",
      },
    ];

    for (const tela of telas) {
      await raspar(page, tela.nome, tela.url, pasta);
      // Pausa entre requisições — respeita o limite de 500 req/s da RFB
      // com folga gigante
      await page.waitForTimeout(2000);
    }

    log("✓", "Sincronização concluída.");
    log("📁", `Resultados em: ${pasta}`);
    log("💡", "Browser permanece aberto. Feche manualmente quando terminar.");
    log("💡", "Sessão fica salva — próxima vez você não precisa logar de novo.");
    // Não fecha o context — usuário fecha o browser quando quiser
    // pra inspecionar manualmente o que foi raspado
  } catch (e) {
    log("✗", `Erro: ${e.message}`);
    console.error(e);
    await context.close();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * sync-ecac.mjs — RPA e-CAC com certificado A1 do cliente.
 *
 * Fluxo por cliente:
 * 1. Lista clientes com cert A1 cadastrado (--list)
 * 2. Você escolhe um (--cliente=ID-CLIENTE ou --cliente=substring-da-razao)
 * 3. Pede senha do .pfx (prompt seguro no terminal)
 * 4. Baixa .pfx do bucket Supabase pra ./temp/
 * 5. Importa no Windows certificate store (CurrentUser\My) via PowerShell
 * 6. Abre Chromium → gov.br → opção "Seu certificado digital"
 * 7. Browser pede pra escolher cert — só tem 1 disponível (o importado agora)
 * 8. Após login, raspa telas do e-CAC
 * 9. Cleanup: remove cert do Windows store + apaga .pfx temp
 *
 * Pré-requisitos:
 * - .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * - Windows (usa PowerShell)
 * - npm run dev / build com playwright já instalado
 *
 * Uso:
 *   npm run ecac:list                       # lista clientes disponíveis
 *   npm run ecac:sync -- --cliente=CLI-XXX  # roda pra cliente específico
 *
 * AVISO: a Receita monitora RPA. Não rode em loop. Termos de uso são
 * sua responsabilidade.
 */

import { chromium } from "playwright";
import { mkdir, writeFile, unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "browser-profile");
const TEMP_DIR = join(__dirname, "temp");
const OUTPUT_DIR = join(__dirname, "output");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const URL_LOGIN_ECAC = "https://cav.receita.fazenda.gov.br/autenticacao/login";
const URL_LOGADO_REGEX = /cav\.receita\.fazenda\.gov\.br\/ecac\//;

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { list: false, cliente: null, keepCert: false };
  for (const a of args) {
    if (a === "--list") out.list = true;
    else if (a === "--keep-cert") out.keepCert = true;
    else if (a.startsWith("--cliente=")) out.cliente = a.slice("--cliente=".length);
  }
  return out;
}

function checarEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    log("✗", "Faltam variáveis no .env.local:");
    log(" ", "  NEXT_PUBLIC_SUPABASE_URL");
    log(" ", "  SUPABASE_SERVICE_ROLE_KEY");
    log(" ", "");
    log("💡", "Pegue a SERVICE_ROLE_KEY em:");
    log(" ", "  Dashboard Supabase > Settings > API > 'service_role'");
    log("⚠️", "Essa key tem acesso total ao banco — não comite no Git!");
    process.exit(1);
  }
}

function checarPlatform() {
  if (process.platform !== "win32") {
    log("✗", `Plataforma não suportada: ${process.platform}`);
    log(" ", "Esse script usa PowerShell pra Windows certificate store.");
    log(" ", "No Linux/Mac, o cert precisa ser configurado via NSS database.");
    process.exit(1);
  }
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function listarClientesComCert() {
  // Une certificados_digitais (com arquivo_path) + clientes (razão social)
  const certs = await supabaseGet(
    "certificados_digitais?tipo=eq.A1&arquivo_path=not.is.null&select=id_certificado,arquivo_path,titular_nome,titular_documento,validade_fim,id_cliente"
  );
  // Pra cada cert, busca o cliente (se id_cliente preenchido)
  const out = [];
  for (const c of certs) {
    let razao = "(escritório)";
    if (c.id_cliente) {
      const cli = await supabaseGet(
        `clientes?id_cliente=eq.${c.id_cliente}&select=razao_social,cnpj,cpf`
      );
      if (cli[0]) razao = cli[0].razao_social;
    }
    out.push({
      id_certificado: c.id_certificado,
      id_cliente: c.id_cliente,
      titular_nome: c.titular_nome,
      titular_documento: c.titular_documento,
      validade_fim: c.validade_fim,
      arquivo_path: c.arquivo_path,
      razao_social: razao,
    });
  }
  return out;
}

async function baixarPfx(arquivoPath, destino) {
  const url = `${SUPABASE_URL}/storage/v1/object/certificados-jsp/${arquivoPath}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Storage download: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destino, buf);
  return destino;
}

async function pedirSenha(label = "Senha do certificado") {
  const rl = createInterface({ input, output, terminal: true });
  // No terminal padrão, mostra a digitação. Pra ocultar precisa de truques.
  // Vou só avisar e digitar normal — terminal é local, não tem risco.
  const senha = await rl.question(`🔒 ${label}: `);
  rl.close();
  return senha.trim();
}

function importarCertNoWindows(pfxPath, senha) {
  // Gera script PS num arquivo temp pra evitar problemas de escape
  const psPath = join(TEMP_DIR, "import-cert.ps1");
  const script = `
$ErrorActionPreference = 'Stop'
$pwd = ConvertTo-SecureString -String @'
${senha}
'@ -AsPlainText -Force
$cert = Import-PfxCertificate -FilePath '${pfxPath.replace(/'/g, "''")}' -CertStoreLocation Cert:\\CurrentUser\\My -Password $pwd
Write-Output $cert.Thumbprint
`;
  // BOM-less UTF-8 (ASCII pra senha não ter problema)
  // PowerShell prefere UTF-8 BOM, mas pra script ASCII simples sem BOM funciona
  spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `Set-Content -LiteralPath '${psPath}' -Value @'
${script}
'@ -Encoding UTF8`,
  ]);
  const res = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psPath,
    ],
    { encoding: "utf-8" }
  );
  if (res.status !== 0) {
    throw new Error(
      `PowerShell falhou:\nSTDERR: ${res.stderr}\nSTDOUT: ${res.stdout}`
    );
  }
  const thumbprint = res.stdout.trim().split(/\s+/).pop();
  if (!thumbprint || !/^[A-F0-9]{40}$/i.test(thumbprint)) {
    throw new Error(`Thumbprint inválido recebido: ${thumbprint}`);
  }
  return thumbprint;
}

function removerCertDoWindows(thumbprint) {
  const res = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Remove-Item -LiteralPath 'Cert:\\CurrentUser\\My\\${thumbprint}' -Force`,
    ],
    { encoding: "utf-8" }
  );
  if (res.status !== 0) {
    log("⚠️", `Falha ao remover cert (thumb ${thumbprint}): ${res.stderr}`);
    log(" ", "Remova manualmente: certmgr.msc → Pessoal → Certificados");
  } else {
    log("✓", "Certificado removido do Windows store");
  }
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
  log("⏳", "Aguardando login...");
  log("💡", "No browser: clique em 'Seu certificado digital'");
  log("💡", "O Windows vai pedir pra escolher o cert (só vai ter 1: o do cliente)");
  log("💡", "Confirme. URL muda pra /ecac/ → continuo automaticamente");
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const url = page.url();
    if (URL_LOGADO_REGEX.test(url)) {
      log("✓", `Login OK: ${url}`);
      return true;
    }
    await page.waitForTimeout(2000);
  }
  log("✗", `Timeout (${timeoutMs / 1000}s)`);
  return false;
}

async function raspar(page, nomeTela, urlOpt, pastaSaida) {
  log("📷", `Raspando: ${nomeTela}`);
  if (urlOpt) {
    try {
      await page.goto(urlOpt, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      log("⚠️", `Falha (${nomeTela}): ${e.message}`);
      return;
    }
  }
  await page.waitForTimeout(2000);
  const safe = nomeTela.toLowerCase().replace(/\s+/g, "-");
  try {
    await page.screenshot({
      path: join(pastaSaida, `${safe}.png`),
      fullPage: true,
    });
    const html = await page.content();
    await writeFile(join(pastaSaida, `${safe}.html`), html, "utf-8");
    const texto = await page.evaluate(() => {
      const main =
        document.querySelector("main, #conteudo, .conteudo, body") ||
        document.body;
      return main.innerText;
    });
    await writeFile(join(pastaSaida, `${safe}.txt`), texto, "utf-8");
    log("✓", `${safe}.png + .html + .txt`);
  } catch (e) {
    log("⚠️", `Erro salvando ${safe}: ${e.message}`);
  }
}

async function main() {
  checarEnv();
  checarPlatform();
  await mkdir(TEMP_DIR, { recursive: true });

  const args = parseArgs();

  // ─── Listar ──────────────────────────────────────────────
  if (args.list || !args.cliente) {
    log("📋", "Buscando clientes com certificado A1 disponível...");
    const lista = await listarClientesComCert();
    if (lista.length === 0) {
      log("✗", "Nenhum cliente com cert A1 + arquivo cadastrado.");
      log("💡", "Cadastre em: /integracoes/certificados");
      process.exit(1);
    }
    console.log("");
    console.log(
      "ID-CERT".padEnd(16) +
        "TITULAR".padEnd(35) +
        "EMPRESA".padEnd(35) +
        "VALIDADE"
    );
    console.log("-".repeat(100));
    for (const c of lista) {
      console.log(
        (c.id_certificado || "").padEnd(16) +
          (c.titular_nome || "").slice(0, 33).padEnd(35) +
          (c.razao_social || "").slice(0, 33).padEnd(35) +
          (c.validade_fim || "")
      );
    }
    console.log("");
    console.log("Pra rodar pra um cliente:");
    console.log(`  npm run ecac:sync -- --cliente=ID-CERT`);
    console.log(`  (use o ID-CERT da primeira coluna)`);
    return;
  }

  // ─── Sync de um cliente específico ────────────────────────
  log("🔍", `Buscando cert: ${args.cliente}`);
  const lista = await listarClientesComCert();
  const cert =
    lista.find((c) => c.id_certificado === args.cliente) ||
    lista.find((c) =>
      c.razao_social.toLowerCase().includes(args.cliente.toLowerCase())
    );
  if (!cert) {
    log("✗", `Não encontrei cert com ID/nome: ${args.cliente}`);
    log("💡", "Rode 'npm run ecac:list' pra ver os disponíveis");
    process.exit(1);
  }

  log("✓", `${cert.titular_nome} — ${cert.razao_social}`);
  log(" ", `Validade: ${cert.validade_fim}`);

  // Pede senha
  const senha = await pedirSenha();
  if (!senha) {
    log("✗", "Senha vazia, abortando");
    process.exit(1);
  }

  // Baixa .pfx
  const pfxPath = join(TEMP_DIR, `${cert.id_certificado}.pfx`);
  log("⬇️", "Baixando .pfx do bucket privado...");
  await baixarPfx(cert.arquivo_path, pfxPath);

  // Importa no Windows
  log("📥", "Importando no Windows certificate store...");
  let thumbprint;
  try {
    thumbprint = importarCertNoWindows(pfxPath, senha);
    log("✓", `Thumbprint: ${thumbprint}`);
  } catch (e) {
    log("✗", `Falha import: ${e.message}`);
    log(" ", "Possíveis causas: senha errada, PowerShell sem permissão");
    await unlink(pfxPath).catch(() => {});
    process.exit(1);
  }

  let context;
  try {
    if (!existsSync(PROFILE_DIR)) {
      await mkdir(PROFILE_DIR, { recursive: true });
    }

    log("🚀", "Lançando Chromium...");
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    log("🌐", `Abrindo ${URL_LOGIN_ECAC}`);
    await page.goto(URL_LOGIN_ECAC, { waitUntil: "domcontentloaded" });

    const ok = await aguardarLogin(page);
    if (!ok) {
      log("✗", "Login falhou. Saindo.");
      return;
    }

    const pasta = join(OUTPUT_DIR, `${cert.id_cliente || "escritorio"}-${timestampPasta()}`);
    await mkdir(pasta, { recursive: true });
    log("📁", `Saída: ${pasta}`);

    const telas = [
      { nome: "Dashboard e-CAC", url: null },
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

    for (const t of telas) {
      await raspar(page, t.nome, t.url, pasta);
      await page.waitForTimeout(2000);
    }

    log("✓", "Sincronização concluída.");
    log("📁", `Resultados: ${pasta}`);
    log("💡", "Browser permanece aberto pra você inspecionar. Feche quando terminar.");
  } catch (e) {
    log("✗", `Erro: ${e.message}`);
    console.error(e);
  } finally {
    // Cleanup garantido
    log("🧹", "Limpando...");
    if (!args.keepCert && thumbprint) {
      removerCertDoWindows(thumbprint);
    } else if (args.keepCert) {
      log("⚠️", "Cert mantido no Windows (--keep-cert)");
    }
    await unlink(pfxPath).catch(() => {});
    log("✓", "Cleanup OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

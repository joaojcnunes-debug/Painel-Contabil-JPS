// Scrape diário do portal nfse.gov.br pra TODOS os clientes ativos com A1.
// Salva METADATA das NFSe emitidas em nfse_recebidas (origem="portal_scrape").
// XMLs ficam de fora por causa do captcha do portal — baixar sob demanda depois.
//
// Env obrigatórios (definidos em .env.local pra rodar local, ou GH Actions
// Secrets pra cron):
//   NEXT_PUBLIC_SUPABASE_URL     = URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY    = service role (server-side only)
//   CERT_SENHA_MASTER_KEY        = base64 32B pra decriptar senha do PFX

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { createDecipheriv } from "node:crypto";
import { extractCert } from "./lib/extract-cert.mjs";

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER_KEY_B64 = process.env.CERT_SENHA_MASTER_KEY;
if (!NEXT_PUBLIC_SUPABASE_URL || !SERVICE_ROLE || !MASTER_KEY_B64) {
  console.error("env faltando: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CERT_SENHA_MASTER_KEY");
  process.exit(1);
}
const MASTER_KEY = Buffer.from(MASTER_KEY_B64, "base64");
if (MASTER_KEY.length !== 32) {
  console.error("CERT_SENHA_MASTER_KEY tem que ser 32 bytes (base64)");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(cliente, msg) {
  const prefix = `[${new Date().toISOString().slice(11, 19)}]${cliente ? ` [${cliente}]` : ""}`;
  console.log(`${prefix} ${msg}`);
}

// bytea vem do PostgREST/supabase-js como:
// - Buffer (quando lib faz o decode)
// - string base64 (quando serializado JSON puro)
// - string "\\xdeadbeef" (formato hex Postgres, common quando resource_representation)
function decodeBytea(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v == null) throw new Error("bytea nulo");
  if (typeof v === "string") {
    if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
    // heurística: hex puro (só 0-9a-f, comprimento par)
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return Buffer.from(v, "hex");
    return Buffer.from(v, "base64");
  }
  // { type: 'Buffer', data: [...] }
  if (v && Array.isArray(v.data)) return Buffer.from(v.data);
  throw new Error(`bytea formato inesperado: ${typeof v}`);
}

function decriptarSenha(encVal, ivVal) {
  const enc = decodeBytea(encVal);
  const iv = decodeBytea(ivVal);
  const ct = enc.subarray(0, enc.length - 16);
  const tag = enc.subarray(enc.length - 16);
  const d = createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

function parseValorBR(str) {
  // "2.500,00" → 2500
  if (!str) return null;
  const num = Number(str.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function parseDataBR(str) {
  // "17/07/2026" → "2026-07-17"
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(str ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function listarClientesComCert() {
  const { data, error } = await supabase
    .from("clientes")
    .select(`
      id_cliente, razao_social, cnpj,
      certificados_digitais!inner(
        id_certificado, arquivo_path, titular_documento,
        senha_encriptada, senha_iv, validade_fim
      )
    `)
    .eq("status", "Ativo")
    .eq("certificados_digitais.tipo", "A1")
    .not("certificados_digitais.senha_encriptada", "is", null)
    .not("certificados_digitais.arquivo_path", "is", null);
  if (error) throw new Error(`Listar clientes: ${error.message}`);
  // Um cliente pode ter vários certs — escolho o que bate por CNPJ (matriz).
  return (data ?? []).map((c) => {
    const cnpjLimpo = (c.cnpj ?? "").replace(/\D/g, "");
    const certs = c.certificados_digitais ?? [];
    const cert =
      certs.find((cd) => cd.titular_documento === cnpjLimpo) ?? certs[0];
    return { ...c, cert };
  });
}

async function baixarCert(cert) {
  const { data, error } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (error || !data) throw new Error(`Download cert: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function scrapeCliente(cliente) {
  const nome = cliente.razao_social;
  const cert = cliente.cert;
  if (!cert.senha_encriptada || !cert.senha_iv) {
    log(nome, "⚠ sem senha encriptada — pulando");
    return { ok: false, motivo: "sem_senha" };
  }
  const pfxBuffer = await baixarCert(cert);
  const senha = decriptarSenha(cert.senha_encriptada, cert.senha_iv);
  const { keyPem, certPem, subjectCN } = extractCert(pfxBuffer, senha);
  log(nome, `cert OK: ${subjectCN}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    clientCertificates: [
      { origin: "https://certificado.nfse.gov.br", cert: Buffer.from(certPem), key: Buffer.from(keyPem) },
      { origin: "https://www.nfse.gov.br",         cert: Buffer.from(certPem), key: Buffer.from(keyPem) },
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  try {
    log(nome, "login mTLS…");
    const loginResp = await page.goto("https://certificado.nfse.gov.br/EmissorNacional/Certificado", { waitUntil: "domcontentloaded" });
    if (loginResp?.status() !== 200 || /Login/i.test(page.url())) {
      log(nome, `✗ login falhou HTTP ${loginResp?.status()}`);
      return { ok: false, motivo: "login_falhou" };
    }

    log(nome, "navegando pra Notas Emitidas…");
    await page.goto("https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table tbody tr", { timeout: 10_000 }).catch(() => {});

    // Paginação: enquanto tiver botão "próximo" habilitado, avança.
    // A tela mostra "Total de 24 registros" em algum canto — poderíamos
    // parar por lá, mas iterar até esgotar o botão é robusto.
    const todasNotas = [];
    let pagina = 1;
    while (true) {
      log(nome, `  extraindo página ${pagina}…`);
      const daPagina = await page.$$eval("table tbody tr", (trs) =>
        trs.map((tr) => {
          const linkVis = tr.querySelector('a[href*="/Visualizar/Index/"]');
          const m = linkVis?.getAttribute("href")?.match(/\/Visualizar\/Index\/(\d+)/);
          const chave = m?.[1] ?? null;
          const tds = tr.querySelectorAll("td");
          const cnpjEl = tds[1]?.querySelector(".cnpj");
          const bloco = tds[1]?.textContent?.trim().replace(/\s+/g, " ") ?? "";
          return {
            chave,
            data: tds[0]?.textContent?.trim() ?? "",
            cnpj_tomador: cnpjEl?.textContent?.trim() ?? "",
            nome_tomador: bloco.split("-").slice(1).join("-").trim(),
            competencia: tds[2]?.textContent?.trim() ?? "",
            municipio: tds[3]?.textContent?.trim() ?? "",
            valor: tds[4]?.textContent?.trim() ?? "",
            situacao_raw: tr.getAttribute("data-situacao") ?? "",
          };
        }).filter((n) => n.chave)
      );
      todasNotas.push(...daPagina);

      // Próxima página?
      const proximo = await page.$('a[href*="Emitidas?"]:has-text("»"), .pagination a:has-text("»")');
      const proximoDisabled = proximo && (await proximo.evaluate((el) =>
        el.classList.contains("disabled") || el.parentElement?.classList.contains("disabled")
      ));
      if (!proximo || proximoDisabled) break;
      await proximo.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("table tbody tr", { timeout: 10_000 }).catch(() => {});
      pagina++;
      if (pagina > 20) { log(nome, "⚠ >20 páginas, parando por segurança"); break; }
    }

    log(nome, `total ${todasNotas.length} notas capturadas`);
    return { ok: true, notas: todasNotas };
  } finally {
    await context.close();
    await browser.close();
  }
}

function statusFromSituacaoRaw(raw) {
  if (!raw) return null;
  if (/CANCEL/i.test(raw)) return "CANCELADA";
  if (/SUBSTITU/i.test(raw)) return "SUBSTITUIDA";
  return "AUTORIZADA";
}

async function persistir(cliente, notas) {
  const idCliente = cliente.id_cliente;
  const linhas = notas.map((n) => ({
    chave: n.chave,
    id_cliente: idCliente,
    ambiente: 1,
    nsu: "portal_scrape",
    papel: "PRESTADOR",
    origem: "portal_scrape",
    dh_emissao: parseDataBR(n.data),
    status: statusFromSituacaoRaw(n.situacao_raw),
    prestador_cnpj: (cliente.cnpj ?? "").replace(/\D/g, ""),
    prestador_nome: cliente.razao_social,
    tomador_cnpj: n.cnpj_tomador?.replace(/\D/g, "") || null,
    tomador_nome: n.nome_tomador || null,
    valor_servicos: parseValorBR(n.valor),
    xml_path: null,
    updated_at: new Date().toISOString(),
  }));

  const { error, count } = await supabase
    .from("nfse_recebidas")
    .upsert(linhas, { onConflict: "chave", ignoreDuplicates: false, count: "exact" });
  if (error) throw new Error(`Upsert nfse_recebidas: ${error.message}`);
  return count ?? linhas.length;
}

async function main() {
  log(null, "=== NFSe scrape iniciando ===");
  const clientes = await listarClientesComCert();
  log(null, `clientes com A1+senha encriptada: ${clientes.length}`);

  const sumario = { ok: 0, falha: 0, total_notas: 0 };
  for (const c of clientes) {
    try {
      const r = await scrapeCliente(c);
      if (!r.ok) {
        sumario.falha++;
        await supabase.from("integracoes_logs").insert({
          id_log: `LOG-${Date.now()}`,
          id_cliente: c.id_cliente,
          modulo: "PREFEITURAS",
          acao: "nfse_scrape",
          modo: "REAL",
          usuario_email: "cron@sistema",
          status: "ERRO",
          request_resumo: `scrape portal emitidas`,
          erro_codigo: "SCRAPE_ERROR",
          erro_mensagem: r.motivo,
        });
        continue;
      }
      const salvos = await persistir(c, r.notas);
      sumario.ok++;
      sumario.total_notas += r.notas.length;
      log(c.razao_social, `✓ ${salvos} linhas upsertadas`);
      await supabase.from("integracoes_logs").insert({
        id_log: `LOG-${Date.now()}`,
        id_cliente: c.id_cliente,
        modulo: "PREFEITURAS",
        acao: "nfse_scrape",
        modo: "REAL",
        usuario_email: "cron@sistema",
        status: "OK",
        request_resumo: `scrape portal emitidas`,
        response_resumo: { total_notas: r.notas.length, salvos },
      });
    } catch (e) {
      sumario.falha++;
      log(c.razao_social, `✗ erro: ${e.message}`);
      await supabase.from("integracoes_logs").insert({
        id_log: `LOG-${Date.now()}`,
        id_cliente: c.id_cliente,
        modulo: "PREFEITURAS",
        acao: "nfse_scrape",
        modo: "REAL",
        usuario_email: "cron@sistema",
        status: "ERRO",
        request_resumo: `scrape portal emitidas`,
        erro_codigo: "SCRAPE_EXCEPTION",
        erro_mensagem: e.message,
      });
    }
  }
  log(null, `=== fim: ${sumario.ok} OK, ${sumario.falha} falha, ${sumario.total_notas} notas totais ===`);
}

main().catch((e) => { console.error("[FATAL]", e); process.exit(1); });

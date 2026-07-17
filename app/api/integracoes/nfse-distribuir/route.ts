// API Route: NFSe — Distribuir via API ADN do Emissor Nacional.
//
// POST { id_cliente, ambiente, senha, reset_nsu?, max_paginas? }
//
// Fluxo:
// 1. Auth + carrega cert A1 do bucket
// 2. Lê cursor NSU atual (ou 0 se reset_nsu)
// 3. Loop: chama listarNfsePorNsu, faz upload de XMLs pro bucket
//    nfse-xmls, upsert em nfse_recebidas. Para quando temMais=false ou
//    atingir max_paginas (default 10 = até 500 documentos por chamada)
// 4. Atualiza cursor nfse_nsu
// 5. Retorna { total_baixado, ultimo_nsu, paginas }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  listarNfsePorNsu,
  type AmbienteNfse,
  type NfseDoc,
} from "@/lib/integracoes/nfse/emissor-nacional";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
// Vercel Hobby: 60s. Setar 60 pra garantir espaço pra várias páginas.
export const maxDuration = 60;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  reset_nsu?: boolean;
  max_paginas?: number;
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { data: perfilData } = await supabase
    .from("usuarios")
    .select("perfil")
    .eq("email", user.email)
    .single();
  const perfil = (perfilData as { perfil?: string } | null)?.perfil;
  if (perfil === "Cliente") {
    return NextResponse.json({ ok: false, erro: "Apenas equipe" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const { id_cliente, ambiente, senha, reset_nsu } = body;
  const maxPaginas = Math.min(Math.max(body.max_paginas ?? 10, 1), 50);
  if (!id_cliente || !senha || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, ambiente (1|2), senha" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteNfse;

  // Cliente + CNPJ (só pra escolher cert)
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj")
    .eq("id_cliente", id_cliente)
    .single();
  const cnpjLimpo = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "")
    .replace(/\D/g, "");
  if (cnpjLimpo.length !== 14 || /^0+$/.test(cnpjLimpo)) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ válido" },
      { status: 400 }
    );
  }

  // Cert A1 (mesma lógica das outras integrações)
  const { data: certs } = await supabase
    .from("certificados_digitais")
    .select("arquivo_path, titular_documento")
    .or(`id_cliente.eq.${id_cliente},id_cliente.is.null`)
    .eq("tipo", "A1")
    .not("arquivo_path", "is", null)
    .order("validade_fim", { ascending: false, nullsFirst: false });
  type Cert = { arquivo_path: string; titular_documento: string };
  const certList = (certs ?? []) as unknown as Cert[];
  if (certList.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum certificado A1 cadastrado" },
      { status: 400 }
    );
  }
  const cert =
    certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];

  const { data: pfxBlob, error: blobErr } = await supabase.storage
    .from("certificados-jsp")
    .download(cert.arquivo_path);
  if (blobErr || !pfxBlob) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao baixar cert: ${blobErr?.message}` },
      { status: 500 }
    );
  }
  const pfxBuffer = Buffer.from(await pfxBlob.arrayBuffer());

  // NSU inicial
  let ultimoNsu = "0";
  if (!reset_nsu) {
    const { data: nsuData } = await supabase
      .from("nfse_nsu")
      .select("ultimo_nsu")
      .eq("id_cliente", id_cliente)
      .eq("ambiente", amb)
      .maybeSingle();
    const nsuRow = nsuData as { ultimo_nsu?: string } | null;
    if (nsuRow?.ultimo_nsu) ultimoNsu = nsuRow.ultimo_nsu;
  }

  // Loop de paginação
  const inicio = Date.now();
  let pagina = 0;
  let totalBaixado = 0;
  let totalSalvos = 0;
  let totalErros = 0;
  let statusFinal = "OK";
  let mensagemErro: string | undefined;
  let maxNsu: string | undefined;

  while (pagina < maxPaginas) {
    // Se estamos próximos do timeout do Vercel (60s), interrompe
    if (Date.now() - inicio > 45000) {
      statusFinal = "TIMEOUT_INTERROMPIDO";
      break;
    }
    pagina++;

    const resultado = await listarNfsePorNsu({
      pfxBuffer,
      senha,
      ambiente: amb,
      ultimoNsu,
      cnpjConsulta: cnpjLimpo,
    });

    if (!resultado.ok) {
      statusFinal = "ERRO";
      mensagemErro = resultado.erro;
      break;
    }

    totalBaixado += resultado.documentos.length;
    if (resultado.maxNsu) maxNsu = resultado.maxNsu;

    // Persiste cada NFSe
    for (const doc of resultado.documentos) {
      try {
        const salvo = await persistirNfse(supabase, id_cliente, amb, doc);
        if (salvo) totalSalvos++;
      } catch {
        totalErros++;
      }
    }

    // Atualiza cursor
    ultimoNsu = resultado.proximoNsu;

    if (!resultado.temMais || resultado.documentos.length === 0) {
      break;
    }
  }

  const duracaoMs = Date.now() - inicio;

  // Persiste NSU (upsert)
  const { data: existente } = await supabase
    .from("nfse_nsu")
    .select("id_nsu, total_baixado")
    .eq("id_cliente", id_cliente)
    .eq("ambiente", amb)
    .maybeSingle();
  const existRow = existente as
    | { id_nsu: string; total_baixado: number }
    | null;

  if (existRow) {
    await supabase
      .from("nfse_nsu")
      .update({
        ultimo_nsu: ultimoNsu,
        max_nsu: maxNsu ?? null,
        ultima_consulta: new Date().toISOString(),
        ultimo_status: statusFinal,
        total_baixado: existRow.total_baixado + totalSalvos,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id_nsu", existRow.id_nsu);
  } else {
    await supabase.from("nfse_nsu").insert({
      id_nsu: gerarId("NSU"),
      id_cliente,
      ambiente: amb,
      ultimo_nsu: ultimoNsu,
      max_nsu: maxNsu ?? null,
      ultima_consulta: new Date().toISOString(),
      ultimo_status: statusFinal,
      total_baixado: totalSalvos,
    } as never);
  }

  // Log
  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "PREFEITURAS",
    acao: "nfse_distribuir",
    modo: "REAL",
    usuario_email: user.email,
    status: statusFinal === "ERRO" ? "ERRO" : "OK",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} nsuInicial=${reset_nsu ? "0 (reset)" : "atual"} maxPag=${maxPaginas}`,
    response_resumo: {
      status_final: statusFinal,
      paginas: pagina,
      total_baixado: totalBaixado,
      total_salvos: totalSalvos,
      total_erros: totalErros,
      ultimo_nsu: ultimoNsu,
      max_nsu: maxNsu,
    },
    erro_codigo: statusFinal === "ERRO" ? "ADN_ERROR" : null,
    erro_mensagem: mensagemErro ?? null,
  } as never);

  return NextResponse.json({
    ok: statusFinal !== "ERRO",
    status_final: statusFinal,
    paginas: pagina,
    total_baixado: totalBaixado,
    total_salvos: totalSalvos,
    total_erros: totalErros,
    ultimo_nsu: ultimoNsu,
    max_nsu: maxNsu,
    duracao_ms: duracaoMs,
    erro: mensagemErro,
  });
}

// Persiste um doc: upload XML pro bucket + upsert em nfse_recebidas.
// Retorna true se persistiu OK, false se falhou em alguma etapa.
async function persistirNfse(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  idCliente: string,
  ambiente: AmbienteNfse,
  doc: NfseDoc
): Promise<boolean> {
  if (!doc.chave) return false;
  const path = `${idCliente}/${ambiente}/${doc.chave}.xml`;

  const { error: upErr } = await supabase.storage
    .from("nfse-xmls")
    .upload(path, doc.xml, {
      contentType: "application/xml",
      upsert: true,
    });
  if (upErr) return false;

  const { error: dbErr } = await supabase
    .from("nfse_recebidas")
    .upsert(
      {
        chave: doc.chave,
        id_cliente: idCliente,
        ambiente,
        nsu: doc.nsu,
        papel: doc.papel,
        numero_nfse: doc.numero ?? null,
        serie: doc.serie ?? null,
        dh_emissao: doc.dhEmissao ?? null,
        status: doc.status ?? "AUTORIZADA",
        prestador_cnpj: doc.prestadorCnpj ?? null,
        prestador_nome: doc.prestadorNome ?? null,
        tomador_cnpj: doc.tomadorCnpj ?? null,
        tomador_nome: doc.tomadorNome ?? null,
        codigo_servico: doc.codigoServico ?? null,
        discriminacao: doc.discriminacao ?? null,
        valor_servicos: doc.valorServicos ?? null,
        valor_iss: doc.valorIss ?? null,
        aliquota_iss: doc.aliquotaIss ?? null,
        valor_liquido: doc.valorLiquido ?? null,
        xml_path: path,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "chave" }
    );
  return !dbErr;
}

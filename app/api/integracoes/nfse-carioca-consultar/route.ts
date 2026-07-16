// API Route: NFSe — Consultar Nota Carioca (webservice ABRASF do RJ).
//
// POST { id_cliente, ambiente, senha, data_inicial, data_final, inscricao_municipal? }
//
// Fluxo:
// 1. Auth + carrega cert A1 do bucket
// 2. Chama consultarNfseCarioca com mTLS
// 3. Persiste XMLs no bucket nfse-xmls (path: cliente/amb/nota-carioca/<chave>.xml)
// 4. Upsert em nfse_recebidas com origem='nota_carioca'
// 5. Retorna { total_baixado, total_salvos, duracao_ms }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  consultarNfseCarioca,
  type AmbienteCarioca,
  type NfseCariocaDoc,
} from "@/lib/integracoes/nfse/nota-carioca";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  data_inicial?: string; // YYYY-MM-DD
  data_final?: string;
  inscricao_municipal?: string;
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
  });

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
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const { id_cliente, ambiente, senha, data_inicial, data_final, inscricao_municipal } = body;
  if (!id_cliente || !senha || !data_inicial || !data_final || (ambiente !== 1 && ambiente !== 2)) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, ambiente (1|2), senha, data_inicial, data_final" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicial) || !/^\d{4}-\d{2}-\d{2}$/.test(data_final)) {
    return NextResponse.json(
      { ok: false, erro: "Datas devem estar em YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteCarioca;

  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj, municipio, estado")
    .eq("id_cliente", id_cliente)
    .single();
  const cliente = clienteData as { cnpj: string; municipio: string; estado: string } | null;
  const cnpjLimpo = (cliente?.cnpj ?? "").replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ válido" },
      { status: 400 }
    );
  }
  if (cliente?.estado !== "RJ") {
    return NextResponse.json(
      {
        ok: false,
        erro: `Cliente é de ${cliente?.estado ?? "?"} — Nota Carioca só atende Rio de Janeiro`,
      },
      { status: 400 }
    );
  }

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
  const cert = certList.find((c) => c.titular_documento === cnpjLimpo) ?? certList[0];

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

  const inicio = Date.now();
  const resultado = await consultarNfseCarioca({
    pfxBuffer,
    senha,
    ambiente: amb,
    cnpjPrestador: cnpjLimpo,
    inscricaoMunicipal: inscricao_municipal,
    dataInicial: data_inicial,
    dataFinal: data_final,
  });

  if (!resultado.ok) {
    await supabase.from("integracoes_logs").insert({
      id_log: gerarId("LOG"),
      id_cliente,
      modulo: "PREFEITURAS",
      acao: "nfse_carioca_consultar",
      modo: "REAL",
      usuario_email: user.email,
      status: "ERRO",
      duracao_ms: Date.now() - inicio,
      request_resumo: `amb=${amb} de=${data_inicial} ate=${data_final}`,
      response_resumo: { status: resultado.status, codigo: resultado.codigo },
      erro_codigo: resultado.codigo ?? "SOAP_ERROR",
      erro_mensagem: resultado.erro,
    } as never);
    return NextResponse.json({ ok: false, erro: resultado.erro, codigo: resultado.codigo });
  }

  // Persiste
  let totalSalvos = 0;
  const erros: string[] = [];
  for (const doc of resultado.documentos) {
    try {
      const salvo = await persistir(supabase, id_cliente, amb, doc);
      if (salvo) totalSalvos++;
    } catch (e) {
      erros.push((e as Error).message);
    }
  }
  const duracaoMs = Date.now() - inicio;

  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "PREFEITURAS",
    acao: "nfse_carioca_consultar",
    modo: "REAL",
    usuario_email: user.email,
    status: "OK",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} de=${data_inicial} ate=${data_final}`,
    response_resumo: {
      total_baixado: resultado.documentos.length,
      total_salvos: totalSalvos,
      total_erros: erros.length,
    },
    erro_codigo: null,
    erro_mensagem: null,
  } as never);

  return NextResponse.json({
    ok: true,
    total_baixado: resultado.documentos.length,
    total_salvos: totalSalvos,
    total_erros: erros.length,
    erros: erros.slice(0, 5),
    duracao_ms: duracaoMs,
  });
}

async function persistir(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  idCliente: string,
  ambiente: AmbienteCarioca,
  doc: NfseCariocaDoc
): Promise<boolean> {
  if (!doc.chave) return false;
  const path = `${idCliente}/${ambiente}/nota-carioca/${doc.chave}.xml`;
  const { error: upErr } = await supabase.storage
    .from("nfse-xmls")
    .upload(path, doc.xml, {
      contentType: "application/xml",
      upsert: true,
    });
  if (upErr) return false;

  const cnpjClienteAqui = doc.prestadorCnpj ?? null;
  const papel = "PRESTADOR";

  const { error: dbErr } = await supabase.from("nfse_recebidas").upsert(
    {
      chave: doc.chave,
      id_cliente: idCliente,
      ambiente,
      nsu: "nota_carioca",
      papel,
      origem: "nota_carioca",
      numero_nfse: doc.numero ?? null,
      serie: doc.serie ?? null,
      dh_emissao: doc.dhEmissao ?? null,
      status: doc.status,
      prestador_cnpj: cnpjClienteAqui,
      prestador_nome: doc.prestadorNome ?? null,
      tomador_cnpj: doc.tomadorDocumento ?? null,
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

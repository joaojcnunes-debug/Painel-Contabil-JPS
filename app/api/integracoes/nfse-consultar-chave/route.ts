// API Route: NFSe — Consultar por chave de acesso (diagnóstico cirúrgico).
//
// POST { id_cliente, ambiente, senha, chave, salvar? }
//
// Uso: quando a distribuição por NSU retorna vazio mas o cliente diz que
// existem NFSe emitidas. Consulta uma chave específica direto na ADN pra
// confirmar se está no repositório nacional ou não.
//
// - Se HTTP 200 → NFSe existe no ADN. Se `salvar=true`, faz upsert
//   em nfse_recebidas e upload do XML no bucket.
// - Se HTTP 404 → NFSe não chegou ao ADN (município ainda não replicou,
//   emissão via portal municipal próprio, ou delay).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  baixarNfsePorChave,
  extrairResumoNfse,
  type AmbienteNfse,
} from "@/lib/integracoes/nfse/emissor-nacional";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  id_cliente?: string;
  ambiente?: 1 | 2;
  senha?: string;
  chave?: string;
  salvar?: boolean;
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
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const { id_cliente, ambiente, senha, salvar } = body;
  const chave = (body.chave ?? "").replace(/\s+/g, "");
  if (
    !id_cliente ||
    !senha ||
    !chave ||
    (ambiente !== 1 && ambiente !== 2)
  ) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, ambiente (1|2), senha, chave" },
      { status: 400 }
    );
  }
  if (chave.length < 40 || chave.length > 60) {
    return NextResponse.json(
      { ok: false, erro: "Chave de acesso inválida (esperado ~50 chars)" },
      { status: 400 }
    );
  }
  const amb = ambiente as AmbienteNfse;

  // Cliente + CNPJ pra escolher cert
  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj")
    .eq("id_cliente", id_cliente)
    .single();
  const cnpjLimpo = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "")
    .replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    return NextResponse.json(
      { ok: false, erro: "Cliente sem CNPJ válido" },
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

  const inicio = Date.now();
  const resultado = await baixarNfsePorChave({
    pfxBuffer,
    senha,
    ambiente: amb,
    chave,
  });
  const duracaoMs = Date.now() - inicio;

  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "PREFEITURAS",
    acao: "nfse_consultar_chave",
    modo: "REAL",
    usuario_email: user.email,
    status: resultado.ok ? "OK" : "ERRO",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${amb} chave=${chave.slice(0, 8)}…${chave.slice(-4)}`,
    response_resumo: resultado.ok
      ? { encontrada: true, chave: resultado.chave }
      : { encontrada: false, status: (resultado as { status?: number }).status },
    erro_codigo: resultado.ok ? null : "ADN_ERROR",
    erro_mensagem: resultado.ok ? null : resultado.erro,
  } as never);

  if (!resultado.ok) {
    const status = (resultado as { status?: number }).status;
    // 404 é diagnóstico útil: chave não está no ADN
    const naoEncontrada = status === 404;
    return NextResponse.json({
      ok: false,
      encontrada: false,
      status,
      erro: resultado.erro,
      duracao_ms: duracaoMs,
      diagnostico: naoEncontrada
        ? "NFSe não está no repositório nacional (ADN). Isso confirma que a emissão foi via portal municipal próprio, ou ainda não replicou (delay pode chegar a 24h)."
        : undefined,
    });
  }

  const meta = extrairResumoNfse(resultado.xml);

  // Salva no bucket + nfse_recebidas se pedido
  let salvouXml = false;
  if (salvar) {
    const path = `${id_cliente}/${amb}/${chave}.xml`;
    const { error: upErr } = await supabase.storage
      .from("nfse-xmls")
      .upload(path, resultado.xml, {
        contentType: "application/xml",
        upsert: true,
      });
    if (!upErr) {
      salvouXml = true;
      const papel =
        meta.prestadorCnpj === cnpjLimpo
          ? "PRESTADOR"
          : meta.tomadorCnpj === cnpjLimpo
            ? "TOMADOR"
            : "INTERMEDIARIO";
      await supabase.from("nfse_recebidas").upsert(
        {
          chave,
          id_cliente,
          ambiente: amb,
          nsu: "consulta-chave",
          papel,
          numero_nfse: meta.numero ?? null,
          serie: meta.serie ?? null,
          dh_emissao: meta.dhEmissao ?? null,
          status: meta.status ?? "AUTORIZADA",
          prestador_cnpj: meta.prestadorCnpj ?? null,
          prestador_nome: meta.prestadorNome ?? null,
          tomador_cnpj: meta.tomadorCnpj ?? null,
          tomador_nome: meta.tomadorNome ?? null,
          codigo_servico: meta.codigoServico ?? null,
          discriminacao: meta.discriminacao ?? null,
          valor_servicos: meta.valorServicos ?? null,
          valor_iss: meta.valorIss ?? null,
          aliquota_iss: meta.aliquotaIss ?? null,
          valor_liquido: meta.valorLiquido ?? null,
          xml_path: path,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "chave" }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    encontrada: true,
    chave,
    duracao_ms: duracaoMs,
    salvou_xml: salvouXml,
    metadata: meta,
    xml_preview: resultado.xml.slice(0, 500),
    xml_size: resultado.xml.length,
  });
}

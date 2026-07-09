// API Route: NFSe — Importação manual de XMLs.
//
// POST { id_cliente, ambiente?, arquivos: [{ nome, xml }] }
//
// Uso: pra clientes que emitem em portais municipais (Nota Carioca, NFSe SP,
// etc) que não têm sincronia com o Emissor Nacional. O usuário exporta os
// XMLs do portal e envia aqui. Faz parse local, extrai metadata, upload
// no bucket nfse-xmls, upsert em nfse_recebidas.
//
// Retorna resumo por arquivo: importado / duplicado / erro.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  extrairChaveNfse,
  extrairResumoNfse,
} from "@/lib/integracoes/nfse/emissor-nacional";
import { gerarId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type ArquivoIn = {
  nome: string;
  xml: string;
};

type ResultadoArquivo = {
  nome: string;
  status: "OK" | "DUPLICADA" | "ERRO";
  chave?: string;
  erro?: string;
  metadata?: {
    numero?: string;
    prestador?: string;
    tomador?: string;
    valor?: number;
  };
};

const MAX_ARQUIVOS = 100;
const MAX_XML_BYTES = 500_000; // 500KB por XML

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

  let body: {
    id_cliente?: string;
    ambiente?: 1 | 2;
    arquivos?: ArquivoIn[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const { id_cliente, arquivos } = body;
  const ambiente: 1 | 2 = body.ambiente === 2 ? 2 : 1;

  if (!id_cliente || !Array.isArray(arquivos) || arquivos.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Parâmetros: id_cliente, arquivos[]" },
      { status: 400 }
    );
  }
  if (arquivos.length > MAX_ARQUIVOS) {
    return NextResponse.json(
      { ok: false, erro: `Máximo ${MAX_ARQUIVOS} arquivos por chamada` },
      { status: 400 }
    );
  }

  const { data: clienteData } = await supabase
    .from("clientes")
    .select("cnpj")
    .eq("id_cliente", id_cliente)
    .single();
  const cnpjCliente = ((clienteData as { cnpj?: string | null } | null)?.cnpj ?? "")
    .replace(/\D/g, "");

  const resultados: ResultadoArquivo[] = [];
  let salvos = 0;
  let duplicadas = 0;
  let erros = 0;

  const inicio = Date.now();

  for (const arq of arquivos) {
    if (!arq?.nome || !arq?.xml) {
      resultados.push({ nome: arq?.nome ?? "?", status: "ERRO", erro: "Payload inválido" });
      erros++;
      continue;
    }
    if (arq.xml.length > MAX_XML_BYTES) {
      resultados.push({ nome: arq.nome, status: "ERRO", erro: "XML maior que 500KB" });
      erros++;
      continue;
    }

    try {
      const chave = extrairChaveNfse(arq.xml);
      if (!chave) {
        resultados.push({
          nome: arq.nome,
          status: "ERRO",
          erro: "Chave da NFSe não encontrada no XML (Id atributo ou <chNFSe>)",
        });
        erros++;
        continue;
      }

      const { data: existente } = await supabase
        .from("nfse_recebidas")
        .select("chave")
        .eq("chave", chave)
        .maybeSingle();
      if (existente) {
        resultados.push({ nome: arq.nome, status: "DUPLICADA", chave });
        duplicadas++;
        continue;
      }

      const meta = extrairResumoNfse(arq.xml);

      // Determina papel comparando CNPJs
      const prestCnpj = (meta.prestadorCnpj ?? "").replace(/\D/g, "");
      const tomCnpj = (meta.tomadorCnpj ?? "").replace(/\D/g, "");
      const papel =
        cnpjCliente && prestCnpj === cnpjCliente
          ? "PRESTADOR"
          : cnpjCliente && tomCnpj === cnpjCliente
            ? "TOMADOR"
            : "PRESTADOR";

      const path = `${id_cliente}/${ambiente}/manual/${chave}.xml`;
      const { error: upErr } = await supabase.storage
        .from("nfse-xmls")
        .upload(path, arq.xml, {
          contentType: "application/xml",
          upsert: true,
        });
      if (upErr) {
        resultados.push({
          nome: arq.nome,
          status: "ERRO",
          erro: `Falha no upload: ${upErr.message}`,
          chave,
        });
        erros++;
        continue;
      }

      const { error: dbErr } = await supabase.from("nfse_recebidas").insert({
        chave,
        id_cliente,
        ambiente,
        nsu: "manual",
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
      } as never);
      if (dbErr) {
        resultados.push({
          nome: arq.nome,
          status: "ERRO",
          erro: `Falha ao gravar: ${dbErr.message}`,
          chave,
        });
        erros++;
        continue;
      }

      resultados.push({
        nome: arq.nome,
        status: "OK",
        chave,
        metadata: {
          numero: meta.numero,
          prestador: meta.prestadorNome,
          tomador: meta.tomadorNome,
          valor: meta.valorServicos,
        },
      });
      salvos++;
    } catch (e) {
      resultados.push({
        nome: arq.nome,
        status: "ERRO",
        erro: (e as Error).message,
      });
      erros++;
    }
  }

  const duracaoMs = Date.now() - inicio;

  await supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_cliente,
    modulo: "PREFEITURAS",
    acao: "nfse_importar_manual",
    modo: "REAL",
    usuario_email: user.email,
    status: erros === arquivos.length ? "ERRO" : "OK",
    duracao_ms: duracaoMs,
    request_resumo: `amb=${ambiente} arquivos=${arquivos.length}`,
    response_resumo: { salvos, duplicadas, erros, total: arquivos.length },
    erro_codigo: null,
    erro_mensagem: null,
  } as never);

  return NextResponse.json({
    ok: true,
    total: arquivos.length,
    salvos,
    duplicadas,
    erros,
    duracao_ms: duracaoMs,
    resultados,
  });
}

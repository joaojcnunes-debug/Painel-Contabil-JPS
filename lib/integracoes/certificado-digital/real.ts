// Conector REAL Certificado Digital — checar_vencimentos
//
// Lê a tabela `certificados_digitais` direto do BD e retorna lista de
// certificados vencendo nos próximos N dias (default 60) ou já vencidos.
// Não precisa de cert externo nem webservice — é só agregação interna.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RespostaIntegracao } from "../core/types";

type CertRow = {
  id_certificado: string;
  titular_nome: string;
  titular_documento: string | null;
  tipo: string;
  validade_fim: string;
  id_cliente: string | null;
};

export async function checarVencimentosCertificados(
  supabase: SupabaseClient,
  idCliente: string | null,
  diasAlerta = 60
): Promise<RespostaIntegracao> {
  const base: RespostaIntegracao = {
    modulo: "CERTIFICADO_DIGITAL",
    acao: "checar_vencimentos",
    modo: "REAL",
    ok: false,
    duracaoMs: 0,
  };

  const limite = new Date();
  limite.setDate(limite.getDate() + diasAlerta);
  const limiteIso = limite.toISOString().slice(0, 10);

  let q = supabase
    .from("certificados_digitais")
    .select(
      "id_certificado, titular_nome, titular_documento, tipo, validade_fim, id_cliente"
    )
    .not("validade_fim", "is", null)
    .lte("validade_fim", limiteIso)
    .order("validade_fim", { ascending: true });

  // Se houver cliente específico, filtra. Senão pega todos (escopo escritório).
  if (idCliente) q = q.eq("id_cliente", idCliente);

  const { data, error } = await q;
  if (error) {
    return {
      ...base,
      erro: { codigo: "DB_ERROR", mensagem: error.message },
    };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const certs = (data ?? []) as CertRow[];

  const itens = certs.map((c) => {
    const venc = new Date(c.validade_fim + "T12:00");
    const dias = Math.ceil(
      (venc.getTime() - new Date(hoje + "T12:00").getTime()) / 86400000
    );
    const vencido = dias < 0;
    return {
      id_certificado: c.id_certificado,
      titular: c.titular_nome,
      documento: c.titular_documento,
      tipo: c.tipo,
      validade: c.validade_fim,
      dias_restantes: dias,
      status: vencido
        ? "VENCIDO"
        : dias <= 7
        ? "CRITICO"
        : dias <= 30
        ? "ATENCAO"
        : "OK",
    };
  });

  const vencidos = itens.filter((i) => i.status === "VENCIDO").length;
  const criticos = itens.filter((i) => i.status === "CRITICO").length;

  const mensagens: string[] = [];
  if (itens.length === 0) {
    mensagens.push(
      `Nenhum certificado A1/A3 vence nos próximos ${diasAlerta} dias. 🎉`
    );
  } else {
    if (vencidos > 0) {
      mensagens.push(
        `⚠️ ${vencidos} certificado(s) VENCIDO(s) — renovar imediatamente.`
      );
    }
    if (criticos > 0) {
      mensagens.push(
        `🚨 ${criticos} certificado(s) vencem em menos de 7 dias.`
      );
    }
    const atencao = itens.length - vencidos - criticos;
    if (atencao > 0) {
      mensagens.push(`${atencao} certificado(s) vencem em até 60 dias.`);
    }
  }

  return {
    ...base,
    ok: true,
    dados: {
      dias_alerta: diasAlerta,
      total: itens.length,
      vencidos,
      criticos,
      itens,
    },
    mensagens,
  };
}

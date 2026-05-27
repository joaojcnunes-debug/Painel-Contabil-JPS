// Logger das integrações — insere em integracoes_logs com sanitização.
//
// Sanitização: mascara CPF, CNPJ completos e padrões de tokens longos
// (Bearer ... / strings hex > 24 chars) no request_resumo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarId } from "@/lib/utils";
import type {
  ModoIntegracao,
  ModuloIntegracao,
  StatusLogIntegracao,
} from "@/lib/supabase/types";

type RegistrarParams = {
  supabase: SupabaseClient;
  idConfig?: string | null;
  idCliente?: string | null;
  modulo: ModuloIntegracao | string;
  acao: string;
  modo: ModoIntegracao;
  usuarioEmail?: string | null;
  usuarioNome?: string | null;
  status: StatusLogIntegracao;
  duracaoMs?: number | null;
  request?: string | Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
  erroCodigo?: string | null;
  erroMensagem?: string | null;
};

// Remove padrões sensíveis do texto antes de gravar
function sanitizar(s: string): string {
  return s
    // CNPJ formatado ou solto
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    // CPF formatado ou solto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    // Bearer token
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [TOKEN]")
    // Sequências longas hexa/base64 (>= 32 chars) — provável segredo
    .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, "[REDACTED]")
    // Senha em JSON-like
    .replace(/"(senha|password|pwd|pin)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
}

function sanitizarObj(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const json = JSON.stringify(obj);
  return JSON.parse(sanitizar(json));
}

export async function registrarLog(p: RegistrarParams): Promise<void> {
  const reqResumo =
    p.request == null
      ? null
      : typeof p.request === "string"
      ? sanitizar(p.request)
      : sanitizar(JSON.stringify(p.request));
  const respResumo = p.response ? sanitizarObj(p.response) : null;

  const { error } = await p.supabase.from("integracoes_logs").insert({
    id_log: gerarId("LOG"),
    id_config: p.idConfig ?? null,
    id_cliente: p.idCliente ?? null,
    modulo: p.modulo,
    acao: p.acao,
    modo: p.modo,
    usuario_email: p.usuarioEmail ?? null,
    usuario_nome: p.usuarioNome ?? null,
    status: p.status,
    duracao_ms: p.duracaoMs ?? null,
    request_resumo: reqResumo,
    response_resumo: respResumo,
    erro_codigo: p.erroCodigo ?? null,
    erro_mensagem: p.erroMensagem ?? null,
  } as never);

  if (error) {
    // Não fazer throw — log falhando não deve quebrar a integração principal
    console.error("[integracoes/logger] falha ao registrar:", error.message);
  }
}

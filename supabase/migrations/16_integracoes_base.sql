-- ============================================================
-- Migration 16 — Integrações governamentais (base)
-- ============================================================
-- Cria 3 tabelas isoladas: certificados + config + logs.
-- NÃO altera nenhuma tabela existente.
-- RLS restrita a equipe (Cliente NÃO acessa integrações).

-- ─── Certificados digitais (metadata apenas) ─────────────────
-- Criada PRIMEIRO porque integracoes_config tem FK pra ela.
CREATE TABLE IF NOT EXISTS public.certificados_digitais (
    id_certificado TEXT PRIMARY KEY,
    id_cliente TEXT REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    -- NULL = certificado do escritório (procuração e-CAC, etc)
    tipo TEXT NOT NULL CHECK (tipo IN (
        'A1', 'A3', 'PROCURACAO_ECAC', 'CONECTIVIDADE_SOCIAL', 'OUTRO'
    )),
    titular_nome TEXT NOT NULL,
    titular_documento TEXT NOT NULL,         -- CNPJ ou CPF
    emissor TEXT,                            -- ex: AC SAFEWEB v5
    validade_inicio DATE,
    validade_fim DATE,
    -- ─── Procuração ────────────────────────────
    procuracao_outorgante TEXT,              -- quem outorgou
    procuracao_outorgado TEXT,               -- quem recebeu (geralmente o escritório)
    procuracao_servicos JSONB,               -- ["DCTFWeb", "PerDComp", ...]
    -- ─── NOTAS ─────────────────────────────────
    -- arquivo_path TEXT — adicionado em migration futura quando
    -- partirmos pra modo REAL com upload em bucket privado.
    -- senha NUNCA armazenada aqui — fica em Edge Function Secret.
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (id_cliente, titular_documento, tipo)
);

CREATE INDEX IF NOT EXISTS idx_cert_cliente ON public.certificados_digitais(id_cliente);
CREATE INDEX IF NOT EXISTS idx_cert_validade ON public.certificados_digitais(validade_fim);

-- ─── Configuração por (empresa, módulo) ─────────────────────
CREATE TABLE IF NOT EXISTS public.integracoes_config (
    id_config TEXT PRIMARY KEY,
    id_cliente TEXT REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    -- NULL = configuração global do escritório
    modulo TEXT NOT NULL CHECK (modulo IN (
        'RECEITA_FEDERAL', 'ESOCIAL', 'EFD_REINF', 'SPED',
        'NOTAS_FISCAIS', 'SIMPLES_NACIONAL', 'FGTS_DIGITAL',
        'PREFEITURAS', 'REDESIM', 'CERTIFICADO_DIGITAL'
    )),
    ativo BOOLEAN NOT NULL DEFAULT false,
    modo TEXT NOT NULL DEFAULT 'SIMULADO'
        CHECK (modo IN ('SIMULADO', 'REAL')),
    -- Credenciais NÃO sensíveis (endpoints, IDs).
    -- Senhas e tokens NUNCA aqui — vão em Edge Function Secret.
    credenciais JSONB,
    id_certificado TEXT REFERENCES public.certificados_digitais(id_certificado) ON DELETE SET NULL,
    -- Última sincronização
    ultima_sync TIMESTAMPTZ,
    proxima_sync TIMESTAMPTZ,
    ultimo_status TEXT CHECK (ultimo_status IN ('OK', 'ERRO', 'PENDENTE')),
    ultimo_retorno JSONB,
    pendencias_count INTEGER NOT NULL DEFAULT 0,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE NULLS NOT DISTINCT (id_cliente, modulo)
);

CREATE INDEX IF NOT EXISTS idx_intconf_cliente ON public.integracoes_config(id_cliente);
CREATE INDEX IF NOT EXISTS idx_intconf_modulo ON public.integracoes_config(modulo);

-- ─── Logs de integração ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integracoes_logs (
    id_log TEXT PRIMARY KEY,
    id_config TEXT REFERENCES public.integracoes_config(id_config) ON DELETE SET NULL,
    id_cliente TEXT REFERENCES public.clientes(id_cliente) ON DELETE SET NULL,
    modulo TEXT NOT NULL,
    acao TEXT NOT NULL,                      -- ex: "consultar_pendencias"
    modo TEXT NOT NULL CHECK (modo IN ('SIMULADO', 'REAL')),
    usuario_email TEXT,
    usuario_nome TEXT,
    status TEXT NOT NULL CHECK (status IN ('OK', 'ERRO')),
    duracao_ms INTEGER,
    request_resumo TEXT,                     -- já sanitizado
    response_resumo JSONB,                   -- já sanitizado
    erro_codigo TEXT,
    erro_mensagem TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intlog_cliente ON public.integracoes_logs(id_cliente);
CREATE INDEX IF NOT EXISTS idx_intlog_modulo ON public.integracoes_logs(modulo);
CREATE INDEX IF NOT EXISTS idx_intlog_data ON public.integracoes_logs(created_at DESC);

-- ─── RLS — restrita a equipe (NÃO permite acesso de Cliente) ─
ALTER TABLE public.certificados_digitais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracoes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracoes_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cert_all ON public.certificados_digitais;
CREATE POLICY cert_all ON public.certificados_digitais FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

DROP POLICY IF EXISTS intconf_all ON public.integracoes_config;
CREATE POLICY intconf_all ON public.integracoes_config FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

DROP POLICY IF EXISTS intlog_all ON public.integracoes_logs;
CREATE POLICY intlog_all ON public.integracoes_logs FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit triggers ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_cert ON public.certificados_digitais;
CREATE TRIGGER trg_audit_cert
    AFTER INSERT OR UPDATE OR DELETE ON public.certificados_digitais
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_certificado');

DROP TRIGGER IF EXISTS trg_audit_intconf ON public.integracoes_config;
CREATE TRIGGER trg_audit_intconf
    AFTER INSERT OR UPDATE OR DELETE ON public.integracoes_config
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_config');
-- integracoes_logs NÃO tem audit (seria recursivo)

-- ============================================================
-- Migration 02 — Configurações do escritório (singleton)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.configuracoes (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    nome_escritorio TEXT NOT NULL DEFAULT 'JSP Contabilidade Personalizada',
    razao_social TEXT,
    cnpj TEXT,
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    site TEXT,
    dia_padrao_fechamento INTEGER NOT NULL DEFAULT 10
        CHECK (dia_padrao_fechamento BETWEEN 1 AND 31),
    logo_url TEXT,
    mensagem_login TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Singleton: insere a linha padrão se ainda não existir
INSERT INTO public.configuracoes (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- RLS — leitura por qualquer autenticado, escrita só Admin
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS config_select ON public.configuracoes;
CREATE POLICY config_select ON public.configuracoes FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS config_update ON public.configuracoes;
CREATE POLICY config_update ON public.configuracoes FOR UPDATE
    USING (public.fn_perfil_atual() = 'Admin')
    WITH CHECK (public.fn_perfil_atual() = 'Admin');

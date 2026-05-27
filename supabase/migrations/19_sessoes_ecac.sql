-- ============================================================
-- Migration 19 — Sessões e-CAC (registro manual estruturado)
-- ============================================================
-- Não é RPA. É registro estruturado de quando o operador acessou
-- o e-CAC do cliente e o que encontrou. Substitui a "papelada solta"
-- por histórico no sistema.

CREATE TABLE IF NOT EXISTS public.sessoes_ecac (
    id_sessao TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    -- Quem acessou
    usuario_email TEXT NOT NULL,
    usuario_nome TEXT,
    -- Quando
    iniciada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizada_em TIMESTAMPTZ,
    duracao_minutos INTEGER,
    -- O que encontrou
    situacao_fiscal TEXT
        CHECK (situacao_fiscal IN ('REGULAR', 'PENDENTE', 'INDETERMINADO', NULL)),
    mensagens_nao_lidas INTEGER,
    -- Lista de pendências encontradas
    -- [{ tipo: "DCTFWeb", competencia: "2026-04", valor: 1234.56, descricao: "..." }, ...]
    pendencias JSONB,
    -- Próximas ações que o usuário definiu
    proximas_acoes TEXT,
    -- Notas livres
    notas TEXT,
    -- Status interno
    status TEXT NOT NULL DEFAULT 'CONCLUIDA'
        CHECK (status IN ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sess_ecac_cliente ON public.sessoes_ecac(id_cliente);
CREATE INDEX IF NOT EXISTS idx_sess_ecac_data ON public.sessoes_ecac(iniciada_em DESC);

ALTER TABLE public.sessoes_ecac ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sess_ecac_all ON public.sessoes_ecac;
CREATE POLICY sess_ecac_all ON public.sessoes_ecac FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

DROP TRIGGER IF EXISTS trg_audit_sess_ecac ON public.sessoes_ecac;
CREATE TRIGGER trg_audit_sess_ecac
    AFTER INSERT OR UPDATE OR DELETE ON public.sessoes_ecac
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_sessao');

NOTIFY pgrst, 'reload schema';

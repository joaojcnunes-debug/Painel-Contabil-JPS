-- ============================================================
-- Migration 08 — Lançamentos recorrentes (modelos)
-- Admin cadastra modelos fixos (aluguel, salários, etc) e o
-- gerador mensal cria os lançamentos automaticamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lancamentos_modelos (
    id_modelo TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    id_conta TEXT NOT NULL REFERENCES public.plano_contas(id_conta),
    tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
    valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
    dia_mes INTEGER NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
    descricao TEXT NOT NULL,
    documento_ref TEXT,
    observacoes TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_modelos_cliente ON public.lancamentos_modelos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_modelos_conta ON public.lancamentos_modelos(id_conta);
CREATE INDEX IF NOT EXISTS idx_modelos_ativo ON public.lancamentos_modelos(ativo);

-- RLS — só equipe; cliente não interage
ALTER TABLE public.lancamentos_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modelos_select ON public.lancamentos_modelos;
CREATE POLICY modelos_select ON public.lancamentos_modelos FOR SELECT
    USING (public.fn_is_equipe());

DROP POLICY IF EXISTS modelos_write ON public.lancamentos_modelos;
CREATE POLICY modelos_write ON public.lancamentos_modelos FOR ALL
    USING (public.fn_is_equipe())
    WITH CHECK (public.fn_is_equipe());

-- Audit trigger
DROP TRIGGER IF EXISTS trg_audit_lancamentos_modelos ON public.lancamentos_modelos;
CREATE TRIGGER trg_audit_lancamentos_modelos
    AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos_modelos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_modelo');

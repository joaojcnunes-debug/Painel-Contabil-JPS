-- ============================================================
-- Migration 09 — Conciliação bancária
-- Importa movimentos do extrato bancário; permite lançar
-- contabilmente, vincular a lançamento existente ou ignorar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.banco_movimentos (
    id_movimento TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    data_movimento DATE NOT NULL,
    descricao TEXT NOT NULL,
    valor NUMERIC(14, 2) NOT NULL,    -- positivo=crédito, negativo=débito
    banco TEXT,
    conta_bancaria TEXT,
    -- Reconciliação
    conciliado BOOLEAN NOT NULL DEFAULT FALSE,
    id_lancamento TEXT REFERENCES public.lancamentos(id_lancamento) ON DELETE SET NULL,
    ignorado BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_ignorado TEXT,
    -- Metadados
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_banco_mov_cliente ON public.banco_movimentos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_banco_mov_data ON public.banco_movimentos(data_movimento DESC);
CREATE INDEX IF NOT EXISTS idx_banco_mov_pendentes
    ON public.banco_movimentos(id_cliente, conciliado, ignorado)
    WHERE conciliado = FALSE AND ignorado = FALSE;

-- RLS: só equipe; cliente não interage com o extrato
ALTER TABLE public.banco_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bancomov_select ON public.banco_movimentos;
CREATE POLICY bancomov_select ON public.banco_movimentos FOR SELECT
    USING (public.fn_is_equipe());

DROP POLICY IF EXISTS bancomov_write ON public.banco_movimentos;
CREATE POLICY bancomov_write ON public.banco_movimentos FOR ALL
    USING (public.fn_is_equipe())
    WITH CHECK (public.fn_is_equipe());

-- Audit
DROP TRIGGER IF EXISTS trg_audit_banco_movimentos ON public.banco_movimentos;
CREATE TRIGGER trg_audit_banco_movimentos
    AFTER INSERT OR UPDATE OR DELETE ON public.banco_movimentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_movimento');

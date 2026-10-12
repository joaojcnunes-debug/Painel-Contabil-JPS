-- ============================================================
-- Migration 35 — Distribuição de lucros aos sócios
-- ============================================================
-- Cada linha é uma retirada de lucro (isenta de IR — art. 10 Lei 9.249/95)
-- de um sócio cadastrado em public.socios. Mês/trimestre/ano saem de
-- data_distribuicao; o painel agrega no cliente.

CREATE TABLE IF NOT EXISTS public.distribuicoes_lucros (
    id_distribuicao TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    id_socio TEXT NOT NULL REFERENCES public.socios(id_socio) ON DELETE RESTRICT,
    -- Snapshot (mantém o histórico mesmo se o sócio for editado)
    nome_socio TEXT NOT NULL,
    cpf_socio TEXT,
    data_distribuicao DATE NOT NULL,
    valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
    forma_pagamento TEXT,                          -- PIX, TED, cheque…
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_distlucro_cliente ON public.distribuicoes_lucros(id_cliente);
CREATE INDEX IF NOT EXISTS idx_distlucro_socio ON public.distribuicoes_lucros(id_socio);
CREATE INDEX IF NOT EXISTS idx_distlucro_data ON public.distribuicoes_lucros(data_distribuicao DESC);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.distribuicoes_lucros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS distlucro_select ON public.distribuicoes_lucros;
CREATE POLICY distlucro_select ON public.distribuicoes_lucros FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());
DROP POLICY IF EXISTS distlucro_write ON public.distribuicoes_lucros;
CREATE POLICY distlucro_write ON public.distribuicoes_lucros FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_distlucro ON public.distribuicoes_lucros;
CREATE TRIGGER trg_audit_distlucro
    AFTER INSERT OR UPDATE OR DELETE ON public.distribuicoes_lucros
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_distribuicao');

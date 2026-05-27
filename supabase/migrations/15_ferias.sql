-- ============================================================
-- Migration 15 — Férias (CLT, Lei 8.213 + arts. 129-153 CLT)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ferias (
    id_ferias TEXT PRIMARY KEY,
    id_funcionario TEXT NOT NULL REFERENCES public.funcionarios(id_funcionario) ON DELETE RESTRICT,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    -- Período aquisitivo (12 meses que deram direito)
    periodo_aquisitivo_inicio DATE NOT NULL,
    periodo_aquisitivo_fim DATE NOT NULL,
    faltas_periodo INTEGER NOT NULL DEFAULT 0,
    dias_direito INTEGER NOT NULL DEFAULT 30
        CHECK (dias_direito IN (0, 12, 18, 24, 30)),
    -- Gozo
    data_inicio_gozo DATE NOT NULL,
    data_fim_gozo DATE NOT NULL,
    dias_gozados INTEGER NOT NULL CHECK (dias_gozados BETWEEN 0 AND 30),
    dias_abono INTEGER NOT NULL DEFAULT 0 CHECK (dias_abono IN (0, 10)),
    -- Snapshot
    nome_func TEXT NOT NULL,
    cargo_func TEXT,
    cpf_func TEXT,
    salario_base NUMERIC(14, 2) NOT NULL,
    media_variaveis NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Cálculos
    valor_ferias NUMERIC(14, 2) NOT NULL,        -- (sb+media) × dias_gozados / 30
    terco_ferias NUMERIC(14, 2) NOT NULL,        -- valor_ferias / 3 (1/3 constitucional)
    valor_abono NUMERIC(14, 2) NOT NULL DEFAULT 0,    -- (sb+media) × dias_abono / 30 (ISENTO)
    terco_abono NUMERIC(14, 2) NOT NULL DEFAULT 0,    -- valor_abono / 3 (ISENTO)
    base_inss NUMERIC(14, 2) NOT NULL,
    inss NUMERIC(14, 2) NOT NULL DEFAULT 0,
    base_irrf NUMERIC(14, 2) NOT NULL,
    irrf NUMERIC(14, 2) NOT NULL DEFAULT 0,
    outros_descontos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_bruto NUMERIC(14, 2) NOT NULL,
    liquido NUMERIC(14, 2) NOT NULL,
    fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,            -- encargo patronal
    data_pagamento DATE,
    status TEXT NOT NULL DEFAULT 'PROGRAMADA'
        CHECK (status IN ('PROGRAMADA', 'EM_GOZO', 'PAGA', 'ENCERRADA')),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ferias_func ON public.ferias(id_funcionario);
CREATE INDEX IF NOT EXISTS idx_ferias_cliente ON public.ferias(id_cliente);
CREATE INDEX IF NOT EXISTS idx_ferias_inicio ON public.ferias(data_inicio_gozo DESC);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.ferias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ferias_select ON public.ferias;
CREATE POLICY ferias_select ON public.ferias FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS ferias_write ON public.ferias;
CREATE POLICY ferias_write ON public.ferias FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_ferias ON public.ferias;
CREATE TRIGGER trg_audit_ferias
    AFTER INSERT OR UPDATE OR DELETE ON public.ferias
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_ferias');

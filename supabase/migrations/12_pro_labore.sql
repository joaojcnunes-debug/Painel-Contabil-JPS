-- ============================================================
-- Migration 12 — Pró-labore dos sócios
-- ============================================================

-- ─── Sócios ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.socios (
    id_socio TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    data_nascimento DATE,
    data_entrada DATE NOT NULL,
    data_saida DATE,
    participacao_pct NUMERIC(5, 2),                -- % do capital social
    pro_labore_mensal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    dependentes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status IN ('ATIVO', 'INATIVO')),
    pix TEXT,
    banco TEXT,
    agencia TEXT,
    conta TEXT,
    email TEXT,
    telefone TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_socio_cliente ON public.socios(id_cliente);
CREATE INDEX IF NOT EXISTS idx_socio_status ON public.socios(status);

-- ─── Pagamentos de Pró-labore ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_labore_pagamentos (
    id_pagamento TEXT PRIMARY KEY,
    id_socio TEXT NOT NULL REFERENCES public.socios(id_socio) ON DELETE RESTRICT,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    competencia TEXT NOT NULL,                     -- YYYY-MM
    -- Snapshot
    nome_socio TEXT NOT NULL,
    cpf_socio TEXT,
    -- Valores
    valor_pro_labore NUMERIC(14, 2) NOT NULL,
    inss NUMERIC(14, 2) NOT NULL DEFAULT 0,        -- 11% (contribuinte individual)
    base_irrf NUMERIC(14, 2) NOT NULL DEFAULT 0,
    irrf NUMERIC(14, 2) NOT NULL DEFAULT 0,
    outros_descontos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    liquido NUMERIC(14, 2) NOT NULL,
    -- Pagamento
    data_pagamento DATE,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (id_socio, competencia)
);

CREATE INDEX IF NOT EXISTS idx_prolab_socio ON public.pro_labore_pagamentos(id_socio);
CREATE INDEX IF NOT EXISTS idx_prolab_cliente ON public.pro_labore_pagamentos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_prolab_competencia ON public.pro_labore_pagamentos(competencia DESC);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_labore_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS socio_select ON public.socios;
CREATE POLICY socio_select ON public.socios FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());
DROP POLICY IF EXISTS socio_write ON public.socios;
CREATE POLICY socio_write ON public.socios FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

DROP POLICY IF EXISTS prolab_select ON public.pro_labore_pagamentos;
CREATE POLICY prolab_select ON public.pro_labore_pagamentos FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());
DROP POLICY IF EXISTS prolab_write ON public.pro_labore_pagamentos;
CREATE POLICY prolab_write ON public.pro_labore_pagamentos FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_socios ON public.socios;
CREATE TRIGGER trg_audit_socios
    AFTER INSERT OR UPDATE OR DELETE ON public.socios
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_socio');

DROP TRIGGER IF EXISTS trg_audit_prolab ON public.pro_labore_pagamentos;
CREATE TRIGGER trg_audit_prolab
    AFTER INSERT OR UPDATE OR DELETE ON public.pro_labore_pagamentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_pagamento');

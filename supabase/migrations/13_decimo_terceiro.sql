-- ============================================================
-- Migration 13 — 13º Salário (Gratificação Natalina)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.decimos_terceiros (
    id_decimo TEXT PRIMARY KEY,
    id_funcionario TEXT NOT NULL REFERENCES public.funcionarios(id_funcionario) ON DELETE RESTRICT,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    ano INTEGER NOT NULL,
    -- Snapshot
    nome_func TEXT NOT NULL,
    cargo_func TEXT,
    cpf_func TEXT,
    salario_base NUMERIC(14, 2) NOT NULL,
    media_variaveis NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- horas extras, comissões, etc
    meses_trabalhados INTEGER NOT NULL CHECK (meses_trabalhados BETWEEN 0 AND 12),
    valor_integral NUMERIC(14, 2) NOT NULL,              -- (salario+media) × meses / 12
    -- 1ª parcela (até 30/nov, sem descontos)
    valor_primeira NUMERIC(14, 2) NOT NULL DEFAULT 0,
    data_primeira DATE,
    -- 2ª parcela (até 20/dez, com INSS e IRRF sobre valor integral)
    base_inss NUMERIC(14, 2) NOT NULL DEFAULT 0,
    inss NUMERIC(14, 2) NOT NULL DEFAULT 0,
    base_irrf NUMERIC(14, 2) NOT NULL DEFAULT 0,
    irrf NUMERIC(14, 2) NOT NULL DEFAULT 0,
    outros_descontos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_segunda NUMERIC(14, 2) NOT NULL DEFAULT 0,
    data_segunda DATE,
    -- Totais
    liquido_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,               -- 8% sobre o integral (encargo)
    status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'PRIMEIRA_PAGA', 'SEGUNDA_PAGA', 'QUITADO')),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (id_funcionario, ano)
);

CREATE INDEX IF NOT EXISTS idx_decimo_func ON public.decimos_terceiros(id_funcionario);
CREATE INDEX IF NOT EXISTS idx_decimo_cliente ON public.decimos_terceiros(id_cliente);
CREATE INDEX IF NOT EXISTS idx_decimo_ano ON public.decimos_terceiros(ano DESC);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.decimos_terceiros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decimo_select ON public.decimos_terceiros;
CREATE POLICY decimo_select ON public.decimos_terceiros FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS decimo_write ON public.decimos_terceiros;
CREATE POLICY decimo_write ON public.decimos_terceiros FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_decimos ON public.decimos_terceiros;
CREATE TRIGGER trg_audit_decimos
    AFTER INSERT OR UPDATE OR DELETE ON public.decimos_terceiros
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_decimo');

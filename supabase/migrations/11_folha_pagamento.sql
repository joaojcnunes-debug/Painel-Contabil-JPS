-- ============================================================
-- Migration 11 — Folha de Pagamento Simplificada
-- ============================================================

-- ─── Funcionários ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcionarios (
    id_funcionario TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    data_nascimento DATE,
    data_admissao DATE NOT NULL,
    data_demissao DATE,
    cargo TEXT,
    tipo TEXT NOT NULL DEFAULT 'CLT'
        CHECK (tipo IN ('CLT', 'ESTAGIARIO', 'JOVEM_APRENDIZ', 'AUTONOMO')),
    salario_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
    dependentes INTEGER NOT NULL DEFAULT 0,
    vale_transporte BOOLEAN NOT NULL DEFAULT false,
    valor_vt NUMERIC(14, 2),                -- valor mensal do VT (pra desconto até 6%)
    valor_va NUMERIC(14, 2),                -- vale alimentação (informativo)
    plano_saude_desc NUMERIC(14, 2),        -- desconto fixo mensal
    status TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status IN ('ATIVO', 'AFASTADO', 'DEMITIDO')),
    pix TEXT,
    banco TEXT,
    agencia TEXT,
    conta TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_func_cliente ON public.funcionarios(id_cliente);
CREATE INDEX IF NOT EXISTS idx_func_status ON public.funcionarios(status);

-- ─── Folhas de Pagamento (cabeçalho) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.folhas_pagamento (
    id_folha TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    competencia TEXT NOT NULL,              -- YYYY-MM
    total_proventos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_descontos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_liquido NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_inss_patronal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'FECHADA')),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (id_cliente, competencia)
);

CREATE INDEX IF NOT EXISTS idx_folha_cliente ON public.folhas_pagamento(id_cliente);
CREATE INDEX IF NOT EXISTS idx_folha_competencia ON public.folhas_pagamento(competencia DESC);

-- ─── Itens da Folha (1 por funcionário por mês) ───────────────
CREATE TABLE IF NOT EXISTS public.folha_itens (
    id_item TEXT PRIMARY KEY,
    id_folha TEXT NOT NULL REFERENCES public.folhas_pagamento(id_folha) ON DELETE CASCADE,
    id_funcionario TEXT NOT NULL REFERENCES public.funcionarios(id_funcionario) ON DELETE RESTRICT,
    -- Snapshot (preserva valores mesmo se cadastro mudar depois)
    nome_func TEXT NOT NULL,
    cargo_func TEXT,
    salario_base NUMERIC(14, 2) NOT NULL,
    -- Proventos
    horas_extras NUMERIC(14, 2) NOT NULL DEFAULT 0,
    adicional_noturno NUMERIC(14, 2) NOT NULL DEFAULT 0,
    outros_proventos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Descontos
    desc_faltas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    desc_adiantamento NUMERIC(14, 2) NOT NULL DEFAULT 0,
    desc_outros NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Calculados
    base_inss NUMERIC(14, 2) NOT NULL,
    inss NUMERIC(14, 2) NOT NULL,
    base_irrf NUMERIC(14, 2) NOT NULL,
    irrf NUMERIC(14, 2) NOT NULL,
    vale_transporte NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- até 6% do bruto
    plano_saude NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_proventos NUMERIC(14, 2) NOT NULL,
    total_descontos NUMERIC(14, 2) NOT NULL,
    liquido NUMERIC(14, 2) NOT NULL,
    -- Encargos patronais (informativo — não vão no holerite)
    inss_patronal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,
    observacoes TEXT,
    UNIQUE (id_folha, id_funcionario)
);

CREATE INDEX IF NOT EXISTS idx_item_folha ON public.folha_itens(id_folha);
CREATE INDEX IF NOT EXISTS idx_item_func ON public.folha_itens(id_funcionario);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folhas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_itens ENABLE ROW LEVEL SECURITY;

-- funcionarios: equipe full; cliente lê só os seus
DROP POLICY IF EXISTS func_select ON public.funcionarios;
CREATE POLICY func_select ON public.funcionarios FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS func_write ON public.funcionarios;
CREATE POLICY func_write ON public.funcionarios FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- folhas_pagamento: mesma regra
DROP POLICY IF EXISTS folha_select ON public.folhas_pagamento;
CREATE POLICY folha_select ON public.folhas_pagamento FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS folha_write ON public.folhas_pagamento;
CREATE POLICY folha_write ON public.folhas_pagamento FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- folha_itens: lê via JOIN com folha (cliente só vê os seus)
DROP POLICY IF EXISTS item_select ON public.folha_itens;
CREATE POLICY item_select ON public.folha_itens FOR SELECT
    USING (
        public.fn_is_equipe()
        OR EXISTS (
            SELECT 1 FROM public.folhas_pagamento f
            WHERE f.id_folha = folha_itens.id_folha
              AND f.id_cliente = public.fn_cliente_atual()
        )
    );

DROP POLICY IF EXISTS item_write ON public.folha_itens;
CREATE POLICY item_write ON public.folha_itens FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_funcionarios ON public.funcionarios;
CREATE TRIGGER trg_audit_funcionarios
    AFTER INSERT OR UPDATE OR DELETE ON public.funcionarios
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_funcionario');

DROP TRIGGER IF EXISTS trg_audit_folhas ON public.folhas_pagamento;
CREATE TRIGGER trg_audit_folhas
    AFTER INSERT OR UPDATE OR DELETE ON public.folhas_pagamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_folha');

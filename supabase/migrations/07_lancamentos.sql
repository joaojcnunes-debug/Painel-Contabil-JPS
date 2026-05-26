-- ============================================================
-- Migration 07 — Lançamentos contábeis (receita/despesa por cliente)
-- Versão simplificada: NÃO é double-entry. Cada lançamento tem
-- tipo (RECEITA/DESPESA) + valor positivo + conta do plano.
-- ============================================================

-- Plano de contas (catálogo de categorias)
CREATE TABLE IF NOT EXISTS public.plano_contas (
    id_conta TEXT PRIMARY KEY,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
    grupo TEXT,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plano_contas_tipo ON public.plano_contas(tipo);
CREATE INDEX IF NOT EXISTS idx_plano_contas_codigo ON public.plano_contas(codigo);

-- Lançamentos
CREATE TABLE IF NOT EXISTS public.lancamentos (
    id_lancamento TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    id_conta TEXT NOT NULL REFERENCES public.plano_contas(id_conta),
    data_lancamento DATE NOT NULL,
    competencia TEXT,             -- YYYY-MM (opcional, default = mês do data_lancamento)
    tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
    valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
    descricao TEXT NOT NULL,
    documento_ref TEXT,           -- nº NF, recibo, etc
    observacoes TEXT,
    id_documento TEXT REFERENCES public.documentos(id_documento) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lanc_cliente ON public.lancamentos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_lanc_data ON public.lancamentos(data_lancamento DESC);
CREATE INDEX IF NOT EXISTS idx_lanc_competencia ON public.lancamentos(competencia);
CREATE INDEX IF NOT EXISTS idx_lanc_conta ON public.lancamentos(id_conta);
CREATE INDEX IF NOT EXISTS idx_lanc_tipo ON public.lancamentos(tipo);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- Plano de contas: todos autenticados leem, só Admin escreve
DROP POLICY IF EXISTS plano_select ON public.plano_contas;
CREATE POLICY plano_select ON public.plano_contas FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS plano_write ON public.plano_contas;
CREATE POLICY plano_write ON public.plano_contas FOR ALL
    USING (public.fn_perfil_atual() = 'Admin')
    WITH CHECK (public.fn_perfil_atual() = 'Admin');

-- Lançamentos: equipe tudo, cliente vê só os próprios
DROP POLICY IF EXISTS lanc_select ON public.lancamentos;
CREATE POLICY lanc_select ON public.lancamentos FOR SELECT
    USING (
        public.fn_is_equipe()
        OR id_cliente = public.fn_cliente_atual()
    );

DROP POLICY IF EXISTS lanc_write ON public.lancamentos;
CREATE POLICY lanc_write ON public.lancamentos FOR ALL
    USING (public.fn_is_equipe())
    WITH CHECK (public.fn_is_equipe());

-- ─── Audit trigger ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_lancamentos ON public.lancamentos;
CREATE TRIGGER trg_audit_lancamentos
    AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_lancamento');

DROP TRIGGER IF EXISTS trg_audit_plano_contas ON public.plano_contas;
CREATE TRIGGER trg_audit_plano_contas
    AFTER INSERT OR UPDATE OR DELETE ON public.plano_contas
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_conta');

-- ─── Seed do plano de contas básico ──────────────────────────────────────────
INSERT INTO public.plano_contas (id_conta, codigo, nome, tipo, grupo) VALUES
    -- Receitas
    ('PC_REC_001', '3.01.01', 'Vendas de produtos', 'RECEITA', 'Vendas'),
    ('PC_REC_002', '3.01.02', 'Prestação de serviços', 'RECEITA', 'Vendas'),
    ('PC_REC_003', '3.02.01', 'Receitas financeiras', 'RECEITA', 'Financeiras'),
    ('PC_REC_004', '3.03.01', 'Outras receitas', 'RECEITA', 'Outras'),
    -- Despesas operacionais
    ('PC_DES_001', '4.01.01', 'Aluguel', 'DESPESA', 'Operacionais'),
    ('PC_DES_002', '4.01.02', 'Energia elétrica', 'DESPESA', 'Operacionais'),
    ('PC_DES_003', '4.01.03', 'Água', 'DESPESA', 'Operacionais'),
    ('PC_DES_004', '4.01.04', 'Internet e telefone', 'DESPESA', 'Operacionais'),
    ('PC_DES_005', '4.01.05', 'Material de escritório', 'DESPESA', 'Operacionais'),
    ('PC_DES_006', '4.01.06', 'Manutenção', 'DESPESA', 'Operacionais'),
    -- Pessoal
    ('PC_DES_007', '4.02.01', 'Salários', 'DESPESA', 'Pessoal'),
    ('PC_DES_008', '4.02.02', 'Encargos sociais (INSS/FGTS)', 'DESPESA', 'Pessoal'),
    ('PC_DES_009', '4.02.03', 'Pró-labore', 'DESPESA', 'Pessoal'),
    ('PC_DES_010', '4.02.04', 'Benefícios', 'DESPESA', 'Pessoal'),
    -- Tributos
    ('PC_DES_011', '4.03.01', 'DAS / Simples Nacional', 'DESPESA', 'Tributos'),
    ('PC_DES_012', '4.03.02', 'IRPJ / CSLL', 'DESPESA', 'Tributos'),
    ('PC_DES_013', '4.03.03', 'PIS / COFINS', 'DESPESA', 'Tributos'),
    ('PC_DES_014', '4.03.04', 'ICMS / ISS', 'DESPESA', 'Tributos'),
    -- Serviços de terceiros
    ('PC_DES_015', '4.04.01', 'Honorários contábeis', 'DESPESA', 'Serviços terceiros'),
    ('PC_DES_016', '4.04.02', 'Honorários advocatícios', 'DESPESA', 'Serviços terceiros'),
    ('PC_DES_017', '4.04.03', 'Consultoria', 'DESPESA', 'Serviços terceiros'),
    -- Financeiras
    ('PC_DES_018', '4.05.01', 'Juros e multas', 'DESPESA', 'Financeiras'),
    ('PC_DES_019', '4.05.02', 'Tarifas bancárias', 'DESPESA', 'Financeiras'),
    -- Outras
    ('PC_DES_020', '4.06.01', 'Outras despesas', 'DESPESA', 'Outras')
ON CONFLICT (id_conta) DO NOTHING;

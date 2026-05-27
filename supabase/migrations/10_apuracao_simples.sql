-- ============================================================
-- Migration 10 — Apuração do Simples Nacional (DAS)
-- ============================================================

-- Anexo do Simples no cadastro do cliente
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS anexo_simples TEXT
        CHECK (anexo_simples IN ('I', 'II', 'III', 'IV', 'V'));

-- Histórico de apurações
CREATE TABLE IF NOT EXISTS public.apuracoes_simples (
    id_apuracao TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    competencia TEXT NOT NULL,         -- YYYY-MM
    anexo TEXT NOT NULL CHECK (anexo IN ('I', 'II', 'III', 'IV', 'V')),
    receita_mes NUMERIC(14, 2) NOT NULL,
    rbt12 NUMERIC(14, 2) NOT NULL,     -- receita bruta últimos 12 meses
    faixa INTEGER NOT NULL CHECK (faixa BETWEEN 1 AND 6),
    aliquota_nominal NUMERIC(7, 4) NOT NULL,    -- ex: 0.0400 = 4%
    parcela_deduzir NUMERIC(14, 2) NOT NULL,
    aliquota_efetiva NUMERIC(7, 4) NOT NULL,
    valor_das NUMERIC(14, 2) NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_cliente, competencia)
);

CREATE INDEX IF NOT EXISTS idx_apur_cliente
    ON public.apuracoes_simples(id_cliente);
CREATE INDEX IF NOT EXISTS idx_apur_competencia
    ON public.apuracoes_simples(competencia DESC);

-- RLS: equipe escreve/lê; cliente lê apenas as próprias
ALTER TABLE public.apuracoes_simples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apur_select ON public.apuracoes_simples;
CREATE POLICY apur_select ON public.apuracoes_simples FOR SELECT
    USING (
        public.fn_is_equipe()
        OR id_cliente = public.fn_cliente_atual()
    );

DROP POLICY IF EXISTS apur_write ON public.apuracoes_simples;
CREATE POLICY apur_write ON public.apuracoes_simples FOR ALL
    USING (public.fn_is_equipe())
    WITH CHECK (public.fn_is_equipe());

-- Audit
DROP TRIGGER IF EXISTS trg_audit_apuracoes ON public.apuracoes_simples;
CREATE TRIGGER trg_audit_apuracoes
    AFTER INSERT OR UPDATE OR DELETE ON public.apuracoes_simples
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_apuracao');

-- ============================================================
-- Migration 14 — Notas Fiscais Eletrônicas (NF-e)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notas_fiscais (
    id_nota TEXT PRIMARY KEY,
    chave TEXT NOT NULL UNIQUE,            -- 44 dígitos da NF-e (dedupe)
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    -- Identificação
    numero TEXT,                            -- nNF
    serie TEXT,                             -- serie
    data_emissao DATE,                      -- dhEmi (data)
    natureza_operacao TEXT,                 -- natOp
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    -- Emitente
    emit_cnpj TEXT,
    emit_nome TEXT,
    emit_uf TEXT,
    -- Destinatário
    dest_cnpj TEXT,                         -- pode ser CPF tb
    dest_nome TEXT,
    -- Valores
    valor_produtos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_desconto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_frete NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_icms NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_ipi NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_pis NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_cofins NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Itens em JSON pra detalhamento (lista de produtos)
    itens JSONB,
    -- Vínculos
    id_documento TEXT REFERENCES public.documentos(id_documento) ON DELETE SET NULL,
    id_lancamento TEXT REFERENCES public.lancamentos(id_lancamento) ON DELETE SET NULL,
    -- Status
    status TEXT NOT NULL DEFAULT 'IMPORTADA'
        CHECK (status IN ('IMPORTADA', 'PROCESSADA', 'CANCELADA')),
    observacoes TEXT,
    imported_by TEXT,                       -- email do usuário
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfe_cliente ON public.notas_fiscais(id_cliente);
CREATE INDEX IF NOT EXISTS idx_nfe_emissao ON public.notas_fiscais(data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_nfe_tipo ON public.notas_fiscais(tipo);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_select ON public.notas_fiscais;
CREATE POLICY nfe_select ON public.notas_fiscais FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS nfe_write ON public.notas_fiscais;
CREATE POLICY nfe_write ON public.notas_fiscais FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- ─── Audit ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_nfe ON public.notas_fiscais;
CREATE TRIGGER trg_audit_nfe
    AFTER INSERT OR UPDATE OR DELETE ON public.notas_fiscais
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_nota');

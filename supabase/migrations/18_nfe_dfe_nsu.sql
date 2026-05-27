-- ============================================================
-- Migration 18 — Cursor de NSU para Distribuição DFe SEFAZ
-- ============================================================
-- A SEFAZ usa NSU (Número Sequencial Único) como cursor incremental
-- pra retornar XMLs novos desde a última consulta. Precisa persistir
-- o último NSU consultado por (cliente, ambiente).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.nfe_dfe_nsu (
    id_nsu TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    ambiente INTEGER NOT NULL CHECK (ambiente IN (1, 2)),
    -- 1 = Produção | 2 = Homologação (padrão SEFAZ)
    ultimo_nsu TEXT NOT NULL DEFAULT '0',
    -- NSU como string (até 15 dígitos)
    max_nsu TEXT,
    -- NSU mais alto disponível na SEFAZ (info do retorno)
    ultima_consulta TIMESTAMPTZ,
    ultimo_status TEXT,
    -- Códigos SEFAZ tipo 137 (sem novos docs), 138 (com docs), 656 (consumo indevido)
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (id_cliente, ambiente)
);

CREATE INDEX IF NOT EXISTS idx_dfe_nsu_cliente ON public.nfe_dfe_nsu(id_cliente);

-- RLS — equipe only
ALTER TABLE public.nfe_dfe_nsu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dfe_nsu_all ON public.nfe_dfe_nsu;
CREATE POLICY dfe_nsu_all ON public.nfe_dfe_nsu FOR ALL
    USING (public.fn_is_equipe())
    WITH CHECK (public.fn_is_equipe());

DROP TRIGGER IF EXISTS trg_audit_dfe_nsu ON public.nfe_dfe_nsu;
CREATE TRIGGER trg_audit_dfe_nsu
    AFTER INSERT OR UPDATE OR DELETE ON public.nfe_dfe_nsu
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_nsu');

NOTIFY pgrst, 'reload schema';

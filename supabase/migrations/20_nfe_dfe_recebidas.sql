-- Migration 20: nfe_dfe_recebidas + bucket nfe-xmls
--
-- Persiste os XMLs baixados pela Distribuição DFe SEFAZ.
-- Antes, os XMLs eram só retornados ao frontend e perdidos no refresh.
-- Agora cada chave fica registrada + XML completo vai pra bucket privado.

-- ============================================================
-- TABELA nfe_dfe_recebidas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfe_dfe_recebidas (
  chave         TEXT PRIMARY KEY,                  -- 44 dígitos da NF-e
  id_cliente    TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  ambiente      SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  nsu           TEXT,                              -- NSU desta entrega
  schema_xml    TEXT,                              -- ex: "procNFe_v4.00.xsd"
  xml_path      TEXT,                              -- caminho no bucket nfe-xmls
  -- Metadata extraída do XML pra facilitar filtros (sem precisar abrir o XML)
  emitente_cnpj TEXT,
  emitente_nome TEXT,
  numero        TEXT,
  serie         TEXT,
  valor_total   NUMERIC(15, 2),
  dh_emissao    TIMESTAMPTZ,
  -- Quando entrou no nosso sistema
  baixado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auditoria padrão
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfe_recebidas_cliente
  ON public.nfe_dfe_recebidas (id_cliente, ambiente, baixado_em DESC);

CREATE INDEX IF NOT EXISTS idx_nfe_recebidas_emitente
  ON public.nfe_dfe_recebidas (emitente_cnpj)
  WHERE emitente_cnpj IS NOT NULL;

-- RLS: equipe full access, cliente vê só os próprios.
ALTER TABLE public.nfe_dfe_recebidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_rec_select ON public.nfe_dfe_recebidas;
CREATE POLICY nfe_rec_select ON public.nfe_dfe_recebidas
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS nfe_rec_write ON public.nfe_dfe_recebidas;
CREATE POLICY nfe_rec_write ON public.nfe_dfe_recebidas
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

-- ============================================================
-- BUCKET nfe-xmls (privado)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('nfe-xmls', 'nfe-xmls', false)
  ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: equipe pode tudo; cliente pode listar/baixar os
-- arquivos dentro do prefixo do próprio id_cliente.
DROP POLICY IF EXISTS nfe_xml_equipe_all ON storage.objects;
CREATE POLICY nfe_xml_equipe_all ON storage.objects
  FOR ALL
  USING (bucket_id = 'nfe-xmls' AND fn_is_equipe())
  WITH CHECK (bucket_id = 'nfe-xmls' AND fn_is_equipe());

DROP POLICY IF EXISTS nfe_xml_cliente_read ON storage.objects;
CREATE POLICY nfe_xml_cliente_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'nfe-xmls'
    AND (storage.foldername(name))[1] = fn_cliente_atual()
  );

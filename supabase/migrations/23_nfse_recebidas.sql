-- Migration 23: nfse_recebidas + nfse_nsu + bucket nfse-xmls
--
-- Persiste NFSe (Nota Fiscal de Serviço Eletrônica) baixadas via API ADN
-- do Emissor Nacional (https://adn.nfse.gov.br/contribuinte/nfse?ultimoNSU=N).
--
-- Padrão idêntico ao Migration 20 (nfe_dfe_recebidas) que fizemos pra
-- SEFAZ NF-e. Diferenças:
-- - Chave da NFSe padrão nacional tem 50 chars (não 44 como NF-e)
-- - "Emitida vs Recebida": o cert pode ser prestador, tomador ou
--   intermediário — mesma tabela cobre todos os casos
-- - Cursor NSU separado (nfse_nsu), independente do NSU da NF-e

-- ============================================================
-- TABELA nfse_recebidas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfse_recebidas (
  chave              TEXT PRIMARY KEY,        -- 50 dígitos da chave NFSe nacional
  id_cliente         TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  ambiente           SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  nsu                TEXT,                    -- NSU desta entrega
  -- Papel do cliente nesta NFSe (prestador, tomador ou intermediário)
  papel              TEXT CHECK (papel IN ('PRESTADOR', 'TOMADOR', 'INTERMEDIARIO')),
  -- Identificação da nota
  numero_nfse        TEXT,
  serie              TEXT,
  dh_emissao         TIMESTAMPTZ,
  dh_processamento   TIMESTAMPTZ,
  status             TEXT DEFAULT 'AUTORIZADA'
    CHECK (status IN ('AUTORIZADA', 'CANCELADA', 'SUBSTITUIDA', 'REJEITADA')),
  -- Prestador
  prestador_cnpj     TEXT,
  prestador_nome     TEXT,
  prestador_uf       TEXT,
  prestador_municipio TEXT,
  -- Tomador
  tomador_cnpj       TEXT,
  tomador_nome       TEXT,
  tomador_uf         TEXT,
  tomador_municipio  TEXT,
  -- Serviço (LC 116/03)
  codigo_servico     TEXT,
  discriminacao      TEXT,
  valor_servicos     NUMERIC(15, 2),
  valor_iss          NUMERIC(15, 2),
  aliquota_iss       NUMERIC(6, 4),
  valor_liquido      NUMERIC(15, 2),
  -- Município do serviço
  cod_municipio_servico TEXT,
  -- Arquivos
  xml_path           TEXT,                    -- caminho no bucket nfse-xmls
  pdf_path           TEXT,                    -- opcional (DANFSE)
  -- Auditoria
  baixado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfse_rec_cliente_dh
  ON public.nfse_recebidas (id_cliente, ambiente, dh_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_nfse_rec_prestador_cnpj
  ON public.nfse_recebidas (prestador_cnpj)
  WHERE prestador_cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_rec_tomador_cnpj
  ON public.nfse_recebidas (tomador_cnpj)
  WHERE tomador_cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_rec_status
  ON public.nfse_recebidas (status);

-- RLS: equipe ALL, cliente SELECT própria
ALTER TABLE public.nfse_recebidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfse_rec_select ON public.nfse_recebidas;
CREATE POLICY nfse_rec_select ON public.nfse_recebidas
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS nfse_rec_write ON public.nfse_recebidas;
CREATE POLICY nfse_rec_write ON public.nfse_recebidas
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

-- ============================================================
-- TABELA nfse_nsu (cursor por cliente+ambiente pra API ADN)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfse_nsu (
  id_nsu           TEXT PRIMARY KEY,
  id_cliente       TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  ambiente         SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  ultimo_nsu       TEXT NOT NULL DEFAULT '0',
  max_nsu          TEXT,
  ultima_consulta  TIMESTAMPTZ,
  ultimo_status    TEXT,          -- código HTTP ou mensagem curta da última consulta
  total_baixado    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_cliente, ambiente)
);

CREATE INDEX IF NOT EXISTS idx_nfse_nsu_cliente
  ON public.nfse_nsu (id_cliente, ambiente);

ALTER TABLE public.nfse_nsu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfse_nsu_select ON public.nfse_nsu;
CREATE POLICY nfse_nsu_select ON public.nfse_nsu
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS nfse_nsu_write ON public.nfse_nsu;
CREATE POLICY nfse_nsu_write ON public.nfse_nsu
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

-- ============================================================
-- BUCKET nfse-xmls (privado)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('nfse-xmls', 'nfse-xmls', false)
  ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: equipe pode tudo; cliente pode listar/baixar os
-- arquivos dentro do próprio id_cliente prefix.
DROP POLICY IF EXISTS nfse_xml_equipe_all ON storage.objects;
CREATE POLICY nfse_xml_equipe_all ON storage.objects
  FOR ALL
  USING (bucket_id = 'nfse-xmls' AND fn_is_equipe())
  WITH CHECK (bucket_id = 'nfse-xmls' AND fn_is_equipe());

DROP POLICY IF EXISTS nfse_xml_cliente_read ON storage.objects;
CREATE POLICY nfse_xml_cliente_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'nfse-xmls'
    AND (storage.foldername(name))[1] = fn_cliente_atual()
  );

-- Migration 32: coluna "origem" em nfse_recebidas
--
-- Distingue de onde a NFSe veio:
--   'adn'          — Emissor Nacional (webservice ADN + cert mTLS)
--   'nota_carioca' — webservice legado do Rio de Janeiro (ABRASF)
--   'manual'       — upload de XML pelo usuário
--
-- Só serve pra saber a fonte + facilitar filtro no dashboard.
-- Backfill infere pelo valor existente de `nsu`.

ALTER TABLE public.nfse_recebidas
  ADD COLUMN IF NOT EXISTS origem TEXT
    CHECK (origem IN ('adn', 'nota_carioca', 'manual', 'outro'));

-- Backfill: inferir pela coluna nsu
UPDATE public.nfse_recebidas
   SET origem = CASE
     WHEN nsu = 'manual' THEN 'manual'
     WHEN nsu = 'nota_carioca' THEN 'nota_carioca'
     WHEN nsu IS NULL OR nsu = '' THEN 'outro'
     ELSE 'adn'
   END
 WHERE origem IS NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_recebidas_origem
  ON public.nfse_recebidas (id_cliente, origem, dh_emissao DESC);

-- 'portal_scrape' = metadata veio do scraping do portal nfse.gov.br
-- (sem XML, porque o portal exige captcha por download).

ALTER TABLE nfse_recebidas
  DROP CONSTRAINT IF EXISTS nfse_recebidas_origem_check;

ALTER TABLE nfse_recebidas
  ADD CONSTRAINT nfse_recebidas_origem_check
  CHECK (origem = ANY (ARRAY['adn'::text, 'nota_carioca'::text, 'manual'::text, 'portal_scrape'::text, 'outro'::text]));

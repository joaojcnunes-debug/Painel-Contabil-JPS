-- Migration 25: Backend do Monitor de XMLs
--
-- Fecha o gap entre nfe_dfe_recebidas (captura SEFAZ) e o resto do sistema:
-- 1) Coluna status_manifestacao — enum derivado do último evento de manifestação
-- 2) Coluna id_lancamento — link opcional com lançamento contábil (matching)
-- 3) Coluna visualizada_em — pro "novo desde a última visualização"
-- 4) View vw_nfe_dfe_monitor — junção pronta com metadados úteis
-- 5) Trigger em nfe_manifestacoes — atualiza status automaticamente
-- 6) Backfill: preenche status pras NFe que já têm manifestação registrada

-- ============================================================
-- 1) COLUNAS NOVAS EM nfe_dfe_recebidas
-- ============================================================
ALTER TABLE public.nfe_dfe_recebidas
  ADD COLUMN IF NOT EXISTS status_manifestacao TEXT
    CHECK (status_manifestacao IS NULL OR status_manifestacao IN (
      'CIENCIA', 'CONFIRMACAO', 'DESCONHECIMENTO', 'OP_NAO_REALIZADA'
    )),
  ADD COLUMN IF NOT EXISTS status_manifestacao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_lancamento TEXT
    REFERENCES public.lancamentos(id_lancamento) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visualizada_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nfe_rec_status_manif
  ON public.nfe_dfe_recebidas (id_cliente, status_manifestacao, dh_emissao DESC)
  WHERE status_manifestacao IS NULL;

CREATE INDEX IF NOT EXISTS idx_nfe_rec_sem_lanc
  ON public.nfe_dfe_recebidas (id_cliente, dh_emissao DESC)
  WHERE id_lancamento IS NULL;

-- ============================================================
-- 2) MAPEAMENTO tipo_evento -> status_manifestacao
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_tipo_evento_para_status(p_tipo TEXT)
  RETURNS TEXT
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE p_tipo
    WHEN '210210' THEN 'CIENCIA'
    WHEN '210200' THEN 'CONFIRMACAO'
    WHEN '210220' THEN 'DESCONHECIMENTO'
    WHEN '210240' THEN 'OP_NAO_REALIZADA'
    ELSE NULL
  END;
$$;

-- ============================================================
-- 3) TRIGGER: atualiza status automaticamente ao inserir manifestação
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_atualiza_status_manif_nfe()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Só considera manifestação registrada com sucesso na SEFAZ
  IF NEW.ok = true AND NEW.c_stat IN ('135', '136') THEN
    UPDATE public.nfe_dfe_recebidas
       SET status_manifestacao = public.fn_tipo_evento_para_status(NEW.tipo_evento),
           status_manifestacao_em = COALESCE(NEW.dh_registrado, NEW.dh_evento, NOW()),
           updated_at = NOW()
     WHERE chave = NEW.chave_nfe
       AND id_cliente = NEW.id_cliente
       AND (
         status_manifestacao_em IS NULL
         OR status_manifestacao_em < COALESCE(NEW.dh_registrado, NEW.dh_evento, NOW())
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualiza_status_manif ON public.nfe_manifestacoes;
CREATE TRIGGER trg_atualiza_status_manif
  AFTER INSERT ON public.nfe_manifestacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atualiza_status_manif_nfe();

-- ============================================================
-- 4) BACKFILL: pega manifestações já registradas e atualiza status
-- ============================================================
UPDATE public.nfe_dfe_recebidas nfe
   SET status_manifestacao = public.fn_tipo_evento_para_status(m.tipo_evento),
       status_manifestacao_em = COALESCE(m.dh_registrado, m.dh_evento)
  FROM (
    SELECT DISTINCT ON (chave_nfe, id_cliente)
      chave_nfe, id_cliente, tipo_evento, dh_registrado, dh_evento
    FROM public.nfe_manifestacoes
    WHERE ok = true AND c_stat IN ('135', '136')
    ORDER BY chave_nfe, id_cliente, COALESCE(dh_registrado, dh_evento) DESC
  ) m
  WHERE nfe.chave = m.chave_nfe
    AND nfe.id_cliente = m.id_cliente
    AND nfe.status_manifestacao IS NULL;

-- ============================================================
-- 5) VIEW UNIFICADA (join pronto pro dashboard)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_nfe_dfe_monitor AS
SELECT
  nfe.chave,
  nfe.id_cliente,
  cli.razao_social AS cliente_nome,
  nfe.ambiente,
  nfe.emitente_cnpj,
  nfe.emitente_nome,
  nfe.numero,
  nfe.serie,
  nfe.valor_total,
  nfe.dh_emissao,
  nfe.baixado_em,
  nfe.visualizada_em,
  nfe.status_manifestacao,
  nfe.status_manifestacao_em,
  nfe.id_lancamento,
  lanc.competencia AS lancamento_competencia,
  lanc.valor AS lancamento_valor,
  -- Dias desde a emissão (pra alerta de prazo 180d)
  CASE
    WHEN nfe.dh_emissao IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM NOW() - nfe.dh_emissao)::INT
  END AS dias_desde_emissao,
  -- Precisa manifestar? (sem manif + emitida)
  (nfe.status_manifestacao IS NULL) AS sem_manifestacao,
  -- Precisa lançar? (sem link com lancamento)
  (nfe.id_lancamento IS NULL) AS sem_lancamento
FROM public.nfe_dfe_recebidas nfe
LEFT JOIN public.clientes cli ON cli.id_cliente = nfe.id_cliente
LEFT JOIN public.lancamentos lanc ON lanc.id_lancamento = nfe.id_lancamento;

-- RLS: a view herda RLS das tabelas base (nfe_dfe_recebidas e lancamentos
-- já filtram por fn_is_equipe OR id_cliente=fn_cliente_atual).
-- Nada a adicionar.

COMMENT ON VIEW public.vw_nfe_dfe_monitor IS
  'Monitor de XMLs — junção nfe_dfe_recebidas + clientes + lancamentos + flags derivadas (sem_manif, sem_lanc, dias_desde_emissao). Usado pelo dashboard /monitor-xmls.';

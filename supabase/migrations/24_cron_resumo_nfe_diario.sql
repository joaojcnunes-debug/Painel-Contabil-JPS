-- Migration 24: cron job diário do resumo de NFe recebidas
--
-- Agenda a Edge Function enviar-resumo-nfe-diario pra rodar às 8h Brasília
-- (11h UTC) todo dia. Se a EF não tem NFe pra reportar, ela mesma decide
-- não enviar email.
--
-- Pré-requisito (uma vez, via dashboard Supabase):
--   Settings → Vault → New Secret
--   name: supabase_anon_key
--   value: (anon key do projeto — Settings → API → Project API keys → anon public)
--
-- A anon key é publica de qualquer forma (é o que a EF exige no header),
-- mas armazenar no vault mantém a migration limpa e auditada.

-- ============================================================
-- EXTENSÕES (idempotentes)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- HELPER: invoca EF enviar-resumo-nfe-diario
-- ============================================================
CREATE OR REPLACE FUNCTION public.invoke_edge_resumo_nfe_diario()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_anon_key text;
  v_request_id bigint;
BEGIN
  -- Lê a anon key do vault (uma vez configurada, dispensa hardcode)
  SELECT decrypted_secret
    INTO v_anon_key
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_anon_key'
   LIMIT 1;

  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    RAISE EXCEPTION
      'Secret "supabase_anon_key" não configurado no Vault. Adicione em Settings → Vault.';
  END IF;

  SELECT net.http_post(
    url := 'https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-resumo-nfe-diario',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RAISE NOTICE 'Edge invocada, request_id=%', v_request_id;
END;
$$;

-- ============================================================
-- CRON JOB: 0 11 * * * (11h UTC = 8h Brasília UTC-3)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resumo-nfe-diario') THEN
    PERFORM cron.unschedule('resumo-nfe-diario');
  END IF;
END $$;

SELECT cron.schedule(
  'resumo-nfe-diario',
  '0 11 * * *',
  $$ SELECT public.invoke_edge_resumo_nfe_diario(); $$
);

-- Como testar manualmente sem esperar o cron:
--   SELECT public.invoke_edge_resumo_nfe_diario();
--
-- Ver últimas execuções:
--   SELECT jobname, status, return_message, start_time, end_time
--     FROM cron.job_run_details
--    WHERE jobname = 'resumo-nfe-diario'
--    ORDER BY start_time DESC
--    LIMIT 10;

-- ============================================================
-- Migration 36 — Agenda as rotinas que só rodavam pelo botão em /config
-- ============================================================
-- Mesmo padrão de invoke_edge_resumo_nfe_diario(): a anon key vem do Vault
-- (secret "supabase_anon_key"); as Edge Functions têm JWT verification OFF.
-- cron.schedule com o mesmo nome atualiza o job, então rodar de novo é seguro.
-- Horários em UTC (Brasília = UTC-3).
-- Aplicada em produção em 12/10/2026.

SELECT cron.schedule(nome, horario, format(
  $c$select net.http_post(
    url := 'https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/%s',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb);$c$, nome))
FROM (VALUES
  ('atualizar-status-vencidos', '0 9 * * *'),     -- todo dia, 6h
  ('gerar-recorrentes-mes',     '0 9 1 * *'),     -- dia 1, 6h
  ('enviar-alertas-vencimento', '15 11 * * 1-5'), -- seg a sex, 8h15
  ('enviar-alertas-faturas',    '30 11 * * 1-5'), -- seg a sex, 8h30
  ('enviar-relatorio-mensal',   '0 12 5 * *')     -- dia 5, 9h (mês anterior)
) AS t(nome, horario);

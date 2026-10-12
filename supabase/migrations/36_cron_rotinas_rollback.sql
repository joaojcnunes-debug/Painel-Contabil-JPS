-- Rollback da migration 36 — remove os agendamentos (as funções continuam no botão em /config).
SELECT cron.unschedule(nome)
FROM (VALUES
  ('atualizar-status-vencidos'),
  ('gerar-recorrentes-mes'),
  ('enviar-alertas-vencimento'),
  ('enviar-alertas-faturas'),
  ('enviar-relatorio-mensal')
) AS t(nome)
WHERE EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = t.nome);

# Edge Function: enviar-alertas-diarios-equipe

E-mail diário pra equipe (Admin/Contador) consolidando pendências:
- Obrigações atrasadas / vencendo em 3 dias
- Faturas em aberto / atrasadas
- Sessões e-CAC com pendência (últimos 7 dias)
- Certificados A1 vencendo em 30 dias

## Deploy

```bash
cd C:\Users\PC\painel-contabil
npx supabase functions deploy enviar-alertas-diarios-equipe
```

(Precisa do CLI `supabase` logado: `npx supabase login`)

## Variáveis (Secrets na Edge Function)

No dashboard Supabase → Edge Functions → enviar-alertas-diarios-equipe → Secrets:

- `RESEND_API_KEY` (obrigatório): chave da Resend
- `EMAIL_FROM` (opcional): default `JSP Contabilidade <onboarding@resend.dev>`

## Testar antes de agendar

```bash
# Dry run — devolve preview sem enviar
curl -X POST "https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-alertas-diarios-equipe" \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true}'

# Teste real enviando pra 1 e-mail só
curl -X POST "https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-alertas-diarios-equipe" \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"joaojcnunes@gmail.com"}'

# Envio real pra toda equipe (Admin+Contador ativos)
curl -X POST "https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-alertas-diarios-equipe" \
  -H "Authorization: Bearer SEU_ANON_KEY"
```

## Agendar diariamente (pg_cron)

No SQL Editor do Supabase:

```sql
-- Habilita pg_cron + pg_net (uma vez só)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agenda pra todo dia útil às 8h Brasília (= 11h UTC)
SELECT cron.schedule(
  'alertas-diarios-equipe',
  '0 11 * * 1-5',  -- 11h UTC = 8h BRT, seg-sex
  $$
    SELECT net.http_post(
      url := 'https://mwmltqaanfxjkoztgcby.supabase.co/functions/v1/enviar-alertas-diarios-equipe',
      headers := jsonb_build_object(
        'Authorization', 'Bearer SEU_ANON_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

Substitua `SEU_ANON_KEY` pela chave anônima do projeto.

## Verificar agendamentos ativos

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Desativar

```sql
SELECT cron.unschedule('alertas-diarios-equipe');
```

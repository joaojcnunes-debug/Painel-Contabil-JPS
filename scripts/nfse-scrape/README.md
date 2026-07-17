# NFSe Scrape

Baixa NFSe **emitidas** de clientes direto do portal `nfse.gov.br`, usando
Playwright + certificado A1 do cliente. Contorna a limitação do ADN
(`/contribuintes/DFe/`) que só devolve **recebidas** — daí o scraping.

Roda em cron diário no GitHub Actions.

## POC — passos pra testar SCHEIDT REIS local

1. Baixe o PFX do storage:
   Supabase Dashboard → Storage → bucket `certificados-jsp`
   → pasta `CRT-B4BD4FCF/` → arquivo `1779896552107.pfx` → **Download**

2. Salve o arquivo baixado como:
   `scripts/nfse-scrape/certs/scheidt-reis.pfx`

3. Execute:
   ```
   cd scripts/nfse-scrape
   node poc.mjs
   ```

4. Resultado esperado em `output/scheidt-reis.json`:
   ```
   {
     "cliente": "SCHEIDT REIS ...",
     "total_linhas": 9,       ← as 9 notas do print
     "chaves": [ "33045572...", ... ]
   }
   ```

## Arquivos

- `poc.mjs` — script POC hardcoded pra 1 cliente
- `lib/extract-cert.mjs` — extrai key+cert de PFX
- `certs/` — PFX local (nunca commitado, ver .gitignore)
- `output/` — screenshots + JSON de resultado

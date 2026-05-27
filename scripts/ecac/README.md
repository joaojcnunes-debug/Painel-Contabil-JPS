# RPA Local — e-CAC

Script Node + Playwright que automatiza a navegação no e-CAC. Roda **localmente no seu Windows**, NÃO no Vercel.

## Como funciona

1. Abre o **Chromium em modo visível** (não-headless)
2. Navega pro e-CAC (`https://cav.receita.fazenda.gov.br/autenticacao/login`)
3. **Você faz login manualmente** — como preferir:
   - Via **gov.br** (CPF+senha, certificado nuvem, banco, QR Code)
   - Via **certificado A1** instalado no Windows (clique direto na opção)
4. Quando detecta que entrou (URL muda pra `/ecac/`), o script automatiza:
   - Navega pra Caixa Postal, Situação Fiscal, DCTFWeb, PerDComp
   - Salva **screenshot, HTML e texto** de cada tela
5. Resultados em `scripts/ecac/output/{timestamp}/`

A sessão fica persistida em `scripts/ecac/browser-profile/`, então **na segunda vez você não precisa logar de novo** (até o gov.br expirar a sessão, ~30 min).

## Pré-requisitos

- Node.js 18+ instalado
- Chromium baixado: `npx playwright install chromium` (já feito se você instalou as deps)
- Certificado A1 instalado no Windows (Painel de Controle → Opções de Internet → Conteúdo → Certificados), ou conta gov.br ativa

## Uso

```bash
# Da pasta raiz do projeto painel-contabil
npm run ecac:sync
```

Ou diretamente:

```bash
node scripts/ecac/sync-ecac.mjs
```

O Chromium vai abrir. Você loga. O script raspa. Você vê os resultados.

## Output

```
scripts/ecac/output/
  20260527-150030/
    dashboard-e-cac.png      # screenshot
    dashboard-e-cac.html     # HTML completo
    dashboard-e-cac.txt      # texto visível (sem tags)
    caixa-postal.png
    caixa-postal.html
    caixa-postal.txt
    situacao-fiscal.png
    ...
```

Os arquivos são `.gitignore`d — nada de dados sensíveis vai pro Git.

## Adicionar/remover telas

Edite o array `telas` em `sync-ecac.mjs`:

```js
const telas = [
  {
    nome: "DCTFWeb",
    url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10056",
  },
  // adicione mais...
];
```

IDs comuns do e-CAC (mudam às vezes, confira no menu):
- `10004` — Situação Fiscal
- `10005` — Caixa Postal
- `10056` — DCTFWeb
- `10133` — PerDComp Web

## Avisos importantes

- **A Receita Federal monitora RPA.** O próprio site declara limites (500 req/s, horário noturno pra grandes volumes). **Não rode em loop.** Use 1× por dia no máximo.
- **Termos de uso** do e-CAC: você é responsável pelo uso. Não use pra raspar dados de terceiros sem autorização.
- **Se o e-CAC mudar layout**, o script quebra. A SEFAZ não dá aviso prévio.
- **gov.br pode bloquear** acessos suspeitos. Se acontecer, rode com `headless: false` (já é o default aqui) e use UA humano.

## Quando o script falha

Erros comuns:

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Timeout - login não detectado" | Você levou >5 min pra logar | Aumenta `timeoutMs` em `aguardarLogin` |
| Página não carrega após login | gov.br exigiu 2FA | Faça 2FA e aguarda — o script detecta sozinho |
| HTML vem sem dados | E-CAC carrega via JS após render | Aumenta `await page.waitForTimeout(2000)` em `raspar` |
| Sessão expira no meio | Tempo limite gov.br | Salva sessão nova, refaz |

## Próximos passos (futuro)

Esse script é a **base mínima funcional**. Pra usar em produção dá pra evoluir:

1. **Parsing estruturado**: ler o HTML salvo e extrair pendências/DCTFs como JSON
2. **Persistência no Supabase**: enviar resultado pra `integracoes_logs` (precisa da SUPABASE_SERVICE_ROLE_KEY em `.env`)
3. **Agendamento**: rodar via Windows Task Scheduler 1×/dia
4. **Múltiplas empresas**: loop por procurações cadastradas
5. **Alertas**: se aparecer pendência nova, envia e-mail

# RPA e-CAC com certificado A1 do cliente

Script Node + Playwright pra acessar e-CAC autenticado **como o cliente** (usando o cert A1 dele cadastrado no Supabase). Roda **localmente no seu Windows**.

## Como funciona

1. Lista clientes que têm cert A1 com arquivo no bucket
2. Você escolhe um cliente
3. Pede a senha do .pfx
4. **Baixa o .pfx do bucket privado do Supabase pra `temp/`**
5. **Importa o cert no Windows certificate store** (CurrentUser\My)
6. Abre Chromium em modo visível
7. Navega pro e-CAC → você clica em "Seu certificado digital"
8. Windows pede pra escolher cert — **só tem 1 disponível** (o que acabou de importar)
9. Loga automaticamente, sem digitar senha de novo (Windows usa o cert)
10. Raspa Caixa Postal, Situação Fiscal, DCTFWeb, PerDComp
11. **Cleanup:** remove cert do Windows store + apaga .pfx temp

Resultados em `output/{id_cliente}-{timestamp}/`.

## Pré-requisitos

### 1. Variáveis de ambiente (`.env.local` do projeto)

```env
NEXT_PUBLIC_SUPABASE_URL=https://mwmltqaanfxjkoztgcby.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
```

**Como pegar a SERVICE_ROLE_KEY:**
- Dashboard Supabase → Settings → API → `service_role` (Show)
- ⚠️ Essa key tem **acesso total ao banco**. NUNCA comite no Git. Já está no `.gitignore`.

### 2. Node 20+ (pra suportar `--env-file`)

Verifique: `node -v`

### 3. PowerShell (Windows nativo, já tem)

### 4. Chromium do Playwright

```bash
npx playwright install chromium
```

Já foi feito quando instalou as deps.

## Uso

### Listar clientes disponíveis

```bash
npm run ecac:list
```

Saída:

```
ID-CERT          TITULAR                            EMPRESA                            VALIDADE
----------------------------------------------------------------------------------------
CRT-A3B4C5D6     JOAO JEFFERSON COSTA NUNES         João Jefferson Costa Nunes         2026-11-24
CRT-X1Y2Z3W4     JULIANA COSTA DOS SANTOS           JULIANA C D S CONSULTORIA          2027-03-15
```

### Sincronizar um cliente

```bash
npm run ecac:sync -- --cliente=CRT-A3B4C5D6
```

(use o `ID-CERT` da primeira coluna do `--list`)

Ou pode usar substring da razão social:

```bash
npm run ecac:sync -- --cliente=Juliana
```

O script:
1. Pede a senha do cert no terminal
2. Baixa, importa, abre browser
3. Você clica em "Seu certificado digital" no gov.br
4. Confirma o cert (só tem 1)
5. Aguarda raspar
6. Remove o cert do Windows ao final

### Flags úteis

- `--list` — apenas lista, não roda
- `--keep-cert` — não remove o cert do Windows ao final (útil pra debugar)

## Como o cleanup funciona

Após o script terminar (sucesso OU erro):

1. ✓ Remove o cert do Windows store (`Remove-Item Cert:\CurrentUser\My\$thumbprint`)
2. ✓ Apaga o `.pfx` temp de `scripts/ecac/temp/`

Se algo der errado e o cert ficar no Windows:

```powershell
# Lista certs no store
Get-ChildItem Cert:\CurrentUser\My

# Remove pelo thumbprint
Remove-Item Cert:\CurrentUser\My\<thumbprint>
```

Ou use a interface gráfica: `certmgr.msc` → Pessoal → Certificados.

## Output

```
scripts/ecac/output/
  CLI-C560639E-20260527-160030/
    dashboard-e-cac.png
    dashboard-e-cac.html
    dashboard-e-cac.txt
    caixa-postal.png
    caixa-postal.html
    caixa-postal.txt
    situacao-fiscal.png
    ...
```

## Adicionar/remover telas raspadas

Edite o array `telas` em `sync-ecac.mjs`:

```js
const telas = [
  {
    nome: "DCTFWeb",
    url: "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10056",
  },
];
```

IDs comuns do e-CAC (mudam às vezes):
- `10004` Situação Fiscal
- `10005` Caixa Postal
- `10056` DCTFWeb
- `10133` PerDComp Web

## Avisos importantes

- **A Receita Federal monitora RPA.** Limite declarado: 500 req/s, horário noturno pra grandes volumes. **Não rode em loop.** Use 1× por dia por cliente no máximo.
- **Cada execução importa e remove o cert do Windows.** Funciona, mas é uma operação que toca o sistema (não destrutiva, mas visível em ferramentas de monitoring).
- **Se o e-CAC mudar layout, quebra.** Você atualiza os IDs/URLs em `sync-ecac.mjs`.
- **gov.br pode bloquear acessos suspeitos.** Use com bom senso.

## Quando o script falha

| Sintoma | Causa | Solução |
|---|---|---|
| `Faltam variáveis no .env.local` | Faltou SERVICE_ROLE_KEY | Adicione no `.env.local` (não comite!) |
| `PowerShell falhou` na importação | Senha errada do .pfx | Confira no `/integracoes/certificados` |
| `Timeout login` | Demorou >5min ou cert errado | Confirma se o cert no dialog é o certo |
| Cert fica no Windows após erro | Script morreu no meio | Remova manual via `certmgr.msc` |
| Dialog do Windows pede senha pro cert | Cert importado sem senha embutida | Normal — confirma com a senha do .pfx |

## Próximos passos (futuro)

Esse script é a base. Pra evoluir:

1. **Parsing estruturado**: ler o HTML salvo e extrair dados como JSON (pendências, DCTFs, etc.)
2. **Salvar no Supabase**: enviar resultado pra `integracoes_logs` ou tabela própria de pendências
3. **Agendamento**: Windows Task Scheduler 1×/dia por cliente
4. **Alertas**: se pendência nova aparecer, e-mail/notificação
5. **Múltiplos clientes em sequência**: loop por todos os clientes ativos

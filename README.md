# JSP Contabilidade Personalizada — Painel

Sistema interno do escritório **JSP Contabilidade Personalizada** —
gestão de clientes, calendário de obrigações fiscais, recebimento de
documentos e honorários. Inclui portal externo para os clientes
acompanharem suas obrigações e documentos.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4 com paleta JSP (oliva + brass)
- Supabase (Postgres + Auth + Storage + Edge Functions)
- TanStack Query, Zustand, react-hot-toast, lucide-react, date-fns

## Setup local

```bash
npm install
cp .env.example .env.local   # já preenchido em dev
npm run dev                  # http://localhost:3003
```

## Estrutura

- `app/(public)/login` — login compartilhado
- `app/(public)/esqueci-senha`, `app/(public)/redefinir-senha` — fluxo de reset de senha
- `app/(app)/*` — área da equipe da contabilidade
- `app/(portal)/portal/*` — portal externo do cliente
- `supabase/schema.sql` + `supabase/migrations/*.sql` — schema base + migrations
- `supabase/functions/*` — Edge Functions (alertas, reset de senha admin, etc)

## Fluxos principais

### Equipe (perfil Admin / Contador / Assistente)

1. **`/inicio`** — dashboard com próximos vencimentos e cards-resumo
2. **`/clientes`** — lista; clica num cliente → `/clientes/[id]` (visão 360 com obrigações, faturas, documentos, contatos)
   - Cadastro novo: auto-busca CNPJ (BrasilAPI) e CEP (ViaCEP)
3. **`/obrigacoes`** — lista filtrada + gerador mensal (cria obrigações em lote);
   `/obrigacoes/calendario` mostra grid mensal; `/obrigacoes/[id]` tem thread de comentários
4. **`/documentos`** — lista + upload drag-and-drop (Storage privado por pasta de cliente)
5. **`/honorarios`** — faturas + gerador mensal a partir do honorário cadastrado
6. **`/produtividade`** — % entregue no prazo, ranking por responsável, clientes críticos
7. **`/usuarios`** — gestão de logins (Admin) — usa `signUp()` + restauração de sessão; tem reset de senha pelo admin (Edge Function)
8. **`/config`** — dados do escritório, upload de logo, alertas por e-mail

### Portal cliente (perfil Cliente, vinculado a 1 `id_cliente`)

1. **`/portal`** — visão geral (próximos vencimentos, faturas a pagar)
2. **`/portal/obrigacoes`** — calendário fiscal do próprio CNPJ
3. **`/portal/documentos`** — upload pra contabilidade + download dos próprios
4. **`/portal/financeiro`** — faturas em aberto e histórico

## Migrations

Rodar em ordem no SQL Editor do Supabase:

1. `supabase/schema.sql` (base)
2. `supabase/migrations/01_email_based_auth.sql` (link usuarios por email)
3. `supabase/migrations/02_configuracoes.sql` (singleton de config)
4. `supabase/migrations/03_clientes_expandido.sql` (PJ/PF + endereço + responsável)
5. `supabase/migrations/04_comentarios_obrigacoes.sql` (thread por obrigação)
6. `supabase/migrations/05_logos_bucket.sql` (bucket público de logos)

## Edge Functions

Deploy via Dashboard Supabase (Functions → Deploy new function), **JWT verification = OFF**:

| Função | Propósito | Secrets |
|---|---|---|
| `admin-reset-password` | Admin troca senha de outro user | — (usa SERVICE_ROLE já set) |
| `enviar-alertas-vencimento` | E-mail de obrigações vencendo | `RESEND_API_KEY` |
| `enviar-alertas-faturas` | E-mail de cobrança de honorários | `RESEND_API_KEY` |
| `atualizar-status-vencidos` | Marca atrasadas (cron diário) | — |

## Auth — pré-requisitos

No Dashboard Supabase:

- **Authentication → Providers → Email** → "Confirm email" **OFF** (senão signUp pede confirmação)
- **Authentication → URL Configuration** → Site URL e Redirect URLs incluindo `/redefinir-senha`

## Deploy (Vercel)

- Auto-deploy via push em `main` no GitHub (`joaojcnunes-debug/Painel-Contabil-JPS`)
- Env vars `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` setadas no projeto Vercel
- URL: https://painel-contabil-jps.vercel.app

## Convenções

- **IDs custom**: `gerarId("USR")` → `USR-A1B2C3D4`. Usado em todas as tabelas (TEXT PK).
- **Link usuários ↔ auth**: por email (não por UUID FK) — facilita criação do 1º admin.
- **RLS por email**: helpers `fn_perfil_atual()`, `fn_cliente_atual()`, `fn_is_equipe()` consultam pela coluna email do JWT.
- **`payload as never`** no `.insert()` / `.update()` — workaround do typing da supabase-js v2 com `Insert: Partial<T>`.
- **Mensagens de erro**: traduzidas em `lib/supabase/errors.ts` (Invalid login credentials → "E-mail ou senha incorretos").

# Painel Contábil Chabra

Sistema interno para escritório de contabilidade — gestão de clientes,
calendário de obrigações fiscais, recebimento de documentos e honorários.
Inclui portal externo para os clientes acompanharem suas obrigações e
documentos.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + Storage)
- TanStack Query (server cache), Zustand (user state)
- react-hot-toast, lucide-react, date-fns (pt-BR)

## Setup

```bash
npm install
cp .env.example .env.local   # já preenchido em dev
npm run dev                  # http://localhost:3003
```

## Estrutura

- `app/(public)/login` — login (interno + cliente)
- `app/(app)/*` — área da equipe da contabilidade
- `app/(portal)/portal/*` — portal externo do cliente
- `supabase/schema.sql` — schema base do banco

## Banco

Rodar `supabase/schema.sql` no SQL Editor do projeto Supabase
`mwmltqaanfxjkoztgcby`.

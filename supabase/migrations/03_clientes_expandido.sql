-- ============================================================
-- Migration 03 — Expande clientes com tipo, e-mail, endereço
-- completo e bloco de responsável legal.
-- Idempotente.
-- ============================================================

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS tipo_cadastro TEXT NOT NULL DEFAULT 'PJ'
        CHECK (tipo_cadastro IN ('PJ', 'PF')),
    ADD COLUMN IF NOT EXISTS email TEXT,
    -- Endereço
    ADD COLUMN IF NOT EXISTS cep TEXT,
    ADD COLUMN IF NOT EXISTS logradouro TEXT,
    ADD COLUMN IF NOT EXISTS numero TEXT,
    ADD COLUMN IF NOT EXISTS complemento TEXT,
    ADD COLUMN IF NOT EXISTS bairro TEXT,
    ADD COLUMN IF NOT EXISTS municipio TEXT,
    ADD COLUMN IF NOT EXISTS estado TEXT,
    -- Responsável legal (sócio principal / contato fiscal)
    ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
    ADD COLUMN IF NOT EXISTS responsavel_cpf TEXT,
    ADD COLUMN IF NOT EXISTS responsavel_email TEXT,
    ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT;

-- Backfill: clientes existentes com CNPJ ficam PJ, com CPF ficam PF
UPDATE public.clientes
SET tipo_cadastro = CASE
    WHEN cnpj IS NOT NULL AND cnpj <> '' THEN 'PJ'
    WHEN cpf IS NOT NULL AND cpf <> '' THEN 'PF'
    ELSE tipo_cadastro
END
WHERE tipo_cadastro = 'PJ';  -- só atualiza se ainda no default

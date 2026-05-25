-- ============================================================
-- Migration 01 — Refatorar usuarios para padrão "link por email"
-- (igual Painel SST). Rodar no SQL Editor sobre o banco atual.
-- Idempotente.
-- ============================================================

-- 1) Drop a FK pra auth.users (deixa usuarios independente)
ALTER TABLE public.usuarios
    DROP CONSTRAINT IF EXISTS usuarios_id_usuario_fkey;

-- 2) Muda id_usuario de UUID para TEXT (custom IDs USR-xxx)
ALTER TABLE public.usuarios
    ALTER COLUMN id_usuario TYPE TEXT USING id_usuario::TEXT;

-- 3) Index pra lookup case-insensitive por email
CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON public.usuarios (LOWER(email));

-- 4) Recria helpers usando auth.jwt() ->> 'email' (não auth.uid)
CREATE OR REPLACE FUNCTION public.fn_perfil_atual()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT perfil FROM public.usuarios
    WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION public.fn_cliente_atual()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id_cliente FROM public.usuarios
    WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION public.fn_is_equipe()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT perfil IN ('Admin','Contador','Assistente')
           FROM public.usuarios
           WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')),
        FALSE)
$$;

-- 5) Atualiza policy de usuarios pra usar email
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT
    USING (
        LOWER(email) = LOWER(auth.jwt() ->> 'email')
        OR public.fn_perfil_atual() = 'Admin'
    );

-- 6) Insere o primeiro Admin (joaojcnunes@gmail.com)
--    id_usuario custom, NÃO precisa bater com auth.users.id
INSERT INTO public.usuarios (id_usuario, email, nome, perfil, ativo)
VALUES (
    'USR-ADMIN001',
    'joaojcnunes@gmail.com',
    'João Cesar Nunes',
    'Admin',
    TRUE
)
ON CONFLICT (email) DO UPDATE
SET perfil = EXCLUDED.perfil,
    nome   = EXCLUDED.nome,
    ativo  = EXCLUDED.ativo;

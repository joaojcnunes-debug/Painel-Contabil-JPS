-- ============================================================
-- Migration 17 — Upload de certificados A1 (.pfx)
-- ============================================================
-- Modelo idêntico ao Painel SST: bucket privado + coluna do path.
-- A senha NUNCA fica armazenada — é digitada a cada uso (via form).
--
-- Idempotente.

-- ─── Coluna para o path do arquivo no bucket ──────────────
ALTER TABLE public.certificados_digitais
    ADD COLUMN IF NOT EXISTS arquivo_path TEXT;

-- ─── Bucket privado pros .pfx ──────────────────────────────
-- Não-público. Acesso só pra usuários autenticados (e RLS adicional
-- restringe a Admin/Contador via fn_is_equipe).
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados-jsp', 'certificados-jsp', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Políticas RLS do bucket ─────────────────────────────
-- DROP primeiro (idempotente) — mantém a única regra ativa.
DROP POLICY IF EXISTS "Cert read equipe"   ON storage.objects;
DROP POLICY IF EXISTS "Cert write equipe"  ON storage.objects;
DROP POLICY IF EXISTS "Cert update equipe" ON storage.objects;
DROP POLICY IF EXISTS "Cert delete equipe" ON storage.objects;

CREATE POLICY "Cert read equipe"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'certificados-jsp' AND public.fn_is_equipe());

CREATE POLICY "Cert write equipe"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'certificados-jsp' AND public.fn_is_equipe());

CREATE POLICY "Cert update equipe"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'certificados-jsp' AND public.fn_is_equipe());

CREATE POLICY "Cert delete equipe"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'certificados-jsp' AND public.fn_is_equipe());

-- Refresca o cache do PostgREST
NOTIFY pgrst, 'reload schema';

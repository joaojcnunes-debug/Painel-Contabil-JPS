-- ============================================================
-- Migration 05 — Bucket público para a logo do escritório
-- ============================================================

-- Cria o bucket "logos" público (qualquer um lê via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS — leitura pública, escrita só Admin
DROP POLICY IF EXISTS logos_select ON storage.objects;
CREATE POLICY logos_select ON storage.objects FOR SELECT
    USING (bucket_id = 'logos');

DROP POLICY IF EXISTS logos_insert ON storage.objects;
CREATE POLICY logos_insert ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'logos'
        AND public.fn_perfil_atual() = 'Admin'
    );

DROP POLICY IF EXISTS logos_update ON storage.objects;
CREATE POLICY logos_update ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'logos'
        AND public.fn_perfil_atual() = 'Admin'
    );

DROP POLICY IF EXISTS logos_delete ON storage.objects;
CREATE POLICY logos_delete ON storage.objects FOR DELETE
    USING (
        bucket_id = 'logos'
        AND public.fn_perfil_atual() = 'Admin'
    );

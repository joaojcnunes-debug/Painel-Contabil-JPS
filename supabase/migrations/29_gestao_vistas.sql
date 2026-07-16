-- Migration 29: Gestão Fase 4 — filtros salvos + preferência de visão
--
-- Duas tabelas simples, ambas "próprias" (cada usuário só vê o próprio),
-- filtro por email.

CREATE TABLE IF NOT EXISTS public.gestao_filtros_salvos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_email   TEXT NOT NULL,
  id_quadro       TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  criterios       JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_filtros_email
  ON public.gestao_filtros_salvos (LOWER(usuario_email), id_quadro);

CREATE TABLE IF NOT EXISTS public.gestao_preferencias_visao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_email   TEXT NOT NULL,
  id_quadro       TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  vista           TEXT NOT NULL DEFAULT 'quadro'
                  CHECK (vista IN ('quadro','lista','calendario','timeline','painel')),
  agrupar_por     TEXT
                  CHECK (agrupar_por IS NULL OR agrupar_por IN ('status','responsavel','prioridade','etiqueta')),
  config          JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_email, id_quadro)
);
CREATE INDEX IF NOT EXISTS idx_gestao_pref_email
  ON public.gestao_preferencias_visao (LOWER(usuario_email));

-- Touch de updated_at
DROP TRIGGER IF EXISTS trg_gestao_pref_touch ON public.gestao_preferencias_visao;
CREATE TRIGGER trg_gestao_pref_touch
  BEFORE UPDATE ON public.gestao_preferencias_visao
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_touch_updated_at();

ALTER TABLE public.gestao_filtros_salvos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_preferencias_visao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_filtros_own ON public.gestao_filtros_salvos;
CREATE POLICY gestao_filtros_own ON public.gestao_filtros_salvos FOR ALL
  USING (LOWER(usuario_email) = public.gestao_email())
  WITH CHECK (LOWER(usuario_email) = public.gestao_email());

DROP POLICY IF EXISTS gestao_pref_own ON public.gestao_preferencias_visao;
CREATE POLICY gestao_pref_own ON public.gestao_preferencias_visao FOR ALL
  USING (LOWER(usuario_email) = public.gestao_email())
  WITH CHECK (LOWER(usuario_email) = public.gestao_email());

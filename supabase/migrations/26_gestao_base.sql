-- Migration 26: Módulo Gestão — schema base (Fase 1 parte 1/2)
--
-- Port do módulo /gestao do painel-sst pra painel-contabil. Estrutura de
-- gerenciamento estilo ClickUp/Asana: Espaço → Pasta → Quadro → Tarefa.
--
-- Esta migration cria APENAS o schema base + trigger de seed. RLS e permissões
-- ficam na migration 27 (que depende das funções gestao_pode_ver/editar_q).
-- Enquanto a 27 não roda, todas as tabelas ficam sem policy — seguras porque
-- RLS está enabled + default-deny.
--
-- Escopo desta migration:
--   Enums (nivel, recurso, papel, acao)
--   Tabelas: espacos, pastas, quadros, status, tarefas
--   Trigger seed dos 4 status ao criar quadro
--   updated_at auto-managed

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.gestao_nivel AS ENUM ('view', 'comment', 'edit', 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gestao_recurso AS ENUM ('space', 'folder', 'list', 'task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gestao_papel AS ENUM ('owner', 'admin', 'membro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gestao_acao AS ENUM (
    'concedeu', 'revogou', 'alterou_nivel', 'convidou', 'removeu', 'alterou_papel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Helper genérico: atualiza updated_at nos UPDATEs
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gestao_touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABELAS BASE
-- ============================================================

-- Espaços (nível 1) — cor de identificação, ordem manual
CREATE TABLE IF NOT EXISTS public.gestao_espacos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  cor         TEXT NOT NULL DEFAULT '#006B54',
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestao_espacos_ordem
  ON public.gestao_espacos (ordem);

DROP TRIGGER IF EXISTS trg_gestao_espacos_touch ON public.gestao_espacos;
CREATE TRIGGER trg_gestao_espacos_touch
  BEFORE UPDATE ON public.gestao_espacos
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_touch_updated_at();

-- Pastas (nível 2) — dentro de um espaço
CREATE TABLE IF NOT EXISTS public.gestao_pastas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_espaco   UUID NOT NULL REFERENCES public.gestao_espacos(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestao_pastas_espaco
  ON public.gestao_pastas (id_espaco, ordem);

DROP TRIGGER IF EXISTS trg_gestao_pastas_touch ON public.gestao_pastas;
CREATE TRIGGER trg_gestao_pastas_touch
  BEFORE UPDATE ON public.gestao_pastas
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_touch_updated_at();

-- Quadros (a Lista) — onde vivem as tarefas
CREATE TABLE IF NOT EXISTS public.gestao_quadros (
  id_quadro    TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  descricao    TEXT,
  id_espaco    UUID REFERENCES public.gestao_espacos(id) ON DELETE SET NULL,
  id_pasta     UUID REFERENCES public.gestao_pastas(id) ON DELETE SET NULL,
  ordem        INT NOT NULL DEFAULT 0,
  ics_token    TEXT UNIQUE,             -- token público pra feed ICS (Fase 6)
  restrito     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   TEXT,                    -- email do criador
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestao_quadros_espaco
  ON public.gestao_quadros (id_espaco, ordem);
CREATE INDEX IF NOT EXISTS idx_gestao_quadros_pasta
  ON public.gestao_quadros (id_pasta, ordem);

DROP TRIGGER IF EXISTS trg_gestao_quadros_touch ON public.gestao_quadros;
CREATE TRIGGER trg_gestao_quadros_touch
  BEFORE UPDATE ON public.gestao_quadros
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_touch_updated_at();

-- Status por quadro — semeados por trigger (A_FAZER, EM_ANDAMENTO, EM_REVISAO, CONCLUIDO)
CREATE TABLE IF NOT EXISTS public.gestao_status (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro   TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  slug        TEXT NOT NULL,             -- estável (referenciado em tarefas)
  nome        TEXT NOT NULL,
  cor         TEXT NOT NULL DEFAULT '#94a3b8',
  ordem       INT NOT NULL DEFAULT 0,
  tipo        TEXT NOT NULL DEFAULT 'ativo' CHECK (tipo IN ('nao_iniciado', 'ativo', 'concluido')),
  UNIQUE (id_quadro, slug)
);

CREATE INDEX IF NOT EXISTS idx_gestao_status_quadro
  ON public.gestao_status (id_quadro, ordem);

-- Tarefas
CREATE TABLE IF NOT EXISTS public.gestao_tarefas (
  id_tarefa    TEXT PRIMARY KEY,
  id_quadro    TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  status       TEXT NOT NULL DEFAULT 'A_FAZER',       -- slug de gestao_status
  prioridade   TEXT NOT NULL DEFAULT 'Media' CHECK (prioridade IN ('Baixa', 'Media', 'Alta', 'Urgente')),
  responsavel  TEXT,                                   -- email
  data_inicio  DATE,
  prazo        DATE,
  ordem        INT NOT NULL DEFAULT 0,
  etiquetas    TEXT[] NOT NULL DEFAULT '{}',           -- nomes (não FK — o catálogo é livre)
  subtarefas   JSONB NOT NULL DEFAULT '[]',
  campos       JSONB NOT NULL DEFAULT '{}',            -- valores dos campos personalizados
  recorrencia  JSONB,                                  -- {tipo, intervalo, proxima_geracao}
  pontos       INT,
  created_by   TEXT,                                   -- email
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestao_tarefas_quadro
  ON public.gestao_tarefas (id_quadro);
CREATE INDEX IF NOT EXISTS idx_gestao_tarefas_status
  ON public.gestao_tarefas (id_quadro, status);
CREATE INDEX IF NOT EXISTS idx_gestao_tarefas_responsavel
  ON public.gestao_tarefas (responsavel);
CREATE INDEX IF NOT EXISTS idx_gestao_tarefas_prazo
  ON public.gestao_tarefas (prazo)
  WHERE prazo IS NOT NULL;

DROP TRIGGER IF EXISTS trg_gestao_tarefas_touch ON public.gestao_tarefas;
CREATE TRIGGER trg_gestao_tarefas_touch
  BEFORE UPDATE ON public.gestao_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_touch_updated_at();

-- ============================================================
-- TRIGGER: semeia 4 status default ao criar quadro
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gestao_seed_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.gestao_status (id_quadro, slug, nome, cor, ordem, tipo)
    VALUES
      (NEW.id_quadro, 'A_FAZER', 'A fazer', '#94a3b8', 0, 'nao_iniciado'),
      (NEW.id_quadro, 'EM_ANDAMENTO', 'Em andamento', '#3B82F6', 1, 'ativo'),
      (NEW.id_quadro, 'EM_REVISAO', 'Em revisão', '#A855F7', 2, 'ativo'),
      (NEW.id_quadro, 'CONCLUIDO', 'Concluído', '#22C55E', 3, 'concluido')
    ON CONFLICT (id_quadro, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_seed_status ON public.gestao_quadros;
CREATE TRIGGER trg_gestao_seed_status
  AFTER INSERT ON public.gestao_quadros
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_seed_status();

-- ============================================================
-- RLS: ENABLE sem policies ainda — default deny.
-- A migration 27 (permissões) adiciona as policies.
-- ============================================================
ALTER TABLE public.gestao_espacos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_quadros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_tarefas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gestao_espacos IS 'Módulo Gestão — nível 1 da hierarquia. Espaços agrupam pastas/quadros por área do escritório.';
COMMENT ON TABLE public.gestao_quadros IS 'Módulo Gestão — a "Lista" (equivalente ao Board do ClickUp). Onde vivem tarefas, status e (nas próximas fases) campos, etiquetas, automações.';
COMMENT ON TABLE public.gestao_tarefas IS 'Módulo Gestão — tarefas individuais. Status é slug (referencia gestao_status), etiquetas são nomes livres, campos personalizados em JSONB.';

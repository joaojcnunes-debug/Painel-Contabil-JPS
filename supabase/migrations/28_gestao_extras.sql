-- Migration 28: Gestão Fase 3 — campos personalizados + etiquetas + comentários + anexos
--
-- Adiciona 4 tabelas + bucket "anexos" pra suportar tarefas mais ricas.

-- ============================================================
-- CAMPOS PERSONALIZADOS por quadro
-- Tipos: texto | numero | data | selecao | multi | checkbox | moeda | url
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_campos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro         TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN (
    'texto','numero','data','selecao','multi','checkbox','moeda','url'
  )),
  opcoes            TEXT[] NOT NULL DEFAULT '{}',
  ordem             INT NOT NULL DEFAULT 0,
  visivel_cliente   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_quadro, nome)
);
CREATE INDEX IF NOT EXISTS idx_gestao_campos_quadro ON public.gestao_campos (id_quadro, ordem);

-- ============================================================
-- ETIQUETAS (catálogo com cor por quadro)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_etiquetas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro    TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  cor          TEXT NOT NULL DEFAULT '#94a3b8',
  ordem        INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_quadro, nome)
);
CREATE INDEX IF NOT EXISTS idx_gestao_etiquetas_quadro ON public.gestao_etiquetas (id_quadro, ordem);

-- ============================================================
-- COMENTÁRIOS por tarefa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_comentarios (
  id_comentario  TEXT PRIMARY KEY,
  id_tarefa      TEXT NOT NULL REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  autor          TEXT NOT NULL,                -- email
  texto          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_coment_tarefa
  ON public.gestao_comentarios (id_tarefa, created_at);

-- ============================================================
-- ANEXOS por tarefa (arquivo no bucket "anexos")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_anexos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa      TEXT NOT NULL REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  storage_path   TEXT NOT NULL,                -- gestao/<id_tarefa>/<uuid>-<nome>
  mime           TEXT,
  tamanho_bytes  INT,
  created_by     TEXT,                          -- email
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_anexos_tarefa
  ON public.gestao_anexos (id_tarefa, created_at DESC);

-- ============================================================
-- BUCKET "anexos" (privado). Path: gestao/<id_tarefa>/<uuid>-<nome>
-- Acesso: qualquer membro ativo do módulo Gestão pode ler/escrever
-- (o portão é gestao_papel_de). Delete restrito ao criador ou gestor.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('anexos', 'anexos', FALSE)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS gestao_anexos_read ON storage.objects;
CREATE POLICY gestao_anexos_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'anexos'
    AND public.gestao_papel_de(public.gestao_email()) IS NOT NULL
  );

DROP POLICY IF EXISTS gestao_anexos_write ON storage.objects;
CREATE POLICY gestao_anexos_write ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'anexos'
    AND public.gestao_papel_de(public.gestao_email()) IS NOT NULL
  );

DROP POLICY IF EXISTS gestao_anexos_delete ON storage.objects;
CREATE POLICY gestao_anexos_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'anexos'
    AND (
      owner::text = auth.uid()::text
      OR public.gestao_eh_gestor(public.gestao_email())
    )
  );

-- ============================================================
-- RLS das 4 tabelas — herda de gestao_pode_ver/editar_q via join
-- (via subquery pra evitar recursão)
-- ============================================================
ALTER TABLE public.gestao_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_campos_select ON public.gestao_campos;
CREATE POLICY gestao_campos_select ON public.gestao_campos FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));
DROP POLICY IF EXISTS gestao_campos_write ON public.gestao_campos;
CREATE POLICY gestao_campos_write ON public.gestao_campos FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

DROP POLICY IF EXISTS gestao_etiquetas_select ON public.gestao_etiquetas;
CREATE POLICY gestao_etiquetas_select ON public.gestao_etiquetas FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));
DROP POLICY IF EXISTS gestao_etiquetas_write ON public.gestao_etiquetas;
CREATE POLICY gestao_etiquetas_write ON public.gestao_etiquetas FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

-- Comentários e anexos: acesso deriva do quadro da tarefa
DROP POLICY IF EXISTS gestao_comentarios_select ON public.gestao_comentarios;
CREATE POLICY gestao_comentarios_select ON public.gestao_comentarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_comentarios.id_tarefa
         AND public.gestao_pode_ver(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_comentarios_insert ON public.gestao_comentarios;
CREATE POLICY gestao_comentarios_insert ON public.gestao_comentarios FOR INSERT
  WITH CHECK (
    LOWER(autor) = public.gestao_email()
    AND EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_comentarios.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_comentarios_delete ON public.gestao_comentarios;
CREATE POLICY gestao_comentarios_delete ON public.gestao_comentarios FOR DELETE
  USING (
    LOWER(autor) = public.gestao_email()
    OR public.gestao_eh_gestor(public.gestao_email())
  );

DROP POLICY IF EXISTS gestao_anexos_select ON public.gestao_anexos;
CREATE POLICY gestao_anexos_select ON public.gestao_anexos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_anexos.id_tarefa
         AND public.gestao_pode_ver(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_anexos_write ON public.gestao_anexos;
CREATE POLICY gestao_anexos_write ON public.gestao_anexos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_anexos.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_anexos.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  );

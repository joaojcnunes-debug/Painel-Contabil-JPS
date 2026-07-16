-- Migration 30: Gestão Fase 5 — notificações + tempo + dependências + atividades
--
-- Tudo interno ao módulo. Notificação é in-app (o sino existente puxa).
-- Tempo tem cronômetro (fim IS NULL = rodando) e apontamento manual.
-- Dependência tem trigger anti-ciclo (CTE recursiva) — bloqueia loops.
-- Atividades = log append-only pro histórico da tarefa.

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_notificacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario     TEXT NOT NULL,                  -- email
  tipo             TEXT NOT NULL CHECK (tipo IN (
    'atribuicao', 'comentario', 'mencao', 'status', 'prazo'
  )),
  titulo           TEXT NOT NULL,
  id_tarefa        TEXT REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  id_quadro        TEXT REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  lida             BOOLEAN NOT NULL DEFAULT FALSE,
  canal            TEXT NOT NULL DEFAULT 'in_app',
  email_enviado    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_notif_destinatario
  ON public.gestao_notificacoes (LOWER(destinatario), lida, created_at DESC);

ALTER TABLE public.gestao_notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_notif_own ON public.gestao_notificacoes;
CREATE POLICY gestao_notif_own ON public.gestao_notificacoes FOR SELECT
  USING (LOWER(destinatario) = public.gestao_email());
DROP POLICY IF EXISTS gestao_notif_update_own ON public.gestao_notificacoes;
CREATE POLICY gestao_notif_update_own ON public.gestao_notificacoes FOR UPDATE
  USING (LOWER(destinatario) = public.gestao_email());
-- INSERT feito só pelos triggers/RPCs (security definer)

-- ============================================================
-- TEMPO (cronômetro + apontamento manual)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_tempo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa      TEXT NOT NULL REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  usuario_email  TEXT NOT NULL,
  inicio         TIMESTAMPTZ NOT NULL,
  fim            TIMESTAMPTZ,                     -- NULL = rodando
  segundos       INT,
  manual         BOOLEAN NOT NULL DEFAULT FALSE,
  descricao      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_tempo_tarefa
  ON public.gestao_tempo (id_tarefa, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_gestao_tempo_usuario_ativo
  ON public.gestao_tempo (LOWER(usuario_email))
  WHERE fim IS NULL;

ALTER TABLE public.gestao_tempo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_tempo_select ON public.gestao_tempo;
CREATE POLICY gestao_tempo_select ON public.gestao_tempo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_tempo.id_tarefa
         AND public.gestao_pode_ver(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_tempo_write ON public.gestao_tempo;
CREATE POLICY gestao_tempo_write ON public.gestao_tempo FOR ALL
  USING (
    LOWER(usuario_email) = public.gestao_email()
    AND EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_tempo.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  )
  WITH CHECK (
    LOWER(usuario_email) = public.gestao_email()
    AND EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_tempo.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  );

-- Trigger que calcula segundos ao fechar o registro
CREATE OR REPLACE FUNCTION public.fn_gestao_tempo_seg()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fim IS NOT NULL AND NEW.inicio IS NOT NULL THEN
    NEW.segundos := GREATEST(0, EXTRACT(EPOCH FROM (NEW.fim - NEW.inicio))::INT);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_tempo_seg ON public.gestao_tempo;
CREATE TRIGGER trg_gestao_tempo_seg
  BEFORE INSERT OR UPDATE ON public.gestao_tempo
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_tempo_seg();

-- ============================================================
-- DEPENDÊNCIAS entre tarefas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_dependencias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa    TEXT NOT NULL REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  depende_de   TEXT NOT NULL REFERENCES public.gestao_tarefas(id_tarefa) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_tarefa, depende_de),
  CHECK (id_tarefa <> depende_de)
);
CREATE INDEX IF NOT EXISTS idx_gestao_dep_tarefa
  ON public.gestao_dependencias (id_tarefa);
CREATE INDEX IF NOT EXISTS idx_gestao_dep_reverso
  ON public.gestao_dependencias (depende_de);

ALTER TABLE public.gestao_dependencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_dep_select ON public.gestao_dependencias;
CREATE POLICY gestao_dep_select ON public.gestao_dependencias FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_dependencias.id_tarefa
         AND public.gestao_pode_ver(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_dep_write ON public.gestao_dependencias;
CREATE POLICY gestao_dep_write ON public.gestao_dependencias FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_dependencias.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_dependencias.id_tarefa
         AND public.gestao_pode_editar_q(t.id_quadro)
    )
  );

-- Anti-ciclo: rejeita insert que criaria um loop na relação de dependência.
CREATE OR REPLACE FUNCTION public.fn_gestao_dep_no_cycle()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cycle BOOLEAN;
BEGIN
  -- Ao inserir A depende_de B, verifica se B (transitivamente) já depende de A.
  -- Se sim, criaria ciclo.
  WITH RECURSIVE cadeia AS (
    SELECT depende_de FROM public.gestao_dependencias WHERE id_tarefa = NEW.depende_de
    UNION
    SELECT d.depende_de
      FROM public.gestao_dependencias d
      JOIN cadeia c ON d.id_tarefa = c.depende_de
  )
  SELECT EXISTS (SELECT 1 FROM cadeia WHERE depende_de = NEW.id_tarefa)
    INTO v_cycle;

  IF v_cycle THEN
    RAISE EXCEPTION 'Dependência criaria ciclo (A→B→…→A) — negada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_dep_no_cycle ON public.gestao_dependencias;
CREATE TRIGGER trg_gestao_dep_no_cycle
  BEFORE INSERT ON public.gestao_dependencias
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_dep_no_cycle();

-- ============================================================
-- ATIVIDADES (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_atividades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator       TEXT,                                 -- email
  acao       TEXT NOT NULL,                        -- ex: "criou_tarefa", "mudou_status"
  id_tarefa  TEXT,
  payload    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_atividades_tarefa
  ON public.gestao_atividades (id_tarefa, created_at DESC);

ALTER TABLE public.gestao_atividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_atividades_select ON public.gestao_atividades;
CREATE POLICY gestao_atividades_select ON public.gestao_atividades FOR SELECT
  USING (
    id_tarefa IS NULL
    OR EXISTS (
      SELECT 1 FROM public.gestao_tarefas t
       WHERE t.id_tarefa = gestao_atividades.id_tarefa
         AND public.gestao_pode_ver(t.id_quadro)
    )
  );
DROP POLICY IF EXISTS gestao_atividades_insert ON public.gestao_atividades;
CREATE POLICY gestao_atividades_insert ON public.gestao_atividades FOR INSERT
  WITH CHECK (LOWER(COALESCE(ator, '')) = public.gestao_email());

-- ============================================================
-- TRIGGERS DE NOTIFICAÇÃO AUTOMÁTICA
-- ============================================================

-- Ao MUDAR responsável ou STATUS, notifica o novo responsável
CREATE OR REPLACE FUNCTION public.fn_gestao_notif_tarefa()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_titulo TEXT;
BEGIN
  -- Mudou responsável
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.responsavel, '') <> COALESCE(OLD.responsavel, '') THEN
    IF NEW.responsavel IS NOT NULL AND NEW.responsavel <> '' THEN
      INSERT INTO public.gestao_notificacoes
        (destinatario, tipo, titulo, id_tarefa, id_quadro)
        VALUES (
          NEW.responsavel, 'atribuicao',
          format('Você foi atribuído: %s', NEW.titulo),
          NEW.id_tarefa, NEW.id_quadro
        );
    END IF;
  END IF;

  -- Mudou status — notifica quem é responsável hoje (se tiver)
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.status, '') <> COALESCE(OLD.status, '')
     AND NEW.responsavel IS NOT NULL AND NEW.responsavel <> ''
     AND LOWER(NEW.responsavel) <> public.gestao_email()  -- não notifica quem fez a ação
  THEN
    INSERT INTO public.gestao_notificacoes
      (destinatario, tipo, titulo, id_tarefa, id_quadro)
      VALUES (
        NEW.responsavel, 'status',
        format('Status alterado (%s → %s): %s', OLD.status, NEW.status, NEW.titulo),
        NEW.id_tarefa, NEW.id_quadro
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_notif_tarefa ON public.gestao_tarefas;
CREATE TRIGGER trg_gestao_notif_tarefa
  AFTER INSERT OR UPDATE ON public.gestao_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_notif_tarefa();

-- Ao inserir COMENTÁRIO, notifica responsável + menções (extraídas do texto)
CREATE OR REPLACE FUNCTION public.fn_gestao_notif_comentario()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_tarefa RECORD;
  v_email  TEXT;
BEGIN
  SELECT id_quadro, responsavel, titulo
    INTO v_tarefa
    FROM public.gestao_tarefas
   WHERE id_tarefa = NEW.id_tarefa;

  -- Notifica responsável (se não é ele mesmo comentando)
  IF v_tarefa.responsavel IS NOT NULL
     AND LOWER(v_tarefa.responsavel) <> LOWER(NEW.autor) THEN
    INSERT INTO public.gestao_notificacoes
      (destinatario, tipo, titulo, id_tarefa, id_quadro)
      VALUES (
        v_tarefa.responsavel, 'comentario',
        format('Novo comentário em: %s', v_tarefa.titulo),
        NEW.id_tarefa, v_tarefa.id_quadro
      );
  END IF;

  -- Notifica menções @email no texto
  FOR v_email IN
    SELECT DISTINCT LOWER((regexp_matches(NEW.texto, '@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 'g'))[1])
  LOOP
    IF v_email <> LOWER(NEW.autor) THEN
      INSERT INTO public.gestao_notificacoes
        (destinatario, tipo, titulo, id_tarefa, id_quadro)
        VALUES (
          v_email, 'mencao',
          format('Você foi mencionado em: %s', v_tarefa.titulo),
          NEW.id_tarefa, v_tarefa.id_quadro
        );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_notif_coment ON public.gestao_comentarios;
CREATE TRIGGER trg_gestao_notif_coment
  AFTER INSERT ON public.gestao_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_gestao_notif_comentario();

-- ============================================================
-- RPC pra checar se tarefa pode concluir (dependências fechadas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.gestao_pode_concluir(p_id_tarefa TEXT)
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_concluidos_slugs TEXT[];
  v_id_quadro TEXT;
BEGIN
  SELECT id_quadro INTO v_id_quadro FROM public.gestao_tarefas WHERE id_tarefa = p_id_tarefa;
  IF v_id_quadro IS NULL THEN RETURN TRUE; END IF;

  SELECT COALESCE(array_agg(slug), '{}') INTO v_concluidos_slugs
    FROM public.gestao_status
   WHERE id_quadro = v_id_quadro AND tipo = 'concluido';

  RETURN NOT EXISTS (
    SELECT 1 FROM public.gestao_dependencias d
      JOIN public.gestao_tarefas t ON t.id_tarefa = d.depende_de
     WHERE d.id_tarefa = p_id_tarefa
       AND NOT (t.status = ANY(v_concluidos_slugs))
  );
END;
$$;

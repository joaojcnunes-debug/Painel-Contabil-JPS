-- Migration 31: Gestão Fase 6 — automações + formulários públicos
--
-- Motor de automações no Postgres. Cada quadro pode ter N automações
-- "quando → então". Gatilhos: status_muda, tarefa_criada, prazo_proximo,
-- prazo_vencido. Ações: mover_status, definir_responsavel, definir_prioridade,
-- definir_campo, notificar.
--
-- Guarda de recursão via GUC gestao.in_automacao (evita loop se ação
-- modifica a tarefa e re-dispara).
--
-- Formulários públicos: quadro pode expor URL /f/<token> que aceita
-- submissão anônima (via Edge Function gestao-form-submit) e cria tarefa.

-- ============================================================
-- AUTOMAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_automacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro   TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  gatilho     TEXT NOT NULL CHECK (gatilho IN (
    'status_muda','tarefa_criada','prazo_proximo','prazo_vencido'
  )),
  condicao    JSONB NOT NULL DEFAULT '{}',
  acao        JSONB NOT NULL DEFAULT '{}',
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_auto_quadro
  ON public.gestao_automacoes (id_quadro, ativo, ordem);

CREATE TABLE IF NOT EXISTS public.gestao_automacao_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_automacao   UUID REFERENCES public.gestao_automacoes(id) ON DELETE SET NULL,
  id_tarefa      TEXT,
  gatilho        TEXT NOT NULL,
  resultado      TEXT NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok','skip','erro')),
  detalhe        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_auto_log_created
  ON public.gestao_automacao_log (created_at DESC);

ALTER TABLE public.gestao_automacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_automacao_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_auto_select ON public.gestao_automacoes;
CREATE POLICY gestao_auto_select ON public.gestao_automacoes FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));
DROP POLICY IF EXISTS gestao_auto_write ON public.gestao_automacoes;
CREATE POLICY gestao_auto_write ON public.gestao_automacoes FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

DROP POLICY IF EXISTS gestao_auto_log_select ON public.gestao_automacao_log;
CREATE POLICY gestao_auto_log_select ON public.gestao_automacao_log FOR SELECT
  USING (public.gestao_eh_gestor(public.gestao_email()));

-- ============================================================
-- FORMULÁRIOS PÚBLICOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gestao_formularios (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro             TEXT NOT NULL REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  titulo                TEXT NOT NULL,
  descricao             TEXT,
  token                 TEXT NOT NULL UNIQUE,
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  mostra_descricao      BOOLEAN NOT NULL DEFAULT TRUE,
  mostra_prazo          BOOLEAN NOT NULL DEFAULT FALSE,
  mostra_prioridade     BOOLEAN NOT NULL DEFAULT FALSE,
  prioridade_padrao     TEXT NOT NULL DEFAULT 'Media',
  status_inicial        TEXT,
  responsavel_padrao    TEXT,
  etiquetas_padrao      TEXT[] NOT NULL DEFAULT '{}',
  perguntas             JSONB NOT NULL DEFAULT '[]',
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_form_quadro ON public.gestao_formularios (id_quadro);

ALTER TABLE public.gestao_formularios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestao_form_select ON public.gestao_formularios;
CREATE POLICY gestao_form_select ON public.gestao_formularios FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));
DROP POLICY IF EXISTS gestao_form_write ON public.gestao_formularios;
CREATE POLICY gestao_form_write ON public.gestao_formularios FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

-- ============================================================
-- MOTOR DE AUTOMAÇÕES
-- ============================================================

-- Aplica UMA ação de UMA automação sobre UMA tarefa
CREATE OR REPLACE FUNCTION public.gestao_automacao_aplicar(
  p_autom  public.gestao_automacoes,
  p_tarefa public.gestao_tarefas,
  p_gatilho TEXT
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_acao TEXT := p_autom.acao ->> 'tipo';
  v_val  TEXT;
  v_erro TEXT;
BEGIN
  BEGIN
    -- Marca que estamos dentro de automação pra evitar recursão
    PERFORM set_config('gestao.in_automacao', '1', TRUE);

    IF v_acao = 'mover_status' THEN
      v_val := p_autom.acao ->> 'valor';
      UPDATE public.gestao_tarefas SET status = v_val WHERE id_tarefa = p_tarefa.id_tarefa;
    ELSIF v_acao = 'definir_responsavel' THEN
      v_val := p_autom.acao ->> 'valor';
      UPDATE public.gestao_tarefas SET responsavel = v_val WHERE id_tarefa = p_tarefa.id_tarefa;
    ELSIF v_acao = 'definir_prioridade' THEN
      v_val := p_autom.acao ->> 'valor';
      UPDATE public.gestao_tarefas SET prioridade = v_val WHERE id_tarefa = p_tarefa.id_tarefa;
    ELSIF v_acao = 'definir_campo' THEN
      -- acao.valor = { nome: 'X', valor: <qualquer> }
      UPDATE public.gestao_tarefas
         SET campos = jsonb_set(
           campos,
           ARRAY[(p_autom.acao -> 'valor' ->> 'nome')],
           COALESCE(p_autom.acao -> 'valor' -> 'valor', 'null'::jsonb)
         )
       WHERE id_tarefa = p_tarefa.id_tarefa;
    ELSIF v_acao = 'notificar' THEN
      -- Envia notificação in-app pro responsável da tarefa (ou destinatário fixo)
      INSERT INTO public.gestao_notificacoes
        (destinatario, tipo, titulo, id_tarefa, id_quadro)
        VALUES (
          COALESCE(p_autom.acao ->> 'para', p_tarefa.responsavel),
          'atribuicao',
          COALESCE(
            p_autom.acao ->> 'mensagem',
            format('Automação "%s": %s', p_autom.nome, p_tarefa.titulo)
          ),
          p_tarefa.id_tarefa, p_tarefa.id_quadro
        );
    ELSE
      RAISE EXCEPTION 'Tipo de ação desconhecido: %', v_acao;
    END IF;

    INSERT INTO public.gestao_automacao_log
      (id_automacao, id_tarefa, gatilho, resultado, detalhe)
      VALUES (p_autom.id, p_tarefa.id_tarefa, p_gatilho, 'ok', v_acao || ' → ' || COALESCE(v_val, ''));
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM;
    INSERT INTO public.gestao_automacao_log
      (id_automacao, id_tarefa, gatilho, resultado, detalhe)
      VALUES (p_autom.id, p_tarefa.id_tarefa, p_gatilho, 'erro', v_erro);
    RAISE NOTICE 'Automacao % erro: %', p_autom.id, v_erro;
  END;
END;
$$;

-- Itera automações ativas do quadro por gatilho, checa condição de/para
CREATE OR REPLACE FUNCTION public.gestao_automacao_run(
  p_id_tarefa TEXT,
  p_gatilho   TEXT,
  p_de        TEXT DEFAULT NULL,
  p_para      TEXT DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_tarefa public.gestao_tarefas;
  v_auto   public.gestao_automacoes;
  v_ok     BOOLEAN;
BEGIN
  -- Não roda se já estamos dentro de outra automação (guarda)
  IF current_setting('gestao.in_automacao', TRUE) = '1' THEN
    RETURN;
  END IF;

  SELECT * INTO v_tarefa FROM public.gestao_tarefas WHERE id_tarefa = p_id_tarefa;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_auto IN
    SELECT * FROM public.gestao_automacoes
     WHERE id_quadro = v_tarefa.id_quadro
       AND ativo = TRUE
       AND gatilho = p_gatilho
     ORDER BY ordem, created_at
  LOOP
    v_ok := TRUE;
    -- Checa condição opcional de/para no gatilho status_muda
    IF p_gatilho = 'status_muda' THEN
      IF v_auto.condicao ? 'de' AND (v_auto.condicao ->> 'de') <> COALESCE(p_de, '') THEN
        v_ok := FALSE;
      END IF;
      IF v_ok AND v_auto.condicao ? 'para' AND (v_auto.condicao ->> 'para') <> COALESCE(p_para, '') THEN
        v_ok := FALSE;
      END IF;
    END IF;

    IF v_ok THEN
      PERFORM public.gestao_automacao_aplicar(v_auto, v_tarefa, p_gatilho);
    END IF;
  END LOOP;
END;
$$;

-- Trigger em gestao_tarefas: dispara status_muda e tarefa_criada
CREATE OR REPLACE FUNCTION public.gestao_automacao_trg()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      PERFORM public.gestao_automacao_run(NEW.id_tarefa, 'tarefa_criada');
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- Automação nunca falha o save
    END;
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    BEGIN
      PERFORM public.gestao_automacao_run(NEW.id_tarefa, 'status_muda', OLD.status, NEW.status);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_automacao ON public.gestao_tarefas;
CREATE TRIGGER trg_gestao_automacao
  AFTER INSERT OR UPDATE ON public.gestao_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.gestao_automacao_trg();

-- Cron pra gatilhos temporais (prazo_proximo/prazo_vencido)
CREATE OR REPLACE FUNCTION public.gestao_automacao_prazos()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_auto   public.gestao_automacoes;
  v_tarefa public.gestao_tarefas;
  v_dias   INT;
  v_alvo   DATE;
  v_hoje   DATE := CURRENT_DATE;
  v_ja_disparado INT;
BEGIN
  -- prazo_proximo (usa condicao.dias_antes, default 3)
  FOR v_auto IN
    SELECT * FROM public.gestao_automacoes
     WHERE ativo = TRUE AND gatilho = 'prazo_proximo'
  LOOP
    v_dias := COALESCE((v_auto.condicao ->> 'dias_antes')::INT, 3);
    v_alvo := v_hoje + v_dias;
    FOR v_tarefa IN
      SELECT * FROM public.gestao_tarefas
       WHERE id_quadro = v_auto.id_quadro
         AND prazo = v_alvo
    LOOP
      -- Dedup: só dispara 1x/dia por (auto, tarefa)
      SELECT COUNT(*) INTO v_ja_disparado
        FROM public.gestao_automacao_log
       WHERE id_automacao = v_auto.id
         AND id_tarefa = v_tarefa.id_tarefa
         AND created_at::date = v_hoje;
      IF v_ja_disparado = 0 THEN
        PERFORM public.gestao_automacao_aplicar(v_auto, v_tarefa, 'prazo_proximo');
      END IF;
    END LOOP;
  END LOOP;

  -- prazo_vencido (dispara 1x quando passa)
  FOR v_auto IN
    SELECT * FROM public.gestao_automacoes
     WHERE ativo = TRUE AND gatilho = 'prazo_vencido'
  LOOP
    FOR v_tarefa IN
      SELECT * FROM public.gestao_tarefas
       WHERE id_quadro = v_auto.id_quadro
         AND prazo < v_hoje
         AND status NOT IN (SELECT slug FROM public.gestao_status WHERE id_quadro = v_auto.id_quadro AND tipo = 'concluido')
    LOOP
      SELECT COUNT(*) INTO v_ja_disparado
        FROM public.gestao_automacao_log
       WHERE id_automacao = v_auto.id
         AND id_tarefa = v_tarefa.id_tarefa
         AND resultado = 'ok';
      IF v_ja_disparado = 0 THEN
        PERFORM public.gestao_automacao_aplicar(v_auto, v_tarefa, 'prazo_vencido');
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.gestao_automacao_log (gatilho, resultado, detalhe)
    VALUES ('tick', 'ok', 'gestao_automacao_prazos() executado');
END;
$$;

-- Agenda cron pra rodar às 6h05 UTC (3h05 Brasília — bem antes do dia útil)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gestao-automacao-prazos') THEN
    PERFORM cron.unschedule('gestao-automacao-prazos');
  END IF;
END $$;
SELECT cron.schedule(
  'gestao-automacao-prazos',
  '5 6 * * *',
  $CRON$ SELECT public.gestao_automacao_prazos(); $CRON$
);

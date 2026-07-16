-- Migration 27: Módulo Gestão — permissões + membership + RLS (Fase 1 parte 2/2)
--
-- Modelo em 2 eixos:
--   Eixo 1 (portão): tabela gestao_membros — quem PODE ENTRAR no módulo.
--   Eixo 2 (por recurso): tabela gestao_acessos — grants por Espaço/Pasta/Lista/Task
--     com 4 níveis (view/comment/edit/full), herança task > list > folder > space
--     e flag restritivo (rebaixa o teto).
--
-- Adaptações vs painel-sst:
--   - Substitui caller_pode_editar() / caller_eh_admin() por fn_is_equipe() e
--     fn_perfil_atual() = 'Admin' (o padrão local).
--   - Substitui auth.uid() por lower(auth.jwt() ->> 'email') (nada é uuid,
--     tudo é email — igual ao painel-contabil já faz nas outras tabelas).
--
-- Regras principais:
--   Admin do sistema (fn_perfil_atual='Admin') → tratado como owner (bypass).
--   Não-membro ativo → gestao_papel_de = NULL → não entra.
--   Lista aberta + membro sem grant explícito ⇒ edit (colaborativo).
--   Lista restrita sem grant ⇒ sem acesso.
--   Space/folder sem grant ⇒ view.

-- ============================================================
-- TABELAS DE PERMISSÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gestao_membros (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_email  TEXT NOT NULL,
  papel          public.gestao_papel NOT NULL DEFAULT 'membro',
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  adicionado_por TEXT,                                    -- email
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gestao_membros_email
  ON public.gestao_membros (LOWER(usuario_email));

CREATE INDEX IF NOT EXISTS idx_gestao_membros_ativo
  ON public.gestao_membros (ativo)
  WHERE ativo = TRUE;

CREATE TABLE IF NOT EXISTS public.gestao_acessos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_quadro      TEXT REFERENCES public.gestao_quadros(id_quadro) ON DELETE CASCADE,
  usuario_email  TEXT NOT NULL,
  papel          TEXT NOT NULL DEFAULT 'viewer' CHECK (papel IN ('viewer', 'editor')),  -- legado
  recurso_tipo   public.gestao_recurso,
  recurso_id     TEXT,
  nivel          public.gestao_nivel,
  restritivo     BOOLEAN NOT NULL DEFAULT FALSE,
  concedido_por  TEXT,                                    -- email
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gestao_acessos_recurso
  ON public.gestao_acessos (LOWER(usuario_email), recurso_tipo, recurso_id);

CREATE INDEX IF NOT EXISTS idx_gestao_acessos_email
  ON public.gestao_acessos (LOWER(usuario_email));

CREATE INDEX IF NOT EXISTS idx_gestao_acessos_quadro
  ON public.gestao_acessos (id_quadro)
  WHERE id_quadro IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gestao_acesso_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_email      TEXT NOT NULL,
  alvo_email      TEXT NOT NULL,
  acao            public.gestao_acao NOT NULL,
  recurso_tipo    public.gestao_recurso,
  recurso_id      TEXT,
  nivel_anterior  public.gestao_nivel,
  nivel_novo      public.gestao_nivel,
  motivo          TEXT NOT NULL CHECK (LENGTH(TRIM(motivo)) >= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestao_acesso_log_alvo
  ON public.gestao_acesso_log (LOWER(alvo_email), created_at DESC);

ALTER TABLE public.gestao_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_acesso_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPERS DE PERMISSÃO
-- ============================================================

-- Email atual do JWT (normalizado lowercase). Usado por todo o resto.
CREATE OR REPLACE FUNCTION public.gestao_email()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
AS $$
  SELECT LOWER(auth.jwt() ->> 'email')
$$;

-- Ordinal de nível pra comparar
CREATE OR REPLACE FUNCTION public.gestao_nivel_ord(p public.gestao_nivel)
  RETURNS INT
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE p
    WHEN 'view'    THEN 1
    WHEN 'comment' THEN 2
    WHEN 'edit'    THEN 3
    WHEN 'full'    THEN 4
    ELSE 0
  END
$$;

-- Papel efetivo do usuário no módulo:
--   Admin do sistema → owner (bypass)
--   Senão → papel da tabela gestao_membros (se ativo)
--   Se não é membro ativo → NULL (não entra)
CREATE OR REPLACE FUNCTION public.gestao_papel_de(p_email TEXT)
  RETURNS public.gestao_papel
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_perfil TEXT;
  v_papel  public.gestao_papel;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT perfil INTO v_perfil
    FROM public.usuarios
   WHERE LOWER(email) = LOWER(p_email)
     AND COALESCE(ativo, TRUE) = TRUE;

  IF v_perfil = 'Admin' THEN
    RETURN 'owner';
  END IF;

  SELECT papel INTO v_papel
    FROM public.gestao_membros
   WHERE LOWER(usuario_email) = LOWER(p_email)
     AND ativo = TRUE
   LIMIT 1;

  RETURN v_papel;
END;
$$;

CREATE OR REPLACE FUNCTION public.gestao_eh_gestor(p_email TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT public.gestao_papel_de(p_email) IN ('owner', 'admin')
$$;

-- ============================================================
-- RESOLVER DE NÍVEL
-- Núcleo do modelo: pra um dado usuário + recurso, retorna o nível efetivo
-- considerando membership + grants explícitos + herança + restritivo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.gestao_resolver_nivel(
  p_email        TEXT,
  p_recurso_tipo public.gestao_recurso,
  p_recurso_id   TEXT
)
  RETURNS public.gestao_nivel
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_papel        public.gestao_papel;
  v_nivel        public.gestao_nivel;
  v_teto         public.gestao_nivel := 'full';
  v_id_pasta     UUID;
  v_id_espaco    UUID;
  v_restrito     BOOLEAN;
  v_quadro_existe BOOLEAN;
BEGIN
  -- Portão: não-membro ativo (nem admin sistema) não entra
  v_papel := public.gestao_papel_de(p_email);
  IF v_papel IS NULL THEN
    RETURN NULL;
  END IF;

  -- Gestor tem full em tudo (bypass)
  IF v_papel IN ('owner', 'admin') THEN
    RETURN 'full';
  END IF;

  -- Grant explícito na task
  IF p_recurso_tipo = 'task' THEN
    SELECT nivel INTO v_nivel
      FROM public.gestao_acessos
     WHERE LOWER(usuario_email) = LOWER(p_email)
       AND recurso_tipo = 'task'
       AND recurso_id = p_recurso_id
     LIMIT 1;
    IF v_nivel IS NOT NULL THEN
      RETURN v_nivel;
    END IF;
    -- Fallback: sobe pra list (id_quadro da task)
    -- Na Fase 1 tratamos só até list; refinamento na Fase 2 se precisar
  END IF;

  -- Grant no quadro (list)
  IF p_recurso_tipo = 'list' THEN
    -- FIX: fetch de restrito + pasta + espaço num único SELECT.
    -- Se o quadro não existir, retorna NULL (antes caía em 'edit').
    SELECT restrito, id_pasta, id_espaco, TRUE
      INTO v_restrito, v_id_pasta, v_id_espaco, v_quadro_existe
      FROM public.gestao_quadros
     WHERE id_quadro = p_recurso_id;

    IF NOT COALESCE(v_quadro_existe, FALSE) THEN
      RETURN NULL;
    END IF;

    -- Grant explícito na lista
    SELECT nivel INTO v_nivel
      FROM public.gestao_acessos
     WHERE LOWER(usuario_email) = LOWER(p_email)
       AND recurso_tipo = 'list'
       AND recurso_id = p_recurso_id
     LIMIT 1;

    IF v_nivel IS NOT NULL THEN
      RETURN v_nivel;
    END IF;

    -- Herança pasta → espaço
    IF v_id_pasta IS NOT NULL THEN
      SELECT nivel INTO v_nivel
        FROM public.gestao_acessos
       WHERE LOWER(usuario_email) = LOWER(p_email)
         AND recurso_tipo = 'folder'
         AND recurso_id = v_id_pasta::TEXT
       LIMIT 1;
      IF v_nivel IS NOT NULL THEN
        RETURN v_nivel;
      END IF;
    END IF;

    IF v_id_espaco IS NOT NULL THEN
      SELECT nivel INTO v_nivel
        FROM public.gestao_acessos
       WHERE LOWER(usuario_email) = LOWER(p_email)
         AND recurso_tipo = 'space'
         AND recurso_id = v_id_espaco::TEXT
       LIMIT 1;
      IF v_nivel IS NOT NULL THEN
        RETURN v_nivel;
      END IF;
    END IF;

    -- Sem nada: aberta → edit, restrita → nulo
    IF COALESCE(v_restrito, FALSE) THEN
      RETURN NULL;
    ELSE
      RETURN 'edit';
    END IF;
  END IF;

  -- Grant em space/folder: se não tem grant explícito, view por default
  IF p_recurso_tipo IN ('space', 'folder') THEN
    SELECT nivel INTO v_nivel
      FROM public.gestao_acessos
     WHERE LOWER(usuario_email) = LOWER(p_email)
       AND recurso_tipo = p_recurso_tipo
       AND recurso_id = p_recurso_id
     LIMIT 1;
    RETURN COALESCE(v_nivel, 'view');
  END IF;

  RETURN NULL;
END;
$$;

-- Atalhos usados pelas RLS policies
CREATE OR REPLACE FUNCTION public.gestao_pode_ver(p_quadro TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT public.gestao_resolver_nivel(
    public.gestao_email(),
    'list'::public.gestao_recurso,
    p_quadro
  ) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.gestao_pode_editar_q(p_quadro TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT public.gestao_nivel_ord(public.gestao_resolver_nivel(
    public.gestao_email(),
    'list'::public.gestao_recurso,
    p_quadro
  )) >= public.gestao_nivel_ord('edit'::public.gestao_nivel)
$$;

-- Wrappers pra o cliente
CREATE OR REPLACE FUNCTION public.gestao_meu_papel()
  RETURNS public.gestao_papel
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$ SELECT public.gestao_papel_de(public.gestao_email()) $$;

CREATE OR REPLACE FUNCTION public.gestao_meu_nivel(
  p_recurso_tipo public.gestao_recurso,
  p_recurso_id   TEXT
)
  RETURNS public.gestao_nivel
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$ SELECT public.gestao_resolver_nivel(public.gestao_email(), p_recurso_tipo, p_recurso_id) $$;

-- ============================================================
-- RPCs (transações com log LGPD)
-- ============================================================

-- Define/atualiza membro do módulo. Motivo obrigatório.
CREATE OR REPLACE FUNCTION public.gestao_definir_membro(
  p_alvo    TEXT,
  p_papel   public.gestao_papel,
  p_ativo   BOOLEAN DEFAULT TRUE,
  p_motivo  TEXT DEFAULT NULL
)
  RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_id           UUID;
  v_meu_papel    public.gestao_papel;
  v_papel_antigo public.gestao_papel;
  v_ator         TEXT := public.gestao_email();
BEGIN
  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres) — exigência LGPD';
  END IF;

  v_meu_papel := public.gestao_papel_de(v_ator);
  IF v_meu_papel NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Apenas owner/admin do módulo Gestão pode gerenciar membros';
  END IF;

  -- Admin não pode mexer em owner
  SELECT papel INTO v_papel_antigo
    FROM public.gestao_membros
   WHERE LOWER(usuario_email) = LOWER(p_alvo)
   LIMIT 1;
  IF v_meu_papel = 'admin' AND (v_papel_antigo = 'owner' OR p_papel = 'owner') THEN
    RAISE EXCEPTION 'Admin não pode alterar/promover owner';
  END IF;

  INSERT INTO public.gestao_membros (usuario_email, papel, ativo, adicionado_por)
    VALUES (p_alvo, p_papel, p_ativo, v_ator)
  ON CONFLICT ((LOWER(usuario_email)))
  DO UPDATE SET papel = EXCLUDED.papel, ativo = EXCLUDED.ativo
  RETURNING id INTO v_id;

  INSERT INTO public.gestao_acesso_log
    (ator_email, alvo_email, acao, motivo, nivel_anterior, nivel_novo)
    VALUES (
      v_ator, p_alvo,
      CASE
        WHEN v_papel_antigo IS NULL THEN 'convidou'::public.gestao_acao
        WHEN NOT p_ativo             THEN 'removeu'::public.gestao_acao
        ELSE                              'alterou_papel'::public.gestao_acao
      END,
      p_motivo, NULL, NULL
    );

  RETURN v_id;
END;
$$;

-- Concede/revoga/atualiza um grant por recurso. Motivo obrigatório.
CREATE OR REPLACE FUNCTION public.gestao_alterar_acesso(
  p_alvo         TEXT,
  p_acao         public.gestao_acao,
  p_recurso_tipo public.gestao_recurso,
  p_recurso_id   TEXT,
  p_nivel_novo   public.gestao_nivel,
  p_motivo       TEXT
)
  RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_id             UUID;
  v_meu_papel      public.gestao_papel;
  v_meu_nivel      public.gestao_nivel;
  v_nivel_anterior public.gestao_nivel;
  v_ator           TEXT := public.gestao_email();
  v_id_quadro      TEXT;
BEGIN
  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres) — exigência LGPD';
  END IF;

  v_meu_papel := public.gestao_papel_de(v_ator);
  IF v_meu_papel IS NULL THEN
    RAISE EXCEPTION 'Você não é membro ativo do módulo Gestão';
  END IF;

  -- Anti-escalação: não pode conceder nível > que o próprio
  IF v_meu_papel NOT IN ('owner', 'admin') THEN
    v_meu_nivel := public.gestao_resolver_nivel(v_ator, p_recurso_tipo, p_recurso_id);
    IF public.gestao_nivel_ord(p_nivel_novo) > public.gestao_nivel_ord(v_meu_nivel) THEN
      RAISE EXCEPTION 'Você não pode conceder nível maior que o seu (%)', v_meu_nivel;
    END IF;
  END IF;

  IF p_recurso_tipo = 'list' THEN
    v_id_quadro := p_recurso_id;
  END IF;

  -- Nível anterior pro log
  SELECT nivel INTO v_nivel_anterior
    FROM public.gestao_acessos
   WHERE LOWER(usuario_email) = LOWER(p_alvo)
     AND recurso_tipo = p_recurso_tipo
     AND recurso_id = p_recurso_id
   LIMIT 1;

  IF p_acao = 'revogou' THEN
    DELETE FROM public.gestao_acessos
     WHERE LOWER(usuario_email) = LOWER(p_alvo)
       AND recurso_tipo = p_recurso_tipo
       AND recurso_id = p_recurso_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.gestao_acessos
      (usuario_email, papel, recurso_tipo, recurso_id, nivel, id_quadro, concedido_por)
      VALUES (
        p_alvo,
        CASE WHEN public.gestao_nivel_ord(p_nivel_novo) >= 3 THEN 'editor' ELSE 'viewer' END,
        p_recurso_tipo, p_recurso_id, p_nivel_novo,
        v_id_quadro, v_ator
      )
    ON CONFLICT ((LOWER(usuario_email)), recurso_tipo, recurso_id)
    DO UPDATE SET nivel = EXCLUDED.nivel, papel = EXCLUDED.papel, concedido_por = EXCLUDED.concedido_por
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.gestao_acesso_log
    (ator_email, alvo_email, acao, recurso_tipo, recurso_id,
     nivel_anterior, nivel_novo, motivo)
    VALUES (
      v_ator, p_alvo, p_acao, p_recurso_tipo, p_recurso_id,
      v_nivel_anterior, p_nivel_novo, p_motivo
    );

  RETURN v_id;
END;
$$;

-- ============================================================
-- RLS POLICIES (agora que os helpers existem)
-- ============================================================

-- Espaços/pastas: visíveis pra qualquer membro ativo; escrita só pra gestor
DROP POLICY IF EXISTS gestao_espacos_select ON public.gestao_espacos;
CREATE POLICY gestao_espacos_select ON public.gestao_espacos FOR SELECT
  USING (public.gestao_papel_de(public.gestao_email()) IS NOT NULL);

DROP POLICY IF EXISTS gestao_espacos_write ON public.gestao_espacos;
CREATE POLICY gestao_espacos_write ON public.gestao_espacos FOR ALL
  USING (public.gestao_eh_gestor(public.gestao_email()))
  WITH CHECK (public.gestao_eh_gestor(public.gestao_email()));

DROP POLICY IF EXISTS gestao_pastas_select ON public.gestao_pastas;
CREATE POLICY gestao_pastas_select ON public.gestao_pastas FOR SELECT
  USING (public.gestao_papel_de(public.gestao_email()) IS NOT NULL);

DROP POLICY IF EXISTS gestao_pastas_write ON public.gestao_pastas;
CREATE POLICY gestao_pastas_write ON public.gestao_pastas FOR ALL
  USING (public.gestao_eh_gestor(public.gestao_email()))
  WITH CHECK (public.gestao_eh_gestor(public.gestao_email()));

-- Quadros: resolve por gestao_pode_ver (que já cobre restrito x aberto)
DROP POLICY IF EXISTS gestao_quadros_select ON public.gestao_quadros;
CREATE POLICY gestao_quadros_select ON public.gestao_quadros FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));

DROP POLICY IF EXISTS gestao_quadros_write ON public.gestao_quadros;
CREATE POLICY gestao_quadros_write ON public.gestao_quadros FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

-- INSERT de quadro precisa gestor (senão qualquer um cria)
DROP POLICY IF EXISTS gestao_quadros_insert ON public.gestao_quadros;
CREATE POLICY gestao_quadros_insert ON public.gestao_quadros FOR INSERT
  WITH CHECK (public.gestao_eh_gestor(public.gestao_email()));

-- Status: espelha o quadro
DROP POLICY IF EXISTS gestao_status_select ON public.gestao_status;
CREATE POLICY gestao_status_select ON public.gestao_status FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));

DROP POLICY IF EXISTS gestao_status_write ON public.gestao_status;
CREATE POLICY gestao_status_write ON public.gestao_status FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

-- Tarefas: espelha o quadro
DROP POLICY IF EXISTS gestao_tarefas_select ON public.gestao_tarefas;
CREATE POLICY gestao_tarefas_select ON public.gestao_tarefas FOR SELECT
  USING (public.gestao_pode_ver(id_quadro));

DROP POLICY IF EXISTS gestao_tarefas_write ON public.gestao_tarefas;
CREATE POLICY gestao_tarefas_write ON public.gestao_tarefas FOR ALL
  USING (public.gestao_pode_editar_q(id_quadro))
  WITH CHECK (public.gestao_pode_editar_q(id_quadro));

-- Membros/acessos/log: só via RPC (não permite escrita direta).
-- SELECT: gestor vê tudo; usuário comum só vê o próprio registro.
DROP POLICY IF EXISTS gestao_membros_select ON public.gestao_membros;
CREATE POLICY gestao_membros_select ON public.gestao_membros FOR SELECT
  USING (
    public.gestao_eh_gestor(public.gestao_email())
    OR LOWER(usuario_email) = public.gestao_email()
  );

DROP POLICY IF EXISTS gestao_acessos_select ON public.gestao_acessos;
CREATE POLICY gestao_acessos_select ON public.gestao_acessos FOR SELECT
  USING (
    public.gestao_eh_gestor(public.gestao_email())
    OR LOWER(usuario_email) = public.gestao_email()
  );

DROP POLICY IF EXISTS gestao_acesso_log_select ON public.gestao_acesso_log;
CREATE POLICY gestao_acesso_log_select ON public.gestao_acesso_log FOR SELECT
  USING (public.gestao_eh_gestor(public.gestao_email()));

-- Sem policies de write nas 3 tabelas de permissão — só via RPC (SECURITY DEFINER)

-- ============================================================
-- SEED: Admin do sistema (perfil='Admin') aparece automaticamente
-- como 'owner' via gestao_papel_de. Não precisa inserir em gestao_membros.
-- Só quando o Admin quiser conceder acesso a outros usuários é que
-- chama gestao_definir_membro pra registrar no roster.
-- ============================================================

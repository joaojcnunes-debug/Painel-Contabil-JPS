-- ============================================================
-- Migration 04 — Comentários em obrigações
-- ============================================================

CREATE TABLE IF NOT EXISTS public.obrigacoes_comentarios (
    id_comentario TEXT PRIMARY KEY,
    id_obrigacao TEXT NOT NULL REFERENCES public.obrigacoes(id_obrigacao) ON DELETE CASCADE,
    autor_email TEXT NOT NULL,
    autor_nome TEXT NOT NULL,
    autor_perfil TEXT,
    texto TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_obrig ON public.obrigacoes_comentarios(id_obrigacao);
CREATE INDEX IF NOT EXISTS idx_comentarios_created ON public.obrigacoes_comentarios(created_at);

-- RLS — equipe vê tudo, cliente vê só os da própria obrigação
ALTER TABLE public.obrigacoes_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comentarios_select ON public.obrigacoes_comentarios;
CREATE POLICY comentarios_select ON public.obrigacoes_comentarios FOR SELECT
    USING (
        public.fn_is_equipe()
        OR EXISTS (
            SELECT 1 FROM public.obrigacoes o
            WHERE o.id_obrigacao = obrigacoes_comentarios.id_obrigacao
              AND o.id_cliente = public.fn_cliente_atual()
        )
    );

DROP POLICY IF EXISTS comentarios_insert ON public.obrigacoes_comentarios;
CREATE POLICY comentarios_insert ON public.obrigacoes_comentarios FOR INSERT
    WITH CHECK (
        public.fn_is_equipe()
        OR EXISTS (
            SELECT 1 FROM public.obrigacoes o
            WHERE o.id_obrigacao = obrigacoes_comentarios.id_obrigacao
              AND o.id_cliente = public.fn_cliente_atual()
        )
    );

-- Update/Delete: só Admin (auditoria simples)
DROP POLICY IF EXISTS comentarios_delete ON public.obrigacoes_comentarios;
CREATE POLICY comentarios_delete ON public.obrigacoes_comentarios FOR DELETE
    USING (public.fn_perfil_atual() = 'Admin');

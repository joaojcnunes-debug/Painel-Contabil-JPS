-- ============================================================
-- Migration 06 — Audit log (trilha de auditoria)
-- Registra automaticamente toda mudança em tabelas críticas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    tabela TEXT NOT NULL,
    registro_id TEXT,
    acao TEXT NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
    autor_email TEXT,
    dados_antes JSONB,
    dados_depois JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tabela ON public.audit_log(tabela);
CREATE INDEX IF NOT EXISTS idx_audit_autor ON public.audit_log(autor_email);
CREATE INDEX IF NOT EXISTS idx_audit_registro ON public.audit_log(tabela, registro_id);

-- ─── Função genérica de trigger ──────────────────────────────────────────────
-- Aceita o nome do campo de PK como argumento (TG_ARGV[0]).
-- Captura auth.jwt() -> email se houver sessão; senão fica null
-- (operações via service role em Edge Functions, por ex.).
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_id_field TEXT;
    v_registro_id TEXT;
    v_dados_antes JSONB;
    v_dados_depois JSONB;
BEGIN
    -- Email do JWT (null pra service role / SQL editor)
    BEGIN
        v_email := auth.jwt() ->> 'email';
    EXCEPTION WHEN OTHERS THEN
        v_email := NULL;
    END;

    v_id_field := TG_ARGV[0];

    v_dados_antes := CASE
        WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
        ELSE NULL
    END;
    v_dados_depois := CASE
        WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
        ELSE NULL
    END;

    v_registro_id := COALESCE(v_dados_depois, v_dados_antes) ->> v_id_field;

    INSERT INTO public.audit_log (
        tabela, registro_id, acao, autor_email, dados_antes, dados_depois
    ) VALUES (
        TG_TABLE_NAME, v_registro_id, TG_OP, v_email, v_dados_antes, v_dados_depois
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── Triggers (drop-create pra idempotência) ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_clientes ON public.clientes;
CREATE TRIGGER trg_audit_clientes
    AFTER INSERT OR UPDATE OR DELETE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_cliente');

DROP TRIGGER IF EXISTS trg_audit_obrigacoes ON public.obrigacoes;
CREATE TRIGGER trg_audit_obrigacoes
    AFTER INSERT OR UPDATE OR DELETE ON public.obrigacoes
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_obrigacao');

DROP TRIGGER IF EXISTS trg_audit_faturas ON public.faturas;
CREATE TRIGGER trg_audit_faturas
    AFTER INSERT OR UPDATE OR DELETE ON public.faturas
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_fatura');

DROP TRIGGER IF EXISTS trg_audit_documentos ON public.documentos;
CREATE TRIGGER trg_audit_documentos
    AFTER INSERT OR UPDATE OR DELETE ON public.documentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_documento');

DROP TRIGGER IF EXISTS trg_audit_usuarios ON public.usuarios;
CREATE TRIGGER trg_audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_usuario');

DROP TRIGGER IF EXISTS trg_audit_configuracoes ON public.configuracoes;
CREATE TRIGGER trg_audit_configuracoes
    AFTER INSERT OR UPDATE OR DELETE ON public.configuracoes
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id');

DROP TRIGGER IF EXISTS trg_audit_clientes_contatos ON public.clientes_contatos;
CREATE TRIGGER trg_audit_clientes_contatos
    AFTER INSERT OR UPDATE OR DELETE ON public.clientes_contatos
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_contato');

DROP TRIGGER IF EXISTS trg_audit_obrigacoes_catalogo ON public.obrigacoes_catalogo;
CREATE TRIGGER trg_audit_obrigacoes_catalogo
    AFTER INSERT OR UPDATE OR DELETE ON public.obrigacoes_catalogo
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('id_obrigacao_catalogo');

-- ─── RLS: só Admin lê ────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT
    USING (public.fn_perfil_atual() = 'Admin');

-- Ninguém escreve direto — só os triggers (SECURITY DEFINER)
DROP POLICY IF EXISTS audit_insert ON public.audit_log;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS audit_delete ON public.audit_log;
CREATE POLICY audit_delete ON public.audit_log FOR DELETE
    USING (false);

-- ============================================================
-- Painel Contábil Chabra — Schema base
-- Rodar no SQL Editor do projeto Supabase mwmltqaanfxjkoztgcby.
-- Idempotente (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ─── usuarios — perfil interno do app (NÃO referencia auth.users por FK).
-- Link com Supabase Auth é via coluna `email` (igual padrão do Painel SST):
-- 1) signUp() cria a entrada em auth.users
-- 2) INSERT em public.usuarios com id_usuario custom (ex.: 'USR-A1B2C3D4')
-- 3) Login: signInWithPassword() → busca usuarios por email
-- Vantagem: sem chicken/egg de FK no 1º admin; permite criar usuário pela app.
CREATE TABLE IF NOT EXISTS public.usuarios (
    id_usuario TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('Admin','Contador','Assistente','Cliente')),
    id_cliente TEXT,           -- só preenche quando perfil = Cliente
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON public.usuarios(id_cliente);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(LOWER(email));

-- ─── clientes (empresas atendidas pelo escritório) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
    id_cliente TEXT PRIMARY KEY,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    cpf TEXT,
    regime TEXT NOT NULL DEFAULT 'SIMPLES_NACIONAL'
        CHECK (regime IN ('SIMPLES_NACIONAL','LUCRO_PRESUMIDO','LUCRO_REAL','MEI','DOMESTICO','PRODUTOR_RURAL')),
    atividade_principal TEXT,
    inicio_contrato DATE,
    status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Inativo','Suspenso')),
    honorario_mensal NUMERIC(12,2),
    dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clientes_status ON public.clientes(status);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes(cnpj);

-- FK pendurada depois pra não criar dependência circular com usuarios.
ALTER TABLE public.usuarios
    DROP CONSTRAINT IF EXISTS usuarios_cliente_fk;
ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_cliente_fk
        FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente) ON DELETE SET NULL;

-- ─── clientes_contatos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes_contatos (
    id_contato TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    principal BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_contatos_cliente ON public.clientes_contatos(id_cliente);

-- ─── obrigacoes_catalogo ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obrigacoes_catalogo (
    id_obrigacao_catalogo TEXT PRIMARY KEY,
    sigla TEXT NOT NULL,
    nome TEXT NOT NULL,
    esfera TEXT NOT NULL CHECK (esfera IN ('FEDERAL','ESTADUAL','MUNICIPAL','TRABALHISTA')),
    periodicidade TEXT NOT NULL CHECK (periodicidade IN ('MENSAL','TRIMESTRAL','ANUAL','EVENTUAL')),
    dia_vencimento_padrao INTEGER CHECK (dia_vencimento_padrao BETWEEN 1 AND 31),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── obrigacoes (instâncias por cliente) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obrigacoes (
    id_obrigacao TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    id_obrigacao_catalogo TEXT NOT NULL REFERENCES public.obrigacoes_catalogo(id_obrigacao_catalogo),
    competencia TEXT NOT NULL,            -- YYYY-MM
    data_vencimento DATE NOT NULL,
    data_entrega DATE,
    status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE','EM_ANDAMENTO','ENTREGUE','ATRASADA','DISPENSADA')),
    responsavel TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_obrigacoes_cliente ON public.obrigacoes(id_cliente);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_venc ON public.obrigacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_status ON public.obrigacoes(status);

-- ─── documentos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos (
    id_documento TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    descricao TEXT,
    competencia TEXT,
    arquivo_path TEXT NOT NULL,           -- path no Storage bucket "documentos"
    arquivo_nome TEXT NOT NULL,
    tamanho_bytes BIGINT,
    status TEXT NOT NULL DEFAULT 'RECEBIDO'
        CHECK (status IN ('RECEBIDO','EM_ANALISE','PROCESSADO','DEVOLVIDO')),
    origem TEXT NOT NULL DEFAULT 'CLIENTE' CHECK (origem IN ('CLIENTE','CONTABILIDADE')),
    enviado_por UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_cliente ON public.documentos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_documentos_status ON public.documentos(status);

-- ─── faturas (honorários) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.faturas (
    id_fatura TEXT PRIMARY KEY,
    id_cliente TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    competencia TEXT NOT NULL,            -- YYYY-MM
    valor NUMERIC(12,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA','PAGA','ATRASADA','CANCELADA')),
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_faturas_cliente ON public.faturas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_faturas_status ON public.faturas(status);

-- ============================================================
-- Storage bucket: "documentos" (privado)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS — leitura/escrita
-- Política: equipe (Admin/Contador/Assistente) vê tudo;
-- Cliente vê apenas registros do próprio id_cliente.
-- ============================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrigacoes_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrigacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

-- Helpers — lookup pelo e-mail do JWT (auth.jwt() ->> 'email'),
-- não por auth.uid(), pois usuarios.id_usuario é custom (não bate com auth).
CREATE OR REPLACE FUNCTION public.fn_perfil_atual()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT perfil FROM public.usuarios
    WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION public.fn_cliente_atual()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id_cliente FROM public.usuarios
    WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION public.fn_is_equipe()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT perfil IN ('Admin','Contador','Assistente')
           FROM public.usuarios
           WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')),
        FALSE)
$$;

-- usuarios: cada um lê o próprio; Admin lê todos.
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT
    USING (
        LOWER(email) = LOWER(auth.jwt() ->> 'email')
        OR public.fn_perfil_atual() = 'Admin'
    );

DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT
    WITH CHECK (public.fn_perfil_atual() = 'Admin');

DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE
    USING (public.fn_perfil_atual() = 'Admin');

-- clientes: equipe lê/escreve tudo; cliente lê só o próprio.
DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS clientes_write ON public.clientes;
CREATE POLICY clientes_write ON public.clientes FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- contatos: idem clientes
DROP POLICY IF EXISTS contatos_select ON public.clientes_contatos;
CREATE POLICY contatos_select ON public.clientes_contatos FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS contatos_write ON public.clientes_contatos;
CREATE POLICY contatos_write ON public.clientes_contatos FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- catálogo de obrigações: todos leem; só equipe escreve.
DROP POLICY IF EXISTS catalogo_select ON public.obrigacoes_catalogo;
CREATE POLICY catalogo_select ON public.obrigacoes_catalogo FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS catalogo_write ON public.obrigacoes_catalogo;
CREATE POLICY catalogo_write ON public.obrigacoes_catalogo FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- obrigações: cliente lê as próprias; equipe lê/escreve tudo.
DROP POLICY IF EXISTS obrig_select ON public.obrigacoes;
CREATE POLICY obrig_select ON public.obrigacoes FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS obrig_write ON public.obrigacoes;
CREATE POLICY obrig_write ON public.obrigacoes FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- documentos: equipe tudo; cliente lê e insere os próprios.
DROP POLICY IF EXISTS doc_select ON public.documentos;
CREATE POLICY doc_select ON public.documentos FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS doc_insert ON public.documentos;
CREATE POLICY doc_insert ON public.documentos FOR INSERT
    WITH CHECK (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS doc_update ON public.documentos;
CREATE POLICY doc_update ON public.documentos FOR UPDATE
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

DROP POLICY IF EXISTS doc_delete ON public.documentos;
CREATE POLICY doc_delete ON public.documentos FOR DELETE
    USING (public.fn_is_equipe());

-- faturas: equipe tudo; cliente só lê as próprias.
DROP POLICY IF EXISTS fat_select ON public.faturas;
CREATE POLICY fat_select ON public.faturas FOR SELECT
    USING (public.fn_is_equipe() OR id_cliente = public.fn_cliente_atual());

DROP POLICY IF EXISTS fat_write ON public.faturas;
CREATE POLICY fat_write ON public.faturas FOR ALL
    USING (public.fn_is_equipe()) WITH CHECK (public.fn_is_equipe());

-- Storage: leitura/escrita do bucket "documentos" — equipe tudo,
-- cliente só sob a pasta do próprio id_cliente (path: <id_cliente>/<file>).
DROP POLICY IF EXISTS storage_doc_select ON storage.objects;
CREATE POLICY storage_doc_select ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documentos' AND (
            public.fn_is_equipe() OR
            (storage.foldername(name))[1] = public.fn_cliente_atual()
        )
    );

DROP POLICY IF EXISTS storage_doc_insert ON storage.objects;
CREATE POLICY storage_doc_insert ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documentos' AND (
            public.fn_is_equipe() OR
            (storage.foldername(name))[1] = public.fn_cliente_atual()
        )
    );

DROP POLICY IF EXISTS storage_doc_delete ON storage.objects;
CREATE POLICY storage_doc_delete ON storage.objects FOR DELETE
    USING (
        bucket_id = 'documentos' AND public.fn_is_equipe()
    );

-- ============================================================
-- Seed mínimo do catálogo de obrigações (idempotente)
-- ============================================================
INSERT INTO public.obrigacoes_catalogo
    (id_obrigacao_catalogo, sigla, nome, esfera, periodicidade, dia_vencimento_padrao, descricao)
VALUES
    ('CAT_DAS',     'DAS',     'Documento de Arrecadação do Simples Nacional', 'FEDERAL', 'MENSAL', 20, 'Para clientes Simples Nacional/MEI'),
    ('CAT_DCTF',    'DCTFWeb', 'Declaração de Débitos e Créditos Tributários Federais', 'FEDERAL', 'MENSAL', 15, NULL),
    ('CAT_ESOCIAL', 'eSocial', 'Envio mensal eSocial (S-1200/S-1210/S-1299)', 'TRABALHISTA', 'MENSAL', 15, NULL),
    ('CAT_FGTS',    'FGTS',    'Guia FGTS digital', 'TRABALHISTA', 'MENSAL', 20, NULL),
    ('CAT_ICMS',    'ICMS',    'Apuração e recolhimento ICMS', 'ESTADUAL', 'MENSAL', 10, 'Lucro Presumido/Real'),
    ('CAT_ISS',     'ISS',     'ISS — Imposto sobre Serviços', 'MUNICIPAL', 'MENSAL', 10, NULL),
    ('CAT_SPEDF',   'SPED-F',  'SPED Fiscal (EFD ICMS/IPI)', 'FEDERAL', 'MENSAL', 25, NULL),
    ('CAT_SPEDC',   'SPED-C',  'SPED Contribuições (EFD-Contribuições)', 'FEDERAL', 'MENSAL', 14, NULL),
    ('CAT_DEFIS',   'DEFIS',   'Declaração de Informações Socioeconômicas (anual)', 'FEDERAL', 'ANUAL', 31, 'Marco anual Simples'),
    ('CAT_ECD',     'ECD',     'Escrituração Contábil Digital', 'FEDERAL', 'ANUAL', 31, NULL)
ON CONFLICT (id_obrigacao_catalogo) DO NOTHING;

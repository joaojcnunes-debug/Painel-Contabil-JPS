-- Migration 22: esocial_lotes + esocial_eventos
--
-- Persiste lotes enviados ao eSocial via WsEnviarLoteEventos + status
-- dos eventos individuais retornados pela consulta de protocolo
-- (WsConsultarLoteEventos).
--
-- Modelo: 1 lote → N eventos (limite eSocial 50 por lote, mas começamos
-- enviando 1 evento por lote pra simplicidade).
--
-- Workflow:
-- 1. enviarLoteEventos retorna cdResposta 201/132 + protocolo
-- 2. cliente faz polling consultarLoteEventos com protocolo até cdResposta
--    de cada evento sair de "em processamento" pra "validado/rejeitado"
-- 3. Atualiza esocial_eventos.status_evento + esocial_eventos.protocolo_evento

-- ============================================================
-- TABELA esocial_lotes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.esocial_lotes (
  id_lote          TEXT PRIMARY KEY,
  id_cliente       TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  ambiente         SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  grupo            SMALLINT NOT NULL DEFAULT 2 CHECK (grupo IN (1, 2, 3)),
  -- 1=empresas faturamento >78M, 2=demais entidades privadas, 3=órgãos públicos
  protocolo        TEXT,                       -- nrRecibo retornado pelo eSocial
  cd_resposta      TEXT,                       -- cdResposta do RECEPÇÃO (201/132/etc)
  desc_resposta    TEXT,
  status_lote      TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_lote IN ('PENDENTE', 'ENVIADO', 'PROCESSADO', 'REJEITADO', 'ERRO')),
  -- PENDENTE = ainda não enviou
  -- ENVIADO  = recebeu protocolo, aguardando processamento
  -- PROCESSADO = consulta de protocolo retornou todos eventos
  -- REJEITADO = lote rejeitado na recepção (sem protocolo)
  -- ERRO = erro de transporte/conexão antes da recepção
  enviado_por_email TEXT,
  enviado_em       TIMESTAMPTZ,
  ultimo_polling_em TIMESTAMPTZ,
  request_xml      TEXT,                       -- snapshot do XML enviado (debug)
  response_xml     TEXT,                       -- snapshot do XML recebido (debug)
  erro             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esocial_lotes_cliente
  ON public.esocial_lotes (id_cliente, ambiente, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_esocial_lotes_protocolo
  ON public.esocial_lotes (protocolo)
  WHERE protocolo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_esocial_lotes_pending_polling
  ON public.esocial_lotes (status_lote, ultimo_polling_em)
  WHERE status_lote = 'ENVIADO';

ALTER TABLE public.esocial_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esocial_lotes_select ON public.esocial_lotes;
CREATE POLICY esocial_lotes_select ON public.esocial_lotes
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS esocial_lotes_write ON public.esocial_lotes;
CREATE POLICY esocial_lotes_write ON public.esocial_lotes
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

-- ============================================================
-- TABELA esocial_eventos (1 lote → N eventos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.esocial_eventos (
  id_evento        TEXT PRIMARY KEY,           -- ID do <evento> no XML (formato "ID + tpInsc + nrInsc + dh ordinal")
  id_lote          TEXT NOT NULL REFERENCES public.esocial_lotes(id_lote) ON DELETE CASCADE,
  id_cliente       TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  tp_evt           TEXT NOT NULL,              -- S-1000, S-2200, etc
  protocolo_evento TEXT,                       -- nrRecibo individual (vem na consulta de protocolo)
  cd_resposta      TEXT,                       -- cdResposta INDIVIDUAL do evento (201/202/etc)
  desc_resposta    TEXT,
  status_evento    TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_evento IN ('PENDENTE', 'PROCESSANDO', 'VALIDADO', 'REJEITADO', 'ADVERTENCIA')),
  evento_xml       TEXT,                       -- XML do evento sem assinatura (debug)
  evento_xml_signed TEXT,                      -- XML do evento já assinado (debug)
  retorno_xml      TEXT,                       -- XML do retorno individual
  erros            JSONB,                      -- lista de erros/advertências retornados pelo eSocial
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esocial_eventos_lote
  ON public.esocial_eventos (id_lote);

CREATE INDEX IF NOT EXISTS idx_esocial_eventos_cliente_tp
  ON public.esocial_eventos (id_cliente, tp_evt, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_esocial_eventos_status
  ON public.esocial_eventos (status_evento);

ALTER TABLE public.esocial_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esocial_eventos_select ON public.esocial_eventos;
CREATE POLICY esocial_eventos_select ON public.esocial_eventos
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS esocial_eventos_write ON public.esocial_eventos;
CREATE POLICY esocial_eventos_write ON public.esocial_eventos
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

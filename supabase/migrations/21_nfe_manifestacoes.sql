-- Migration 21: nfe_manifestacoes
--
-- Persiste eventos de manifestação do destinatário (Ciência, Confirmação,
-- Desconhecimento, Operação não realizada) enviados pra SEFAZ.
--
-- Antes, só ficava registrado no log genérico de integracoes_logs sem
-- estrutura, dificultando consulta por chave/cliente/período. Agora tem
-- tabela própria com índices úteis.

CREATE TABLE IF NOT EXISTS public.nfe_manifestacoes (
  id_manifestacao  TEXT PRIMARY KEY,
  id_cliente       TEXT NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  ambiente         SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  chave_nfe        TEXT NOT NULL,                            -- 44 dígitos
  tipo_evento      TEXT NOT NULL CHECK (
    tipo_evento IN ('210210', '210200', '210220', '210240')
  ),
  -- 210210 = Ciência, 210200 = Confirmação,
  -- 210220 = Desconhecimento, 210240 = Operação não realizada
  protocolo        TEXT,                                     -- nProt da SEFAZ
  c_stat           TEXT,                                     -- 135 = vinculado, 136 = registrado
  x_motivo         TEXT,
  dh_evento        TIMESTAMPTZ,                              -- quando o evento foi emitido
  dh_registrado    TIMESTAMPTZ,                              -- quando a SEFAZ registrou
  justificativa    TEXT,                                     -- só pra 210220/210240
  ok               BOOLEAN NOT NULL DEFAULT false,
  erro             TEXT,
  enviado_por_email TEXT,                                    -- e-mail do usuário
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfe_manif_cliente_chave
  ON public.nfe_manifestacoes (id_cliente, chave_nfe, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nfe_manif_chave
  ON public.nfe_manifestacoes (chave_nfe);

-- RLS: equipe full access, cliente vê só os próprios.
ALTER TABLE public.nfe_manifestacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_manif_select ON public.nfe_manifestacoes;
CREATE POLICY nfe_manif_select ON public.nfe_manifestacoes
  FOR SELECT
  USING (fn_is_equipe() OR id_cliente = fn_cliente_atual());

DROP POLICY IF EXISTS nfe_manif_write ON public.nfe_manifestacoes;
CREATE POLICY nfe_manif_write ON public.nfe_manifestacoes
  FOR ALL
  USING (fn_is_equipe())
  WITH CHECK (fn_is_equipe());

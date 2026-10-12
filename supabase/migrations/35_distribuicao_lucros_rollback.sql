-- Rollback da migration 35 — apaga a tabela e TODOS os lançamentos de distribuição.
DROP TABLE IF EXISTS public.distribuicoes_lucros;

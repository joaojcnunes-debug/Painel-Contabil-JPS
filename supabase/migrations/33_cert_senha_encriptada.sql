-- Senha do PFX guardada encriptada (AES-256-GCM).
-- ciphertext e iv como bytea; a chave master fica no env (CERT_SENHA_MASTER_KEY, base64 32B).
-- Nunca guardar plaintext.

ALTER TABLE certificados_digitais
  ADD COLUMN IF NOT EXISTS senha_encriptada bytea,
  ADD COLUMN IF NOT EXISTS senha_iv bytea;

COMMENT ON COLUMN certificados_digitais.senha_encriptada IS
  'Senha do PFX encriptada com AES-256-GCM. Formato: ciphertext || authTag (16B).';
COMMENT ON COLUMN certificados_digitais.senha_iv IS
  'IV de 12 bytes gerado por encriptação (obrigatório único).';

// Encriptação/decriptação de senha de certificado A1 com AES-256-GCM.
//
// Chave master: process.env.CERT_SENHA_MASTER_KEY (base64 de 32 bytes).
// - Vercel: variável de ambiente do projeto
// - GH Actions: secret CERT_SENHA_MASTER_KEY
// - Local: .env.local
//
// Formato armazenado:
// - senha_iv     : bytea (12 bytes, único por encriptação)
// - senha_encriptada : bytea (ciphertext || authTag[16 bytes])

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const b64 = process.env.CERT_SENHA_MASTER_KEY;
  if (!b64) {
    throw new Error(
      "CERT_SENHA_MASTER_KEY ausente no env — chave master AES-256 obrigatória"
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CERT_SENHA_MASTER_KEY deve ter 32 bytes (256 bits) em base64. Atual: ${key.length}`
    );
  }
  return key;
}

export function encriptarSenha(senha: string): {
  senha_encriptada: Buffer;
  senha_iv: Buffer;
} {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(senha, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    senha_encriptada: Buffer.concat([enc, tag]),
    senha_iv: iv,
  };
}

export function decriptarSenha(
  senha_encriptada: Buffer,
  senha_iv: Buffer
): string {
  if (senha_iv.length !== IV_LEN) {
    throw new Error(`IV inválido: ${senha_iv.length} bytes (esperado ${IV_LEN})`);
  }
  if (senha_encriptada.length < TAG_LEN + 1) {
    throw new Error("Ciphertext muito curto — dado corrompido");
  }
  const ct = senha_encriptada.subarray(0, senha_encriptada.length - TAG_LEN);
  const tag = senha_encriptada.subarray(senha_encriptada.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), senha_iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

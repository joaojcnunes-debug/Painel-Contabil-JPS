// Helper pra trabalhar com modo SIMULADO vs REAL.
//
// Decisão: o modo é POR (cliente, módulo), persistido em integracoes_config.
// Quando não há config ainda, o default é SIMULADO (mais seguro).

import type { ModoIntegracao } from "@/lib/supabase/types";

export const MODO_PADRAO: ModoIntegracao = "SIMULADO";

export function isSimulado(modo: ModoIntegracao | null | undefined): boolean {
  return (modo ?? MODO_PADRAO) === "SIMULADO";
}

export function labelModo(modo: ModoIntegracao | null | undefined): string {
  if (!modo) return "Simulado";
  return modo === "SIMULADO" ? "Simulado" : "Real";
}

// Delay simulado pra parecer chamada real (usado pelos mocks)
export function delaySimulado(ms = 600): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

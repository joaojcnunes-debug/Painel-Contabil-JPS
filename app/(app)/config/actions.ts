"use server";

import { revalidateTag } from "next/cache";

// Invalida o cache server-side de `configuracoes` (em unstable_cache).
// Chamado após salvar a tela de Configurações pra que recibos/holerites
// peguem os dados novos no próximo render sem precisar de redeploy.
export async function revalidarConfiguracoesCache() {
  revalidateTag("configuracoes");
}

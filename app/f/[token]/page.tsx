import { notFound } from "next/navigation";
import { FormularioPublico } from "./FormularioPublico";

// Rota pública: /f/[token] — carrega definição do formulário e renderiza
// o form pra qualquer visitante (sem login).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const dynamic = "force-dynamic";

type Form = {
  titulo: string;
  descricao: string | null;
  mostra_descricao: boolean;
  mostra_prazo: boolean;
  mostra_prioridade: boolean;
  ativo: boolean;
  perguntas: Array<{
    id: string;
    label: string;
    tipo: string;
    obrigatoria?: boolean;
  }>;
};

export default async function FormularioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const url = `${SUPABASE_URL}/functions/v1/gestao-form-submit?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return notFound();
  const data = (await res.json()) as { ok?: boolean; form?: Form; error?: string };
  if (!data.ok || !data.form) return notFound();

  return <FormularioPublico token={token} form={data.form} />;
}

// Mensagens em português para erros comuns do Supabase Auth.
// Mantém a mensagem original como fallback caso não tenha tradução.

const MAP: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos",
  "Email not confirmed": "E-mail ainda não confirmado",
  "User already registered": "E-mail já cadastrado",
  "Password should be at least 6 characters":
    "A senha deve ter pelo menos 6 caracteres",
  "Email rate limit exceeded":
    "Muitos pedidos recentes. Aguarde alguns minutos e tente de novo.",
  "Anonymous sign-ins are disabled":
    "Login anônimo desativado — informe e-mail e senha",
};

export function translateAuthError(msg: string | null | undefined): string {
  if (!msg) return "Não foi possível concluir a operação.";
  return MAP[msg] ?? msg;
}

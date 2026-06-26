import { NextResponse, type NextRequest } from "next/server";

// Middleware "leve": só checa presença do cookie de sessão Supabase.
// A validação real do JWT é feita nos layouts via getAuthUser() (com React.cache),
// que invalida e redireciona se o cookie tiver expirado.
//
// Por que não chamar supabase.auth.getUser() aqui?
// - getUser() faz roundtrip pro Auth server (300-500ms) em TODA request
// - Multiplica latency em produção (Vercel edge → Supabase US)
// - Layout já faz auth check sem o custo extra
//
// Trade-off: cookie órfão (não-mais-válido) passa pelo middleware, mas
// é bloqueado no layout e redirecionado pra /login. Aceito.

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Heurística: cookie do Supabase auth tem nome `sb-<project-ref>-auth-token`
  // (ou com sufixos `.0`/`.1` quando é grande e foi chunked). Se nenhum
  // existir, claramente não há sessão.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (!hasSessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};

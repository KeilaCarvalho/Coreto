import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/entrar", "/auth"];

/** Renova a sessão a cada requisição e manda para /entrar quem não está logado. */
export async function atualizarSessao(request: NextRequest) {
  // Link de e-mail que caiu fora de /auth/confirmar (ex.: na página inicial): leva para a confirmação.
  const codigo = request.nextUrl.searchParams.get("code");
  if (codigo && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirmar";
    url.search = "";
    url.searchParams.set("code", codigo);
    return NextResponse.redirect(url);
  }
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const publica = ROTAS_PUBLICAS.some((rota) => request.nextUrl.pathname.startsWith(rota));
  if (!data.user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return resposta;
}

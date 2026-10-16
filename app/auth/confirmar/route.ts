import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";

/** Destino do link de confirmação de e-mail enviado pelo Supabase. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await supabaseServidor();

  let erro: string | null = "Link inválido ou expirado.";
  if (code) erro = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  else if (tokenHash && tipo) erro = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error?.message ?? null;

  const destino = url.clone();
  destino.search = "";
  destino.pathname = erro ? "/entrar" : "/";
  if (erro) destino.searchParams.set("aviso", "link-invalido");
  return NextResponse.redirect(destino);
}

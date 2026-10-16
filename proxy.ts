import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/sessao-proxy";

export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|coreto-.*\\.png).*)"],
};

"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente do Supabase no navegador (usa a mesma sessão do login). Só para enviar arquivos grandes direto ao Storage. */
export function supabaseNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

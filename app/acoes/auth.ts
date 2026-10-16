"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

const MENSAGENS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Este e-mail já tem acesso. Use a opção Entrar.",
};
const traduzir = (mensagem: string) => MENSAGENS[mensagem] ?? mensagem;

export async function entrar(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return { erro: "Preencha e-mail e senha." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: traduzir(error.message) };
  redirect("/");
}

export async function criarAcesso(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  if (!nome || !email) return { erro: "Preencha nome e e-mail." };
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  const supabase = await supabaseServidor();
  const h = await headers();
  const origem = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email, password: senha,
    options: { data: { full_name: nome }, emailRedirectTo: `${origem}/auth/confirmar` },
  });
  if (error) return { erro: traduzir(error.message) };
  if (!data.session) return { ok: "Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, volte aqui para entrar." };
  redirect("/");
}

export async function sair() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { COOKIE_RECUPERAR } from "@/lib/recuperar-senha";
import type { EstadoAcao } from "@/components/form-acao";

const MENSAGENS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Este e-mail já tem acesso. Use a opção Entrar.",
  "New password should be different from the old password.": "A nova senha precisa ser diferente da antiga.",
};


async function origemDoPedido() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}
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
  const origem = await origemDoPedido();
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

export async function trocarSenha(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const atual = String(dados.get("atual") ?? "");
  const nova = String(dados.get("nova") ?? "");
  const repetir = String(dados.get("repetir") ?? "");
  if (!atual || !nova) return { erro: "Preencha a senha atual e a nova." };
  if (nova.length < 8) return { erro: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (nova !== repetir) return { erro: "A confirmação não bate com a nova senha." };
  if (nova === atual) return { erro: "A nova senha precisa ser diferente da atual." };
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { erro: "Sua sessão expirou. Entre de novo." };
  const conferida = await supabase.auth.signInWithPassword({ email: auth.user.email, password: atual });
  if (conferida.error) return { erro: "A senha atual não confere." };
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) return { erro: traduzir(error.message) };
  return { ok: "Senha alterada. Use a nova senha no próximo acesso." };
}

/** "Esqueci minha senha": manda o link para criar uma senha nova. */
export async function pedirNovaSenha(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Digite o e-mail cadastrado." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origemDoPedido()}/auth/confirmar` });
  if (error && /rate limit|seconds/i.test(error.message)) return { erro: "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." };
  (await cookies()).set(COOKIE_RECUPERAR, "1", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 });
  // A resposta é a mesma exista ou não o e-mail, para não revelar quem tem acesso.
  return { ok: "Se este e-mail tiver acesso, chega em instantes um link para criar a senha nova. Abra o link neste mesmo aparelho e navegador. Confira também a caixa de spam." };
}

/** Grava a senha nova depois que a pessoa abriu o link do e-mail. */
export async function salvarNovaSenha(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nova = String(dados.get("nova") ?? "");
  const repetir = String(dados.get("repetir") ?? "");
  if (nova.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (nova !== repetir) return { erro: "A confirmação não bate com a senha nova." };
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erro: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) return { erro: traduzir(error.message) };
  (await cookies()).delete(COOKIE_RECUPERAR);
  redirect("/");
}

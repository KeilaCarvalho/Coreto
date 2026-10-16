import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Acao, Modulo } from "@/lib/navegacao";

export type Sessao = {
  usuarioId: string;
  pessoa: { id: string; nome: string; email: string | null; perfil_id: string | null; acesso_ativo: boolean } | null;
  perfilNome: string | null;
  permissoes: Set<string>;
  pode: (modulo: Modulo, acao?: Acao) => boolean;
};

/** Sessão do usuário logado, lida uma vez por requisição. */
export const lerSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: pessoa }, { data: permissoes }] = await Promise.all([
    supabase.from("pessoas").select("id, nome, email, perfil_id, acesso_ativo, perfis(nome)").eq("usuario_id", auth.user.id).maybeSingle(),
    supabase.rpc("minhas_permissoes"),
  ]);

  const conjunto = new Set<string>((permissoes ?? []).map((p: { modulo_id: string; acao: string }) => `${p.modulo_id}:${p.acao}`));
  const perfil = (pessoa as { perfis?: { nome: string } | null } | null)?.perfis;
  return {
    usuarioId: auth.user.id,
    pessoa: pessoa ? { id: pessoa.id, nome: pessoa.nome, email: pessoa.email, perfil_id: pessoa.perfil_id, acesso_ativo: pessoa.acesso_ativo } : null,
    perfilNome: perfil?.nome ?? null,
    permissoes: conjunto,
    pode: (modulo, acao = "ver") => conjunto.has(`${modulo}:${acao}`),
  };
});

/** Para páginas: exige login, acesso liberado e a permissão pedida. */
export async function exigir(modulo: Modulo, acao: Acao = "ver") {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar");
  if (!sessao.pessoa?.acesso_ativo) redirect("/aguardando");
  if (!sessao.pode(modulo, acao)) redirect("/?aviso=sem-permissao");
  return sessao;
}

import { redirect } from "next/navigation";
import { Estrutura } from "@/components/menu";
import { sair } from "@/app/acoes/auth";
import { lerSessao } from "@/lib/sessao";
import { menuPara } from "@/lib/navegacao";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar");
  if (!sessao.pessoa?.acesso_ativo) redirect("/aguardando");
  let pendencias = 0;
  if (sessao.pode("configuracoes", "editar")) {
    const supabase = await supabaseServidor();
    const { count } = await supabase.from("pessoas").select("id", { count: "exact", head: true })
      .not("usuario_id", "is", null).eq("acesso_ativo", false).is("arquivado_em", null);
    pendencias = count ?? 0;
  }
  return (
    <Estrutura grupos={menuPara((m) => sessao.pode(m))} nome={sessao.pessoa.nome} email={sessao.pessoa.email ?? ""} sair={sair} pendencias={pendencias}>
      {children}
    </Estrutura>
  );
}

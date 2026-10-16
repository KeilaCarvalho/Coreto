import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { Cabecalho } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { trocarSenha } from "@/app/acoes/auth";

export const metadata = { title: "Minha conta" };

export default async function MinhaConta() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar");
  if (!sessao.pessoa?.acesso_ativo) redirect("/aguardando");
  const p = sessao.pessoa;
  return (
    <>
      <Cabecalho titulo="Minha conta" descricao="Seus dados de acesso ao sistema." />
      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo"><div><h2>Trocar senha</h2><p>Use pelo menos 8 caracteres.</p></div></div>
          <div className="painel-corpo">
            <FormAcao acao={trocarSenha} limparAoSalvar>
              <div className="campos">
                <div className="campo"><label htmlFor="senha-atual">Senha atual</label><input id="senha-atual" name="atual" type="password" autoComplete="current-password" required /></div>
                <div className="campo"><label htmlFor="senha-nova">Nova senha</label><input id="senha-nova" name="nova" type="password" autoComplete="new-password" minLength={8} required /></div>
                <div className="campo"><label htmlFor="senha-repetir">Repita a nova senha</label><input id="senha-repetir" name="repetir" type="password" autoComplete="new-password" minLength={8} required /></div>
              </div>
              <div className="formulario-rodape"><BotaoEnviar>Salvar nova senha</BotaoEnviar></div>
            </FormAcao>
          </div>
        </section>
        <section className="painel">
          <div className="painel-topo"><div><h2>Seus dados</h2></div></div>
          <ul className="lista-simples">
            <li><div className="item"><div><strong>Nome</strong><span>{p.nome}</span></div></div></li>
            <li><div className="item"><div><strong>E-mail</strong><span>{p.email}</span></div></div></li>
            <li><div className="item"><div><strong>Perfil</strong><span>{sessao.perfilNome}</span></div></div></li>
          </ul>
        </section>
      </div>
    </>
  );
}

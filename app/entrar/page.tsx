/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarAcesso, entrar, pedirNovaSenha } from "@/app/acoes/auth";
import { lerSessao } from "@/lib/sessao";
import { AvisoLinkDoEmail } from "@/components/entrar/aviso-link";

export const metadata = { title: "Entrar" };

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ modo?: string; aviso?: string }> }) {
  if (await lerSessao()) redirect("/");
  const { modo, aviso } = await searchParams;
  const criando = modo === "criar";
  const esqueci = modo === "esqueci";
  return (
    <main className="entrar">
      <section className="entrar-marca">
        <img className="flor-grande" src="/coreto-flor-branca.png" alt="" />
        <img className="nome" src="/coreto-nome-escuro.png" alt="Coreto" />
        <div>
          <h2>A operação da Coreto em um só lugar</h2>
          <p>Produção, estoque, vendas e equipe, com cada pessoa vendo só o que precisa.</p>
        </div>
      </section>
      <section className="entrar-form">
        <div className="entrar-caixa">
          <img className="flor-pequena" src="/coreto-flor-turquesa.png" alt="" />
          {esqueci ? (
            <>
              <h1>Esqueci minha senha</h1>
              <p>Digite o e-mail cadastrado. Vamos mandar um link para você criar uma senha nova.</p>
              <FormAcao acao={pedirNovaSenha} className="campos">
                <div className="campo"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
                <BotaoEnviar enviando="Enviando…">Enviar link</BotaoEnviar>
              </FormAcao>
              <p className="alternar">Lembrou? <Link href="/entrar">Voltar para entrar</Link></p>
            </>
          ) : criando ? (
            <>
              <h1>Pedir acesso</h1>
              <p>Crie seu login. A administração libera o seu perfil antes do primeiro uso.</p>
              <FormAcao acao={criarAcesso} className="campos">
                <div className="campo"><label htmlFor="nome">Nome</label><input id="nome" name="nome" autoComplete="name" required /></div>
                <div className="campo"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
                <div className="campo"><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" minLength={8} autoComplete="new-password" required /><span className="ajuda">Pelo menos 8 caracteres.</span></div>
                <BotaoEnviar enviando="Criando…">Criar login</BotaoEnviar>
              </FormAcao>
              <p className="alternar">Já tem login? <Link href="/entrar">Entrar</Link></p>
            </>
          ) : (
            <>
              <h1>Entrar</h1>
              <p>Use o e-mail cadastrado na Coreto.</p>
              <AvisoLinkDoEmail />
              {aviso === "link-senha-invalido" && <p className="aviso erro" role="alert">O link para criar a senha nova é inválido ou expirou. Peça outro em “Esqueci minha senha” e abra no mesmo aparelho e navegador.</p>}
              {aviso === "link-invalido" && <p className="aviso erro" role="alert">O link de confirmação é inválido ou expirou. Entre com e-mail e senha ou peça um novo acesso.</p>}
              <FormAcao acao={entrar} className="campos">
                <div className="campo"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
                <div className="campo">
                  <label htmlFor="senha">Senha</label>
                  <input id="senha" name="senha" type="password" autoComplete="current-password" required />
                  <Link className="esqueci-senha" href="/entrar?modo=esqueci">Esqueci minha senha</Link>
                </div>
                <BotaoEnviar enviando="Entrando…">Entrar</BotaoEnviar>
              </FormAcao>
              <p className="alternar">Primeira vez aqui? <Link href="/entrar?modo=criar">Pedir acesso</Link></p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

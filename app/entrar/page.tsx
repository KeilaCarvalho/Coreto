/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarAcesso, entrar, pedirNovaSenha } from "@/app/acoes/auth";
import { lerSessao } from "@/lib/sessao";
import { AvisoLinkDoEmail } from "@/components/entrar/aviso-link";
import { CampoLogin } from "@/components/entrar/campo-login";
import { FlorLinhas } from "@/components/entrar/flor-linhas";

export const metadata = { title: { absolute: "Sistema Coreto" } };
export const viewport = { themeColor: "#0b0d0e" };

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ modo?: string; aviso?: string }> }) {
  if (await lerSessao()) redirect("/");
  const { modo, aviso } = await searchParams;
  const criando = modo === "criar";
  const esqueci = modo === "esqueci";
  return (
    <main className="lg">
      <section className="lg-marca" aria-label="Coreto">
        <FlorLinhas className="lg-flor um" />
        <FlorLinhas className="lg-flor dois" />
        <img className="lg-nome" src="/coreto-nome-branco.png" alt="Coreto" />
        <div className="lg-frase">
          <span className="lg-selo">Gestão interna</span>
          <h2>A operação da Coreto em um só lugar.</h2>
          <p>Produção, estoque, vendas e financeiro, com cada pessoa vendo só o que precisa.</p>
        </div>
      </section>

      <section className="lg-folha">
        <div className="lg-conteudo">
          {esqueci ? (
            <>
              <h1>Esqueci minha senha</h1>
              <p className="lg-sub">Digite o e-mail cadastrado. Mandamos um link para você criar uma senha nova.</p>
              <FormAcao acao={pedirNovaSenha} className="lg-form">
                <CampoLogin id="email" rotulo="E-mail" tipo="email" autoComplete="email" />
                <BotaoEnviar enviando="Enviando…">Enviar link</BotaoEnviar>
              </FormAcao>
              <p className="lg-rodape">Lembrou? <Link href="/entrar">Voltar para entrar</Link></p>
            </>
          ) : criando ? (
            <>
              <h1>Pedir acesso</h1>
              <p className="lg-sub">Crie seu login. A administração libera o seu perfil antes do primeiro uso.</p>
              <FormAcao acao={criarAcesso} className="lg-form">
                <CampoLogin id="nome" rotulo="Nome" tipo="nome" autoComplete="name" />
                <CampoLogin id="email" rotulo="E-mail" tipo="email" autoComplete="email" />
                <CampoLogin id="senha" rotulo="Senha" tipo="senha" autoComplete="new-password" minLength={8} ajuda="Pelo menos 8 caracteres." />
                <BotaoEnviar enviando="Criando…">Criar login</BotaoEnviar>
              </FormAcao>
              <p className="lg-rodape">Já tem login? <Link href="/entrar">Entrar</Link></p>
            </>
          ) : (
            <>
              <h1>Acesse sua conta</h1>
              <p className="lg-sub">Entre com o e-mail cadastrado na Coreto.</p>
              <AvisoLinkDoEmail />
              {aviso === "link-senha-invalido" && <p className="aviso erro" role="alert">O link para criar a senha nova é inválido ou expirou. Peça outro em “Esqueci minha senha” e abra no mesmo aparelho e navegador.</p>}
              {aviso === "link-invalido" && <p className="aviso erro" role="alert">O link de confirmação é inválido ou expirou. Entre com e-mail e senha ou peça um novo acesso.</p>}
              <FormAcao acao={entrar} className="lg-form">
                <CampoLogin id="email" rotulo="E-mail" tipo="email" autoComplete="email" />
                <CampoLogin id="senha" rotulo="Senha" tipo="senha" autoComplete="current-password"
                  extra={<Link className="lg-esqueci" href="/entrar?modo=esqueci">Esqueci a senha</Link>} />
                <BotaoEnviar enviando="Entrando…">Entrar</BotaoEnviar>
              </FormAcao>
              <p className="lg-rodape">Primeira vez aqui? <Link href="/entrar?modo=criar">Pedir acesso</Link></p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { salvarNovaSenha } from "@/app/acoes/auth";
import { supabaseServidor } from "@/lib/supabase/server";
import { COOKIE_RECUPERAR } from "@/lib/recuperar-senha";

export const metadata = { title: "Criar senha nova" };

/** Aberta pelo link do "Esqueci minha senha": a pessoa já está identificada pelo link e só escolhe a senha nova. */
export default async function NovaSenha() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar?aviso=link-senha-invalido");
  // Só abre vindo do link do e-mail; quem já está logado troca a senha em "Minha conta".
  if ((await cookies()).get(COOKIE_RECUPERAR)?.value !== "1") redirect("/");
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
          <h1>Criar senha nova</h1>
          <p>Para {data.user.email}. Depois de salvar, você já entra no sistema.</p>
          <FormAcao acao={salvarNovaSenha} className="campos">
            <div className="campo"><label htmlFor="nova">Senha nova</label><input id="nova" name="nova" type="password" minLength={8} autoComplete="new-password" required autoFocus /><span className="ajuda">Pelo menos 8 caracteres.</span></div>
            <div className="campo"><label htmlFor="repetir">Repita a senha nova</label><input id="repetir" name="repetir" type="password" minLength={8} autoComplete="new-password" required /></div>
            <BotaoEnviar enviando="Salvando…">Salvar senha nova</BotaoEnviar>
          </FormAcao>
          <p className="alternar"><Link href="/">Agora não, entrar no sistema</Link></p>
        </div>
      </section>
    </main>
  );
}

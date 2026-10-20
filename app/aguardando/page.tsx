/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { sair } from "@/app/acoes/auth";
import { lerSessao } from "@/lib/sessao";

export const metadata = { title: "Acesso pendente" };

export default async function Aguardando() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar");
  if (sessao.pessoa?.acesso_ativo) redirect("/");
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
          <h1>Seu acesso está pendente</h1>
          <p>O login {sessao.pessoa?.email ? <strong>{sessao.pessoa.email}</strong> : null} foi criado. Peça para a administração liberar o seu perfil em Configurações → Acessos.</p>
          <form action={sair}><button className="botao secundario" type="submit">Sair</button></form>
        </div>
      </section>
    </main>
  );
}

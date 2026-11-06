"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import type { GrupoMenu } from "@/lib/navegacao";
import { TabelasNoCelular } from "@/components/tabelas-celular";

export function Estrutura({ grupos, tarefas, nome, email, sair, pendencias, children }: {
  grupos: GrupoMenu[]; tarefas: boolean; nome: string; email: string; sair: () => Promise<void>; pendencias: number; children: React.ReactNode;
}) {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [caminho]);
  // Celular: menu aberto trava a rolagem da página e fecha no Esc.
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", fechar);
    return () => { document.body.style.overflow = antes; window.removeEventListener("keydown", fechar); };
  }, [aberto]);
  const iniciais = nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const atual = (href: string) => (caminho === href || caminho.startsWith(href + "/") ? "page" : undefined);

  function buscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const termo = String(new FormData(evento.currentTarget).get("q") ?? "").trim();
    router.push(termo ? `/produto/catalogo?q=${encodeURIComponent(termo)}` : "/produto/catalogo");
  }

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("busca-geral")?.focus();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  return (
    <div className={`app${aberto ? " menu-aberto" : ""}`}>
      <aside className="menu" aria-label="Menu principal">
        <Link href="/" className="menu-marca" aria-label="Coreto, início">
          <img className="flor" src="/coreto-flor-turquesa.png" alt="" />
          <img className="nome" src="/coreto-nome-escuro.png" alt="Coreto" />
        </Link>
        <button type="button" className="menu-fechar" onClick={() => setAberto(false)} aria-label="Fechar menu"><Icone nome="fechar" tamanho={20} /></button>
        <nav className="menu-rolagem">
          <div className="menu-grupo">
            <p className="menu-grupo-nome">Geral</p>
            <Link href="/" className="menu-link" aria-current={caminho === "/" ? "page" : undefined}><Icone nome="inicio" />Início</Link>
            {tarefas && <Link href="/tarefas" className="menu-link" aria-current={atual("/tarefas")}><Icone nome="tarefas" />Minhas tarefas</Link>}
          </div>
          {grupos.map((grupo) => (
            <div className="menu-grupo" key={grupo.rotulo}>
              <p className="menu-grupo-nome">{grupo.rotulo}</p>
              {grupo.itens.map((item) => (
                <Link key={item.href} href={item.href} aria-current={atual(item.href)} className={`menu-link${item.fase ? " em-breve" : ""}`}>
                  <Icone nome={item.icone} />{item.rotulo}
                  {item.fase && <span className="fase" title={`Chega na fase ${item.fase.slice(1)}`}>{item.fase}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="menu-sair">
          <span className="avatar" aria-hidden="true">{iniciais}</span>
          <div><strong>{nome}</strong><span>{email}</span></div>
          <form action={sair}><button className="botao leve pequeno" type="submit"><Icone nome="sair" />Sair</button></form>
        </div>
      </aside>
      {aberto && <button type="button" className="menu-fundo" aria-label="Fechar menu" onClick={() => setAberto(false)} />}
      <div className="conteudo">
        <div className="barra-movel">
          <button type="button" className="barra-movel-menu" onClick={() => setAberto((v) => !v)} aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-expanded={aberto}>
            <Icone nome="menu" tamanho={22} />
          </button>
          <Link href="/" className="barra-movel-marca" aria-label="Coreto, início">
            <img className="flor" src="/coreto-flor-turquesa.png" alt="" />
            <img className="nome" src="/coreto-nome-escuro.png" alt="Coreto" />
          </Link>
          <div className="barra-movel-acoes">
            <Link className="icone-botao" href="/configuracoes/acessos" aria-label={pendencias ? `${pendencias} pedido(s) de acesso` : "Avisos"}>
              <Icone nome="sino" />{pendencias > 0 && <span className="ponto" />}
            </Link>
            <Link className="avatar" href="/conta" aria-label="Minha conta" style={{ textDecoration: "none" }}>{iniciais}</Link>
          </div>
        </div>
        <header className="topo">
          <form className="busca" role="search" onSubmit={buscar}>
            <Icone nome="busca" />
            <input id="busca-geral" name="q" placeholder="Buscar produto ou SKU" aria-label="Buscar produto ou SKU" />
            <kbd>Ctrl K</kbd>
          </form>
          <div className="topo-acoes">
            <Link className="icone-botao" href="/configuracoes/acessos" aria-label={pendencias ? `${pendencias} pedido(s) de acesso` : "Avisos"}>
              <Icone nome="sino" />{pendencias > 0 && <span className="ponto" />}
            </Link>
            <form action={sair}><button className="icone-botao" type="submit" aria-label="Sair" title="Sair"><Icone nome="sair" /></button></form>
            <Link className="usuario" href="/conta" title="Minha conta" style={{ color: "inherit" }}>
              <span className="avatar" aria-hidden="true">{iniciais}</span>
              <div><strong>{nome}</strong><span>{email}</span></div>
            </Link>
          </div>
        </header>
        <main className="pagina" id="conteudo">{children}</main>
        <TabelasNoCelular />
      </div>
    </div>
  );
}

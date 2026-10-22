import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { GradeQuantidades } from "@/components/grade-quantidades";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { CampoFaccao, EscolherModelo } from "@/components/recebimento/campos";
import { montarGrade, ordenarTamanhos, SITUACAO, type VarianteGrade } from "@/lib/grade";
import { dataCurta, numero, reais } from "@/lib/formatos";
import { registrarRecebimento } from "../acoes";

export const metadata = { title: "Chegada da facção" };

type Lote = {
  id: string; numero: number; recebido_em: string; referencia: string; produto_nome: string; faccao_nome: string | null;
  recebido: number; liberado: number; aguardando: number; situacao: string; pendente: boolean; pendencia: string | null;
};
type Produto = {
  id: string; referencia: string; nome: string; preco_venda: number | null;
  grades: { grade_tamanhos: { tamanho: string; ordem: number }[] } | null;
  variantes: VarianteGrade[];
};

const FILTROS = [
  { valor: "abertos", rotulo: "Em aberto" },
  { valor: "sem_preco", rotulo: "Aguardando preço" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "pronto", rotulo: "Prontos para liberar" },
  { valor: "concluido", rotulo: "Liberados" },
];

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default async function Recebimentos({ searchParams }: { searchParams: Promise<{ ver?: string; registrar?: string; produto?: string }> }) {
  const sessao = await exigir("producao");
  const { ver = "abertos", registrar, produto: produtoId } = await searchParams;
  const supabase = await supabaseServidor();
  const podeRegistrar = sessao.pode("producao", "criar") || sessao.pode("estoque", "criar");
  const podePrecificar = sessao.pode("produto", "editar");

  const { data } = await supabase.from("recebimentos_resumo")
    .select("id, numero, recebido_em, referencia, produto_nome, faccao_nome, recebido, liberado, aguardando, situacao, pendente, pendencia")
    .order("recebido_em", { ascending: false }).order("numero", { ascending: false }).limit(300);
  const todos = (data ?? []) as Lote[];
  const abertos = todos.filter((l) => ["sem_preco", "pendente", "pronto"].includes(l.situacao));
  const lista = ver === "abertos" ? abertos : todos.filter((l) => l.situacao === ver);
  const conta = (s: string) => todos.filter((l) => l.situacao === s).length;
  const pendentes = todos.filter((l) => l.pendente && l.aguardando > 0);

  // Dados da janela "Registrar chegada" (só quando ela está aberta)
  let produtos: { id: string; referencia: string; nome: string }[] = [];
  let faccoes: { id: string; nome: string }[] = [];
  let produto: Produto | null = null;
  if (registrar && podeRegistrar) {
    const [p, f] = await Promise.all([
      supabase.from("produtos").select("id, referencia, nome").is("arquivado_em", null).order("referencia"),
      supabase.from("parceiros").select("id, nome").eq("tipo", "faccao").is("arquivado_em", null).order("nome"),
    ]);
    produtos = p.data ?? [];
    faccoes = f.data ?? [];
    if (produtoId && /^[0-9a-f-]{36}$/i.test(produtoId)) {
      const { data: pr } = await supabase.from("produtos")
        .select("id, referencia, nome, preco_venda, grades(grade_tamanhos(tamanho, ordem)), variantes(id, cor_id, tamanho, ativa, cores(nome, hex))")
        .eq("id", produtoId).maybeSingle();
      produto = pr as unknown as Produto | null;
    }
  }
  const linkRegistrar = `/producao/recebimentos?ver=${ver}&registrar=1`;

  return (
    <>
      <Cabecalho
        titulo="Chegada da facção"
        descricao="Conte as peças que chegaram, precifique o modelo e libere para a loja. Até a liberação, nada aparece para venda."
        acoes={podeRegistrar && <Link className="botao" href={linkRegistrar} scroll={false}><Icone nome="mais" />Registrar chegada</Link>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="kpis">
        <Kpi destaque titulo="Peças aguardando" valor={numero(abertos.reduce((t, l) => t + l.aguardando, 0))} nota="contadas, ainda fora da loja" />
        <Kpi titulo="Aguardando preço" valor={numero(conta("sem_preco"))} nota="lotes de modelos sem preço" href="/producao/recebimentos?ver=sem_preco" />
        <Kpi titulo="Pendentes" valor={numero(conta("pendente"))} nota="faltou peça da facção" href="/producao/recebimentos?ver=pendente" />
        <Kpi titulo="Prontos para liberar" valor={numero(conta("pronto"))} nota="com preço e nada pendente" href="/producao/recebimentos?ver=pronto" />
      </div>

      {pendentes.length > 0 && (
        <section className="painel" style={{ marginBottom: 16 }}>
          <div className="painel-topo"><div><h2>Seguros com você</h2><p>Lotes pendentes porque faltou peça da facção</p></div></div>
          <div className="pendencias-lista">
            {pendentes.map((l) => (
              <Link key={l.id} className="pendencia-cartao" href={`/producao/recebimentos/${l.id}`}>
                <b>{l.produto_nome} · lote nº {l.numero}</b>
                <span>{l.pendencia ?? "Pendente"}</span>
                <small>{numero(l.aguardando)} peças aguardando{l.faccao_nome ? ` · ${l.faccao_nome}` : ""} · chegou {dataCurta(l.recebido_em)}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="painel">
        <div className="painel-topo">
          <nav className="abas" aria-label="Filtrar lotes">
            {FILTROS.map((f) => (
              <Link key={f.valor} href={`/producao/recebimentos?ver=${f.valor}`} className={ver === f.valor ? "ativa" : undefined} aria-current={ver === f.valor ? "page" : undefined}>{f.rotulo}</Link>
            ))}
          </nav>
        </div>
        {lista.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Lote</th><th>Modelo</th><th>Facção</th><th>Andamento</th><th className="num">Aguardando</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {lista.map((l) => {
                  const s = SITUACAO[l.situacao] ?? SITUACAO.vazio;
                  const p = l.recebido ? Math.round((l.liberado / l.recebido) * 100) : 0;
                  return (
                    <LinhaClicavel key={l.id} href={`/producao/recebimentos/${l.id}`}>
                      <td><Link className="linha-link" href={`/producao/recebimentos/${l.id}`}>nº {l.numero}</Link><div className="mini">{dataCurta(l.recebido_em)}</div></td>
                      <td><strong>{l.produto_nome}</strong><div className="mini">{l.referencia}</div></td>
                      <td>{l.faccao_nome ?? <span className="mini">Não informada</span>}</td>
                      <td>
                        <div className="andamento">
                          <div className="trilho-lote"><i className={p === 100 ? "completo" : ""} style={{ width: `${Math.max(p ? 4 : 0, p)}%` }} /></div>
                          <span>{numero(l.liberado)} de {numero(l.recebido)} liberadas</span>
                        </div>
                      </td>
                      <td className="num"><strong>{numero(l.aguardando)}</strong></td>
                      <td>
                        <span className={`etiqueta ${s.classe}`}>{s.rotulo}</span>
                        {l.pendente && l.pendencia && <div className="mini" style={{ marginTop: 4 }}>{l.pendencia}</div>}
                      </td>
                      <td className="num">
                        {l.situacao === "sem_preco" && podePrecificar
                          ? <Link className="botao pequeno" href={`/producao/recebimentos/${l.id}?acao=precificar`}><Icone nome="cifrao" />Precificar</Link>
                          : <Link className="botao leve pequeno" href={`/producao/recebimentos/${l.id}`}>Abrir</Link>}
                      </td>
                    </LinhaClicavel>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo={ver === "abertos" ? "Nenhum lote em aberto" : "Nenhum lote aqui"} texto={ver === "abertos" ? "Quando a facção entregar, registre a chegada contando por cor e tamanho." : "Nenhum lote nesta situação."}>
            {podeRegistrar && ver === "abertos" && <Link className="botao" href={linkRegistrar} scroll={false}><Icone nome="mais" />Registrar chegada</Link>}
          </Vazio>
        )}
      </section>

      {podeRegistrar && (
        <Suspense>
          <JanelaLateral param="registrar" limpar={["produto"]} titulo="Registrar chegada" subtitulo="Conte as peças por cor e tamanho. Elas ficam aguardando até você liberar.">
            <div className="bloco-janela">
              <h3>Modelo</h3>
              <p>O modelo precisa estar no catálogo, com as cores que a facção produziu.</p>
              {produtos.length ? (
                <EscolherModelo produtos={produtos} atual={produto?.id ?? null} />
              ) : (
                <p className="aviso alerta"><Icone nome="alerta" />Nenhum modelo no catálogo ainda.</p>
              )}
              {sessao.pode("produto", "criar") && <Link className="botao-link" style={{ display: "inline-block", marginTop: 10 }} href="/produto/catalogo/novo?voltar=recebimento">Cadastrar um modelo novo</Link>}
            </div>

            {produto && (() => {
              const tamanhos = ordenarTamanhos(produto.grades?.grade_tamanhos);
              const { linhas, celulas } = montarGrade(produto.variantes);
              return (
                <FormAcao acao={registrarRecebimento}>
                  <input type="hidden" name="produto_id" value={produto.id} />
                  <div className="bloco-janela">
                    <h3>Dados da chegada</h3>
                    <p>{produto.preco_venda == null ? "Este modelo ainda não tem preço: o lote vai aguardar a precificação." : `Preço atual do modelo: ${reais(produto.preco_venda)}.`}</p>
                    <div className="campos">
                      <CampoFaccao faccoes={faccoes} />
                      <div className="campo">
                        <label htmlFor="recebido_em">Data da chegada</label>
                        <input id="recebido_em" name="recebido_em" type="date" defaultValue={hojeSP()} max={hojeSP()} required />
                      </div>
                      <div className="campo">
                        <label htmlFor="observacao">Observação</label>
                        <input id="observacao" name="observacao" placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                  <div className="bloco-janela">
                    <h3>Contagem · {produto.nome}</h3>
                    <p>Deixe em branco o que não chegou.{sessao.pode("produto", "editar") ? " Faltou uma cor? Edite o modelo no catálogo." : ""}</p>
                    {linhas.length
                      ? <GradeQuantidades linhas={linhas} tamanhos={tamanhos} celulas={celulas} />
                      : <p className="aviso alerta"><Icone nome="alerta" />Este modelo não tem cores ativas. Edite o modelo e escolha as cores.</p>}
                  </div>
                  <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Registrando…">Registrar chegada</BotaoEnviar></div>
                </FormAcao>
              );
            })()}
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { GradeQuantidades, type CelulaGrade } from "@/components/grade-quantidades";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { EscolhaLiberar } from "@/components/recebimento/campos";
import { montarGrade, ordenarTamanhos, SITUACAO, type VarianteGrade } from "@/lib/grade";
import { ROTULO_TIPO } from "@/lib/estoque";
import { dataCurta, numero, quando, reais } from "@/lib/formatos";
import { complementarRecebimento, liberarRecebimento, salvarPendencia } from "../../acoes";

type Lote = {
  id: string; numero: number; produto_id: string; recebido_em: string; referencia: string; produto_nome: string; preco_venda: number | null;
  faccao_nome: string | null; pendente: boolean; pendencia: string | null; observacao: string | null;
  recebido: number; liberado: number; aguardando: number; situacao: string; criado_em: string;
};
type Item = { variante_id: string; recebido: number; liberado: number; aguardando: number };
type Mov = { id: number; tipo: string; quantidade: number; ocorrido_em: string; observacao: string | null; variantes: { sku: string } | null; destino: { nome: string } | null; quem: { nome: string } | null };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("recebimentos").select("numero").eq("id", (await params).id).maybeSingle();
  return { title: data ? `Lote nº ${data.numero}` : "Lote" };
}

export default async function Lote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ registrado?: string }> }) {
  const sessao = await exigir("producao");
  const { id } = await params;
  const { registrado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("recebimentos_resumo").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const lote = data as Lote;

  const [{ data: produtoR }, { data: itensR }, { data: movR }, { data: destinos }] = await Promise.all([
    supabase.from("produtos").select("grades(grade_tamanhos(tamanho, ordem)), variantes(id, cor_id, tamanho, ativa, cores(nome, hex))").eq("id", lote.produto_id).single(),
    supabase.from("recebimento_itens").select("variante_id, recebido, liberado, aguardando").eq("recebimento_id", id),
    supabase.from("movimentacoes_estoque")
      .select("id, tipo, quantidade, ocorrido_em, observacao, variantes(sku), destino:locais_estoque!local_destino_id(nome), quem:pessoas!registrado_por(nome)")
      .eq("documento_tipo", "recebimento").eq("documento_id", id).order("id", { ascending: false }).limit(200),
    supabase.from("locais_estoque").select("id, nome, tipo").in("tipo", ["loja", "deposito"]).is("arquivado_em", null).order("tipo", { ascending: false }),
  ]);
  const produto = produtoR as unknown as { grades: { grade_tamanhos: { tamanho: string; ordem: number }[] } | null; variantes: VarianteGrade[] };
  const itens = new Map(((itensR ?? []) as Item[]).map((i) => [i.variante_id, i]));
  const tamanhos = ordenarTamanhos(produto.grades?.grade_tamanhos);
  const { linhas, celulas } = montarGrade(produto.variantes, new Set(itens.keys()));
  const linhasDoLote = linhas.filter((l) => tamanhos.some((t) => itens.get(celulas[`${l.corId}|${t}`]?.varianteId ?? "")?.recebido));

  const paraLiberar: Record<string, CelulaGrade> = {};
  for (const [k, c] of Object.entries(celulas)) {
    const i = itens.get(c.varianteId);
    if (i && i.aguardando > 0) paraLiberar[k] = { varianteId: c.varianteId, maximo: i.aguardando };
  }
  const linhasLiberar = linhas.filter((l) => tamanhos.some((t) => paraLiberar[`${l.corId}|${t}`]));
  const movimentos = (movR ?? []) as unknown as Mov[];
  const s = SITUACAO[lote.situacao] ?? SITUACAO.vazio;
  const podeLiberar = sessao.pode("producao", "aprovar");
  const podeEditar = sessao.pode("producao", "editar") || sessao.pode("estoque", "criar");
  const podePrecificar = sessao.pode("produto", "editar");
  const linkPrecificar = `/produto/precificacao/${lote.produto_id}?voltar=${lote.id}`;
  const base = `/producao/recebimentos/${lote.id}`;
  const semPreco = lote.preco_venda == null;
  const pLib = lote.recebido ? (lote.liberado / lote.recebido) * 100 : 0;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Chegada da facção", href: "/producao/recebimentos" }]}
        titulo={`Lote nº ${lote.numero} · ${lote.produto_nome}`}
        descricao={[`Chegou em ${dataCurta(lote.recebido_em)}`, lote.faccao_nome ? `facção ${lote.faccao_nome}` : null, lote.observacao].filter(Boolean).join(", ")}
        acoes={<>
          <span className={`etiqueta ${s.classe}`} title={s.ajuda} style={{ fontSize: 13, padding: "6px 14px", alignSelf: "center" }}>{s.rotulo}</span>
          {podeEditar && <Link className="botao leve" href={`${base}?acao=complemento`} scroll={false}><Icone nome="entrada" />Chegou o que faltava</Link>}
          {podeEditar && lote.aguardando > 0 && !lote.pendente && <Link className="botao secundario" href={`${base}?acao=pendencia`} scroll={false}><Icone nome="alerta" />Segurar o lote</Link>}
          {podeLiberar && lote.aguardando > 0 && !semPreco && <Link className="botao" href={`${base}?acao=liberar`} scroll={false}><Icone nome="certo" />Liberar peças</Link>}
          {semPreco && lote.aguardando > 0 && podePrecificar && <Link className="botao" href={linkPrecificar}><Icone nome="cifrao" />Precificar</Link>}
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>
      {registrado && <p className="aviso ok" role="status"><Icone nome="certo" />Chegada registrada: {numero(lote.recebido)} peças aguardando liberação.</p>}

      {lote.pendente && (
        <div className="lote-alerta" role="status">
          <div><strong>Lote seguro: faltou peça da facção</strong>{lote.pendencia}</div>
          {podeEditar && <Link className="botao secundario pequeno" href={`${base}?acao=pendencia`} scroll={false}><Icone nome="certo" />Resolver pendência</Link>}
        </div>
      )}
      {semPreco && lote.aguardando > 0 && (
        <div className="lote-alerta" role="status">
          <div><strong>{lote.produto_nome} ainda não tem preço de venda</strong>{podePrecificar ? "Precifique o modelo para poder liberar as peças." : "Peça para quem precifica definir o preço."}</div>
          {podePrecificar && <Link className="botao pequeno" href={linkPrecificar}><Icone nome="cifrao" />Precificar agora</Link>}
        </div>
      )}

      <div className="kpis">
        <Kpi destaque titulo="Aguardando liberação" valor={numero(lote.aguardando)} nota="peças contadas, fora da venda" />
        <Kpi titulo="Chegaram" valor={numero(lote.recebido)} nota="somando complementos" />
        <Kpi titulo="Liberadas" valor={numero(lote.liberado)} nota="já estão à venda" />
        <Kpi titulo="Preço de venda" valor={reais(lote.preco_venda)} nota={semPreco ? "falta precificar" : "do catálogo"} href={podePrecificar ? linkPrecificar : undefined} />
      </div>

      <section className="painel" style={{ marginBottom: 16 }}>
        <div className="painel-topo"><div><h2>Contagem do lote</h2><p>Em cada tamanho: peças aguardando, e quantas chegaram no total.</p></div></div>
        <div className="progresso-lote">
          <div className="barra-lote" aria-label={`${Math.round(pLib)}% liberado`}>
            <i style={{ width: `${pLib}%`, background: "var(--tinta)" }} />
            <i style={{ width: `${100 - pLib}%`, background: lote.pendente ? "#f2c879" : "var(--azul)" }} />
          </div>
          <div className="legenda-lote">
            <span><i style={{ background: "var(--tinta)" }} />Liberadas <b>{numero(lote.liberado)}</b></span>
            <span><i style={{ background: lote.pendente ? "#f2c879" : "var(--azul)" }} />Aguardando <b>{numero(lote.aguardando)}</b></span>
            <span>Total que chegou <b>{numero(lote.recebido)}</b></span>
          </div>
        </div>
        <div className="tabela-rolagem">
          <table className="matriz">
            <thead><tr><th scope="col" style={{ textAlign: "left" }}>Cor</th>{tamanhos.map((t) => <th scope="col" key={t}>{t}</th>)}</tr></thead>
            <tbody>
              {linhasDoLote.map((l) => (
                <tr key={l.corId}>
                  <th scope="row"><i className="amostra" style={{ background: l.hex ?? "#fff", marginRight: 8 }} />{l.nome}</th>
                  {tamanhos.map((t) => {
                    const i = itens.get(celulas[`${l.corId}|${t}`]?.varianteId ?? "");
                    if (!i || !i.recebido) return <td key={t} className="inativa">—</td>;
                    return (
                      <td key={t} className={i.aguardando ? "cheia" : "vazia"}>
                        <span className="qtd">{numero(i.aguardando)}</span>
                        <span className="codigo">de {numero(i.recebido)}{i.liberado ? `, ${numero(i.liberado)} liberadas` : ""}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="painel">
        <div className="painel-topo"><div><h2>Histórico do lote</h2><p>Tudo o que entrou e saiu deste lote</p></div></div>
        <ul className="lista-simples">
          {movimentos.map((m) => (
            <li key={m.id}>
              <div className="item">
                <span className={`marcador ${m.tipo === "liberacao" ? "escuro" : m.tipo === "estorno" ? "rosa" : ""}`}><Icone nome={m.tipo === "liberacao" ? "certo" : m.tipo === "estorno" ? "alerta" : "entrada"} /></span>
                <div><strong>{ROTULO_TIPO[m.tipo] ?? m.tipo} · {numero(m.quantidade)} {m.variantes?.sku}</strong><span>{quando(m.ocorrido_em)}, {m.quem?.nome ?? "Sistema"}{m.destino ? ` → ${m.destino.nome}` : ""}{m.tipo === "estorno" && m.observacao ? `. ${m.observacao}` : ""}</span></div>
              </div>
            </li>
          ))}
          {!movimentos.length && <li>Nada registrado ainda.</li>}
        </ul>
      </section>

      {/* ---------- janelas ---------- */}
      {podeLiberar && lote.aguardando > 0 && !semPreco && (
        <Suspense>
          <JanelaLateral param="acao" valor="liberar" titulo="Liberar peças" subtitulo={`Lote nº ${lote.numero} · ${lote.produto_nome} · ${reais(lote.preco_venda)}`}>
            <FormAcao acao={liberarRecebimento}>
              <input type="hidden" name="id" value={lote.id} />
              <div className="bloco-janela">
                <h3>Para onde vão</h3>
                <p>As peças liberadas aparecem para venda neste local.</p>
                <div className="campo">
                  <select id="destino_id" name="destino_id" defaultValue={(destinos ?? []).find((d) => d.tipo === "loja")?.id ?? ""} required aria-label="Local de destino">
                    {(destinos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="bloco-janela">
                <h3>Quanto liberar</h3>
                <p>{lote.pendente ? "Este lote está pendente: libere só o que pode ir para a loja agora." : "Libere tudo ou só uma parte."}</p>
                <EscolhaLiberar linhas={linhasLiberar} tamanhos={tamanhos} celulas={paraLiberar} aguardando={lote.aguardando} />
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Liberando…">Liberar peças</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}

      {podeEditar && (
        <Suspense>
          <JanelaLateral param="acao" valor="pendencia" titulo={lote.pendente ? "Resolver pendência" : "Segurar o lote"}
            subtitulo={lote.pendente ? "Chegou o que faltava ou decidiu liberar assim mesmo?" : "Faltou peça da facção? O lote fica marcado como pendente até você resolver."}>
            <FormAcao acao={salvarPendencia}>
              <input type="hidden" name="id" value={lote.id} />
              <input type="hidden" name="pendente" value={lote.pendente ? "0" : "1"} />
              <div className="bloco-janela">
                {lote.pendente ? (
                  <>
                    <h3>O que estava faltando</h3>
                    <p style={{ fontSize: 14, color: "var(--tinta)" }}>{lote.pendencia}</p>
                    <p>Se as peças chegaram, registre também em “Chegou o que faltava”.</p>
                  </>
                ) : (
                  <div className="campo">
                    <label htmlFor="pendencia">O que faltou</label>
                    <textarea id="pendencia" name="pendencia" rows={4} defaultValue={lote.pendencia ?? ""} placeholder="Ex.: faltaram 3 P pretas; a facção manda sexta" required />
                  </div>
                )}
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>{lote.pendente ? "Marcar como resolvida" : "Segurar o lote"}</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}

      {podeEditar && (
        <Suspense>
          <JanelaLateral param="acao" valor="complemento" titulo="Chegou o que faltava" subtitulo={`Some as peças ao lote nº ${lote.numero}`}>
            <FormAcao acao={complementarRecebimento}>
              <input type="hidden" name="id" value={lote.id} />
              <div className="bloco-janela">
                <h3>Contagem do complemento</h3>
                <p>Digite só as peças que chegaram agora.</p>
                <GradeQuantidades linhas={linhas} tamanhos={tamanhos} celulas={celulas} />
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Somando…">Somar ao lote</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

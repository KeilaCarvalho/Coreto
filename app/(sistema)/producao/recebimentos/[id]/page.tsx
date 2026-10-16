import Link from "next/link";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { GradeQuantidades, type CelulaGrade } from "@/components/grade-quantidades";
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

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Chegada da facção", href: "/producao/recebimentos" }]}
        titulo={`Lote nº ${lote.numero} · ${lote.produto_nome}`}
        descricao={[`Chegou em ${dataCurta(lote.recebido_em)}`, lote.faccao_nome ? `facção ${lote.faccao_nome}` : null, lote.observacao].filter(Boolean).join(", ")}
        acoes={<span className={`etiqueta ${s.classe}`} title={s.ajuda} style={{ fontSize: 13, padding: "6px 14px" }}>{s.rotulo}</span>}
      />
      {registrado && <p className="aviso ok" role="status"><Icone nome="certo" />Chegada registrada: {numero(lote.recebido)} peças aguardando liberação.</p>}
      {lote.pendente && <p className="aviso alerta" role="status"><Icone nome="alerta" />Pendente: {lote.pendencia}</p>}
      {lote.preco_venda == null && lote.aguardando > 0 && (
        <p className="aviso alerta"><Icone nome="alerta" />{lote.produto_nome} ainda não tem preço de venda. {podePrecificar ? <Link href={`/produto/precificacao/${lote.produto_id}?voltar=${lote.id}`}>Precificar agora</Link> : "Peça para quem precifica definir o preço."}</p>
      )}

      <div className="kpis">
        <Kpi destaque titulo="Aguardando liberação" valor={numero(lote.aguardando)} nota="peças contadas, fora da venda" />
        <Kpi titulo="Chegaram" valor={numero(lote.recebido)} nota="somando complementos" />
        <Kpi titulo="Liberadas" valor={numero(lote.liberado)} nota="já estão à venda" />
        <Kpi titulo="Preço de venda" valor={reais(lote.preco_venda)} nota={lote.preco_venda == null ? "falta precificar" : "do catálogo"} href={podePrecificar ? `/produto/precificacao/${lote.produto_id}?voltar=${lote.id}` : undefined} />
      </div>

      <section className="painel" style={{ marginBottom: 16 }}>
        <div className="painel-topo"><div><h2>Contagem do lote</h2><p>Em cada tamanho: peças aguardando, e quantas chegaram no total.</p></div></div>
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

      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo"><div><h2>Liberar para venda</h2><p>Libere tudo ou só o que pode ir para a loja agora. O resto continua aguardando.</p></div></div>
          <div className="painel-corpo">
            {!podeLiberar ? (
              <p className="mini">Seu perfil conta as peças. A liberação é feita por quem aprova a produção.</p>
            ) : lote.aguardando === 0 ? (
              <p className="mini">Não há peças aguardando neste lote.</p>
            ) : lote.preco_venda == null ? (
              <p className="mini">Defina o preço de venda do modelo para liberar.</p>
            ) : (
              <FormAcao acao={liberarRecebimento}>
                <input type="hidden" name="id" value={lote.id} />
                <div className="campo" style={{ maxWidth: 260, marginBottom: 14 }}>
                  <label htmlFor="destino_id">Vai para</label>
                  <select id="destino_id" name="destino_id" defaultValue={(destinos ?? []).find((d) => d.tipo === "loja")?.id ?? ""} required>
                    {(destinos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
                <GradeQuantidades key={`l${lote.aguardando}`} linhas={linhasLiberar} tamanhos={tamanhos} celulas={paraLiberar} comBotoes />
                <div className="formulario-rodape"><BotaoEnviar enviando="Liberando…">Liberar peças</BotaoEnviar></div>
              </FormAcao>
            )}
          </div>
        </section>

        <div style={{ display: "grid", gap: 16 }}>
          {podeEditar && (
            <section className="painel">
              <div className="painel-topo"><div><h2>Pendência</h2><p>Faltou peça? Anote aqui e o lote fica marcado até resolver.</p></div></div>
              <div className="painel-corpo">
                <FormAcao acao={salvarPendencia} className="campos">
                  <input type="hidden" name="id" value={lote.id} />
                  <input type="hidden" name="pendente" value={lote.pendente ? "0" : "1"} />
                  {!lote.pendente && (
                    <div className="campo">
                      <label htmlFor="pendencia">O que faltou</label>
                      <textarea id="pendencia" name="pendencia" defaultValue={lote.pendencia ?? ""} placeholder="Ex.: faltaram 3 P pretas; facção manda sexta" />
                    </div>
                  )}
                  <BotaoEnviar className={lote.pendente ? "botao" : "botao secundario"}>{lote.pendente ? "Marcar como resolvida" : "Marcar como pendente"}</BotaoEnviar>
                </FormAcao>
              </div>
            </section>
          )}
          {podeEditar && (
            <section className="painel">
              <div className="painel-topo"><div><h2>Chegou o que faltava</h2><p>Some as peças ao mesmo lote.</p></div></div>
              <div className="painel-corpo">
                <details>
                  <summary className="botao leve pequeno">Registrar complemento</summary>
                  <div style={{ marginTop: 12 }}>
                    <FormAcao acao={complementarRecebimento} limparAoSalvar>
                      <input type="hidden" name="id" value={lote.id} />
                      <GradeQuantidades key={`c${lote.recebido}`} linhas={linhas} tamanhos={tamanhos} celulas={celulas} />
                      <div className="formulario-rodape"><BotaoEnviar enviando="Somando…">Somar ao lote</BotaoEnviar></div>
                    </FormAcao>
                  </div>
                </details>
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2>Histórico do lote</h2></div></div>
        <ul className="lista-simples">
          {movimentos.map((m) => (
            <li key={m.id}>
              <div className="item">
                <span className={`marcador ${m.tipo === "liberacao" ? "" : m.tipo === "estorno" ? "rosa" : "areia"}`}><Icone nome={m.tipo === "liberacao" ? "certo" : m.tipo === "estorno" ? "alerta" : "entrada"} /></span>
                <div><strong>{ROTULO_TIPO[m.tipo] ?? m.tipo} · {numero(m.quantidade)} {m.variantes?.sku}</strong><span>{quando(m.ocorrido_em)}, {m.quem?.nome ?? "Sistema"}{m.destino ? ` → ${m.destino.nome}` : ""}{m.tipo === "estorno" && m.observacao ? `. ${m.observacao}` : ""}</span></div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

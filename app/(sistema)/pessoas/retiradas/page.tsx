import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, JanelaLateral } from "@/components/janela-lateral";
import { FormRetirada } from "@/components/retiradas/form-retirada";
import { SITUACAO_PARCELA, emAberto, proximoDia7, totalRetirada, type Retirada } from "@/lib/retiradas";
import { dataCurta, reais } from "@/lib/formatos";
import { definirParcelas, excluirRetirada, mudarParcela } from "./acoes";

export const metadata = { title: "Retiradas" };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const pct = (d: number | null) => (d == null ? "preço de custo" : `${Math.round(d * 100)}%`);

export default async function Retiradas({ searchParams }: { searchParams: Promise<{ ver?: string; retirada?: string; nova?: string }> }) {
  await exigir("pessoas", "aprovar");
  const { ver = "abertas", retirada: abrir } = await searchParams;
  const hoje = hojeSP();
  const supabase = await supabaseServidor();
  const [{ data: rR }, { data: pR }, { data: regR }] = await Promise.all([
    supabase.from("retiradas").select("id, pessoa_id, data, abatimentos, desconto_extra, total_combinado, observacao, itens:retirada_itens(id, descricao, preco, desconto, liquido), parcelas:retirada_parcelas(id, retirada_id, numero, de, vencimento, valor, situacao, folha_mes, observacao)").order("data", { ascending: false }).order("id", { ascending: false }),
    supabase.from("pessoas").select("id, nome").is("arquivado_em", null).order("nome"),
    supabase.from("folha_regras").select("pessoa_id, retirada_desconto"),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  const todas = ((rR ?? []) as unknown as Retirada[]).map((r) => ({
    ...r, desconto_extra: num(r.desconto_extra), total_combinado: r.total_combinado == null ? null : num(r.total_combinado),
    abatimentos: Array.isArray(r.abatimentos) ? r.abatimentos.map((a) => ({ ...a, valor: num(a.valor) })) : [],
    itens: r.itens.map((i) => ({ ...i, preco: num(i.preco), liquido: num(i.liquido), desconto: i.desconto == null ? null : num(i.desconto) })),
    parcelas: [...r.parcelas].map((p) => ({ ...p, valor: num(p.valor) })).sort((a, b) => a.numero - b.numero),
  }));
  const pessoas = (pR ?? []) as { id: string; nome: string }[];
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "?";
  const descontoDe = new Map(((regR ?? []) as { pessoa_id: string; retirada_desconto: number }[]).map((r) => [r.pessoa_id, num(r.retirada_desconto)]));
  const lista = ver === "todas" ? todas : todas.filter((r) => emAberto(r) > 0);
  const totalAberto = todas.reduce((t, r) => t + emAberto(r), 0);
  // Próximo dia 7: o deste mês se ainda não passou, senão o do mês seguinte.
  const venceProx = hoje.slice(8, 10) <= "07" ? `${hoje.slice(0, 7)}-07` : proximoDia7(hoje);
  const doProximo = todas.flatMap((r) => r.parcelas).filter((p) => p.situacao === "aberta" && p.vencimento <= venceProx);
  const semParcelas = todas.filter((r) => !r.parcelas.length);
  const aberta = abrir ? todas.find((r) => String(r.id) === abrir) ?? null : null;
  const conta = aberta ? totalRetirada(aberta) : null;

  return (
    <>
      <Cabecalho
        titulo="Retiradas"
        descricao="Peças que a equipe leva da loja: desconto, prêmios abatidos e parcelas no dia 7. Na folha de cada mês você escolhe se desconta a parcela."
        acoes={<>
          <Link className="botao leve" href="/pessoas/folha"><Icone nome="folha" />Folha</Link>
          <Link className="botao" href={`/pessoas/retiradas?ver=${ver}&nova=1`} scroll={false}><Icone nome="mais" />Nova retirada</Link>
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="kpis fx-kpis fx-fechamento">
        <Kpi destaque titulo="Em aberto" valor={reais(totalAberto)} nota={`${todas.filter((r) => emAberto(r) > 0).length} retiradas`} />
        <Kpi titulo={`Vence até ${dataCurta(venceProx).slice(0, 5)}`} valor={reais(doProximo.reduce((t, p) => t + p.valor, 0))} nota={`${doProximo.length} parcelas`} />
        <Kpi titulo="Sem parcelas" valor={reais(semParcelas.reduce((t, r) => t + totalRetirada(r).total, 0))} nota={semParcelas.length ? semParcelas.map((r) => nome(r.pessoa_id).split(" ")[0]).join(", ") : "tudo parcelado"} />
        <Kpi titulo="Retiradas no ano" valor={String(todas.filter((r) => r.data.slice(0, 4) === hoje.slice(0, 4)).length)} nota={`${reais(todas.filter((r) => r.data.slice(0, 4) === hoje.slice(0, 4)).reduce((t, r) => t + totalRetirada(r).total, 0))} no total`} />
      </div>

      <section className="painel">
        <div className="painel-topo">
          <nav className="abas" aria-label="Filtrar">
            <Link href="/pessoas/retiradas?ver=abertas" className={ver !== "todas" ? "ativa" : undefined}>Em aberto</Link>
            <Link href="/pessoas/retiradas?ver=todas" className={ver === "todas" ? "ativa" : undefined}>Todas</Link>
          </nav>
        </div>
        {lista.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Pessoa</th><th>Dia</th><th>Peças</th><th className="num">Total a pagar</th><th>Parcelas</th><th className="num">Em aberto</th></tr></thead>
              <tbody>
                {lista.map((r) => {
                  const c = totalRetirada(r);
                  const pagas = r.parcelas.filter((p) => p.situacao !== "aberta").length;
                  return (
                    <LinhaClicavel key={r.id} href={`/pessoas/retiradas?ver=${ver}&retirada=${r.id}`}>
                      <td><Link className="linha-link" href={`/pessoas/retiradas?ver=${ver}&retirada=${r.id}`} scroll={false}>{nome(r.pessoa_id)}</Link></td>
                      <td>{dataCurta(r.data)}</td>
                      <td>{r.itens.length} {r.itens.length === 1 ? "peça" : "peças"}<div className="mini">{r.itens.slice(0, 2).map((i) => i.descricao).join(", ")}{r.itens.length > 2 ? "…" : ""}</div></td>
                      <td className="num"><strong>{reais(c.total)}</strong>{c.abat > 0 && <div className="mini">−{reais(c.abat)} de abatimento</div>}</td>
                      <td>{r.parcelas.length ? <>{pagas}/{r.parcelas.length} pagas<div className="mini">{r.parcelas.length}x de {reais(r.parcelas[0].valor)}</div></> : <span className="etiqueta alerta">A definir</span>}</td>
                      <td className="num">{emAberto(r) > 0 ? <strong>{reais(emAberto(r))}</strong> : <span className="etiqueta ok">Quitada</span>}</td>
                    </LinhaClicavel>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Vazio titulo={ver === "todas" ? "Nenhuma retirada" : "Nada em aberto"} texto="Registre aqui as peças que a equipe leva da loja." />}
      </section>

      <Suspense>
        <JanelaLateral param="nova" titulo="Nova retirada" subtitulo="Peças, abatimentos e parcelas." larga>
          <FormRetirada hoje={hoje} pessoas={pessoas.map((p) => ({ ...p, desconto: descontoDe.get(p.id) ?? 0.3 }))} />
        </JanelaLateral>
      </Suspense>

      {aberta && conta && (
        <Suspense>
          <JanelaLateral param="retirada" valor={String(aberta.id)} titulo={`Retirada de ${nome(aberta.pessoa_id)}`} subtitulo={`${dataCurta(aberta.data)} · total ${reais(conta.total)}`} larga>
            <div className="bloco-janela">
              <h3>Peças</h3>
              <ul className="fx-lista">
                {aberta.itens.map((i) => (
                  <li key={i.id}><span>{i.descricao}<div className="mini">{reais(i.preco)} · {pct(i.desconto)}</div></span><span className="fx-valor">{reais(i.liquido)}</span></li>
                ))}
                {aberta.abatimentos.map((a, k) => <li key={`a${k}`}><span>{a.descricao}</span><span className="fx-valor atrasado">−{reais(a.valor)}</span></li>)}
                {aberta.desconto_extra > 0 && <li><span>Desconto extra no total</span><span className="fx-valor">{Math.round(aberta.desconto_extra * 100)}%</span></li>}
              </ul>
              <div className="fx-rodape" style={{ margin: "8px 0 0" }}><span>Total a pagar{conta.combinado ? " (combinado)" : ""}</span><span>{reais(conta.total)}</span></div>
              {conta.combinado && Math.abs(conta.calculado - conta.total) > 0.009 && <p className="mini" style={{ marginTop: 8 }}>Pela conta daria {reais(conta.calculado)}; ficou combinado {reais(conta.total)}.</p>}
              {aberta.observacao && <p className="mini" style={{ marginTop: 8 }}>{aberta.observacao}</p>}
            </div>

            <div className="bloco-janela">
              <h3>Parcelas</h3>
              {aberta.parcelas.length ? (
                <ul className="fx-lista">
                  {aberta.parcelas.map((p) => {
                    const s = SITUACAO_PARCELA[p.situacao];
                    return (
                      <li key={p.id}>
                        <span><b>{p.numero}/{p.de}</b> · vence {dataCurta(p.vencimento)} · {reais(p.valor)}
                          <div className="mini">{p.folha_mes ? `Descontada na folha de ${dataCurta(p.folha_mes).slice(3)}` : ""}</div></span>
                        <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <span className={`etiqueta ${s.classe}`}>{s.rotulo}</span>
                          {p.situacao === "aberta" ? <>
                            <form action={mudarParcela}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="situacao" value="paga" /><button className="botao leve pequeno" type="submit">Paga</button></form>
                            <form action={mudarParcela}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="situacao" value="perdoada" /><button className="botao leve pequeno" type="submit">Perdoar</button></form>
                          </> : (
                            <form action={mudarParcela}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="situacao" value="aberta" /><button className="botao-link" type="submit">Reabrir</button></form>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <FormAcao acao={definirParcelas}>
                  <input type="hidden" name="id" value={aberta.id} />
                  <input type="hidden" name="total" value={conta.total} />
                  <p>Ainda sem parcelas. Total de {reais(conta.total)}.</p>
                  <div className="campos duas">
                    <div className="campo"><label htmlFor="dp-n">Quantas vezes</label><input id="dp-n" name="parcelas" inputMode="numeric" defaultValue="3" /></div>
                    <div className="campo"><label htmlFor="dp-v">Primeira vence</label><input id="dp-v" name="primeiro_vencimento" type="date" defaultValue={proximoDia7(hoje)} /></div>
                  </div>
                  <div style={{ marginTop: 12 }}><BotaoEnviar className="botao pequeno">Criar parcelas</BotaoEnviar></div>
                </FormAcao>
              )}
            </div>

            <div className="bloco-janela">
              <FormAcao acao={excluirRetirada}>
                <input type="hidden" name="id" value={aberta.id} />
                <BotaoEnviar className="botao-link perigo" enviando="Excluindo…">Excluir esta retirada</BotaoEnviar>
              </FormAcao>
            </div>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

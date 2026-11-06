import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, JanelaLateral } from "@/components/janela-lateral";
import { FormSaidaFotos, type VarianteFoto } from "@/components/marketing/form-saida";
import { ROTULO_TIPO } from "@/lib/estoque";
import { hojeSP } from "@/lib/tarefas";
import { dataCurta } from "@/lib/formatos";
import { devolverPecas } from "./acoes";

export const metadata = { title: "Peças para fotos" };

type Local = { id: string; nome: string; tipo: string };
type Var = { id: string; tamanho: string; produtos: { referencia: string; nome: string } | null; cores: { nome: string; hex: string | null } | null };
type Mov = { id: number; tipo: string; quantidade: number; ocorrido_em: string; observacao: string | null; variante_id: string; local_origem_id: string | null; local_destino_id: string | null };

export default async function PecasParaFotos() {
  const sessao = await exigir("marketing");
  const supabase = await supabaseServidor();
  const hoje = hojeSP();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const [{ data: locaisR }, { data: saldosR }, { data: movsR }] = await Promise.all([
    supabase.from("locais_estoque").select("id, nome, tipo").is("arquivado_em", null),
    supabase.rpc("saldos_para_fotos"),
    supabase.from("movimentacoes_estoque").select("id, tipo, quantidade, ocorrido_em, observacao, variante_id, local_origem_id, local_destino_id")
      .in("tipo", ["emprestimo_marketing", "devolucao_marketing", "brinde"]).order("ocorrido_em", { ascending: false }).limit(300),
  ]);
  const locais = (locaisR ?? []) as Local[];
  const marketing = locais.find((l) => l.tipo === "marketing");
  const ORDEM = ["loja", "recebimento", "deposito"];
  const origens = locais.filter((l) => ORDEM.includes(l.tipo)).sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
  const nomeLocal = (id: string | null) => locais.find((l) => l.id === id)?.nome ?? "—";
  const saldos = (saldosR ?? []) as { variante_id: string; local_id: string; saldo: number }[];
  const movs = (movsR ?? []) as Mov[];

  const ids = [...new Set([...saldos.map((s) => s.variante_id), ...movs.map((m) => m.variante_id)])];
  const { data: varsR } = ids.length
    ? await supabase.from("variantes").select("id, tamanho, produtos(referencia, nome), cores(nome, hex)").in("id", ids)
    : { data: [] };
  const vars = new Map(((varsR ?? []) as unknown as Var[]).map((v) => [v.id, v]));
  const nomeVar = (id: string) => { const v = vars.get(id); return v ? `${v.produtos?.referencia ?? ""} ${v.produtos?.nome ?? ""} · ${v.cores?.nome ?? ""} ${v.tamanho}` : "Peça"; };

  const variantes: VarianteFoto[] = [...vars.values()].map((v) => ({
    id: v.id, produto: v.produtos?.nome ?? "", referencia: v.produtos?.referencia ?? "", cor: v.cores?.nome ?? "", hex: v.cores?.hex ?? null, tamanho: v.tamanho,
    disponivel: Object.fromEntries(saldos.filter((s) => s.variante_id === v.id && s.local_id !== marketing?.id).map((s) => [s.local_id, s.saldo])),
  })).filter((v) => Object.keys(v.disponivel).length);

  const comMarketing = saldos.filter((s) => s.local_id === marketing?.id && s.saldo > 0).map((s) => {
    const saida = movs.find((m) => m.variante_id === s.variante_id && m.tipo === "emprestimo_marketing");
    const dias = saida ? Math.floor((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(saida.ocorrido_em)) / 864e5) : null;
    return { ...s, saida, dias, voltaPara: saida?.local_origem_id ?? origens[0]?.id };
  }).sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
  const totalCom = comMarketing.reduce((t, s) => t + s.saldo, 0);
  const doMes = movs.filter((m) => m.ocorrido_em.slice(0, 10) >= inicioMes);
  const somaTipo = (t: string) => doMes.filter((m) => m.tipo === t).reduce((x, m) => x + m.quantidade, 0);
  const atrasadas = comMarketing.filter((s) => (s.dias ?? 0) > 7).length;
  const pode = sessao.pode("marketing", "criar");

  return (
    <>
      <Cabecalho titulo="Peças para fotos" descricao="O que saiu para fotos, com quem está e o que já voltou."
        acoes={pode && <Link className="botao" href="?saida=1" scroll={false}><Icone nome="fotos" />Registrar saída</Link>} />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="kpis">
        <Kpi destaque titulo="Com o marketing agora" valor={String(totalCom)} nota={atrasadas ? `${atrasadas} há mais de 7 dias` : `${comMarketing.length} cores/tamanhos`} />
        <Kpi titulo="Saíram este mês" valor={String(somaTipo("emprestimo_marketing"))} nota="peças" />
        <Kpi titulo="Voltaram este mês" valor={String(somaTipo("devolucao_marketing"))} nota={somaTipo("brinde") ? `${somaTipo("brinde")} viraram brinde` : "peças"} />
      </div>

      <section className="painel" style={{ marginBottom: 16 }}>
        <div className="painel-topo"><div><h2>Com o marketing agora</h2><p>Toque em Devolver quando a peça voltar.</p></div></div>
        {comMarketing.length ? (
          <ul className="mf-lista">
            {comMarketing.map((s) => {
              const v = vars.get(s.variante_id);
              return (
                <li key={s.variante_id} className="mf-item">
                  <div className="mf-item-topo">
                    <span className="amostra" style={{ background: v?.cores?.hex ?? "#ccc" }} />
                    <div className="mf-item-nome"><b>{v?.produtos?.referencia} {v?.produtos?.nome}</b><span>{v?.cores?.nome} · {v?.tamanho}</span></div>
                    <span className="mf-item-qtd">{s.saldo}</span>
                  </div>
                  <p className="mini">
                    {s.saida ? <>Saiu em {dataCurta(s.saida.ocorrido_em.slice(0, 10))}{s.saida.observacao ? ` · ${s.saida.observacao}` : ""}</> : "Saída antiga"}
                    {s.dias != null && <span className={`etiqueta ${s.dias > 7 ? "alerta" : "neutra"}`} style={{ marginLeft: 8 }}>{s.dias === 0 ? "hoje" : `${s.dias} ${s.dias === 1 ? "dia" : "dias"}`}</span>}
                  </p>
                  {pode && (
                    <details className="mf-devolver">
                      <summary className="botao leve pequeno">Devolver</summary>
                      <FormAcao acao={devolverPecas} className="campos">
                        <input type="hidden" name="variante_id" value={s.variante_id} />
                        <div className="campos duas">
                          <div className="campo"><label>Quantas</label><input name="quantidade" type="number" min={1} max={s.saldo} defaultValue={s.saldo} inputMode="numeric" required /></div>
                          <div className="campo"><label>Volta para</label>
                            <select name="destino" defaultValue={s.voltaPara}>
                              {origens.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                              <option value="brinde">Ficou com alguém (brinde/permuta)</option>
                            </select>
                          </div>
                        </div>
                        <div className="campo"><label>Anotação</label><input name="observacao" placeholder="Obrigatório se ficou com alguém" /></div>
                        <BotaoEnviar enviando="Salvando…">Confirmar</BotaoEnviar>
                      </FormAcao>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <Vazio titulo="Nenhuma peça fora" texto="Quando uma peça sair para fotos, ela aparece aqui até voltar." />}
      </section>

      <section className="painel">
        <div className="painel-topo"><div><h2>Histórico</h2><p>Últimas saídas e devoluções.</p></div></div>
        {movs.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Peça</th><th>O quê</th><th className="num">Qtd.</th><th>De → para</th><th>Anotação</th></tr></thead>
              <tbody>
                {movs.slice(0, 60).map((m) => (
                  <tr key={m.id}>
                    <td data-rotulo="Quando">{dataCurta(m.ocorrido_em.slice(0, 10))}</td>
                    <td data-rotulo="Peça">{nomeVar(m.variante_id)}</td>
                    <td data-rotulo="O quê"><span className={`etiqueta ${m.tipo === "emprestimo_marketing" ? "alerta" : m.tipo === "brinde" ? "neutra" : "ok"}`}>{ROTULO_TIPO[m.tipo] ?? m.tipo}</span></td>
                    <td data-rotulo="Qtd." className="num">{m.quantidade}</td>
                    <td data-rotulo="De → para" className="mini">{nomeLocal(m.local_origem_id)} → {m.local_destino_id ? nomeLocal(m.local_destino_id) : "saiu do estoque"}</td>
                    <td data-rotulo="Anotação" className="mini">{m.observacao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="painel-corpo mini">Nada lançado ainda.</p>}
      </section>

      {pode && (
        <Suspense>
          <JanelaLateral param="saida" titulo="Saída para fotos" subtitulo="Escolha de onde sai, o modelo e quantas peças" larga>
            <FormSaidaFotos variantes={variantes} locais={origens} />
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { BotaoPdfFolha } from "@/components/folha/botao-pdf";
import { CamposItem } from "@/components/folha/campos-item";
import { calcularFolha, dataBR, percentualBR, tipoItem, type Ajuste, type Folha, type Item, type LinhaFolha, type Pessoa, type Regra } from "@/lib/folha";
import { lerLinhas } from "@/lib/fluxo";
import { reais } from "@/lib/formatos";
import { criarFolha, excluirItem, incluirPessoa, lancarItem, salvarAjuste, salvarPeriodo, salvarRegra } from "./acoes";

export const metadata = { title: "Folha" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarMes = (mes: string, n: number) => { const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 10); };
const campo = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const n = (v: unknown) => Number(v ?? 0);

function Valor({ v }: { v: number }) {
  const [inteiro, centavos] = reais(v).replace("R$", "").trim().split(",");
  return <><small>R$</small>{inteiro}{centavos !== undefined && <small style={{ verticalAlign: "baseline", marginLeft: 1 }}>,{centavos}</small>}</>;
}

export default async function PaginaFolha({ searchParams }: { searchParams: Promise<{ mes?: string; pessoa?: string; regra?: string; regras?: string; periodo?: string }> }) {
  await exigir("pessoas", "aprovar");
  const { mes: pedido, pessoa: abrirPessoa, regra: abrirRegra } = await searchParams;
  const hoje = hojeSP();
  const mesAtual = `${hoje.slice(0, 7)}-01`;
  // Até o dia 15, abre a folha do mês anterior (a que está sendo paga); depois, a do mês corrente.
  const padrao = Number(hoje.slice(8, 10)) <= 15 ? somarMes(mesAtual, -1) : mesAtual;
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) && `${pedido}-01` <= mesAtual ? `${pedido}-01` : padrao;
  const base = `/pessoas/folha?mes=${mes.slice(0, 7)}`;

  const supabase = await supabaseServidor();
  const [{ data: folhaR }, { data: regrasR }, { data: pessoasR }, { data: fluxoR }, { data: ajustesR }, { data: itensR }] = await Promise.all([
    supabase.from("folhas").select("mes, vt_inicio, vt_fim, feriados, fechada_em").eq("mes", mes).maybeSingle(),
    supabase.from("folha_regras").select("*"),
    supabase.from("pessoas").select("id, nome").is("arquivado_em", null).order("nome"),
    supabase.from("fluxo_meses").select("vendedoras").eq("mes", mes).maybeSingle(),
    supabase.from("folha_pessoas").select("pessoa_id, realizado, dias_vt").eq("mes", mes),
    supabase.from("folha_itens").select("id, pessoa_id, parte, tipo, descricao, valor").eq("mes", mes).order("id"),
  ]);
  const folha = folhaR as Folha | null;
  const regras = (regrasR ?? []) as Regra[];
  const pessoas = (pessoasR ?? []) as Pessoa[];
  const equipeFluxo = lerLinhas((fluxoR as { vendedoras: unknown } | null)?.vendedoras);
  const linhas: LinhaFolha[] = folha ? calcularFolha({
    folha, pessoas, regras, equipeFluxo, ajustes: (ajustesR ?? []) as Ajuste[], itens: ((itensR ?? []) as Item[]).map((i) => ({ ...i, valor: n(i.valor) })),
  }) : [];
  const vendedoras = linhas.filter((l) => l.vendedora || l.itensComissao.length);
  const comVt = linhas.filter((l) => l.regra.recebe_vt || l.ajudaCusto || l.bonusFixo || l.itensVt.length);
  const soma = (f: (l: LinhaFolha) => number) => linhas.reduce((t, l) => t + f(l), 0);
  const totalEquipeFluxo = equipeFluxo.reduce((t, e) => t + e.valor, 0);
  // Quem está na Equipe do fluxo e não está ligado a nenhuma vendedora da folha (ex.: Nuvemshop).
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ligados = new Set(regras.filter((r) => r.nome_no_fluxo).map((r) => norm(r.nome_no_fluxo!)));
  const semComissao = equipeFluxo.filter((e) => !ligados.has(norm(e.nome)));

  const linhaAberta = abrirPessoa ? linhas.find((l) => l.pessoa.id === abrirPessoa) ?? null : null;
  const regraAberta = abrirRegra ? regras.find((r) => r.pessoa_id === abrirRegra) ?? null : null;
  const pessoaRegra = regraAberta ? pessoas.find((p) => p.id === regraAberta.pessoa_id) : null;
  const semRegra = pessoas.filter((p) => !regras.some((r) => r.pessoa_id === p.id));
  const seguinte = somarMes(mes, 1);

  return (
    <>
      <Cabecalho
        titulo={`Folha de ${nomeMes(mes)}`}
        descricao={`Comissões de ${nomeMes(mes)} e o vale-transporte com ajuda de custo do período seguinte. As vendas de cada vendedora vêm da Equipe do fluxo financeiro.`}
        acoes={folha && <>
          <BotaoPdfFolha folha={folha} linhas={linhas} />
          <Link className="botao leve" href={`${base}&regras=1`} scroll={false}><Icone nome="equipe" />Regras da equipe</Link>
          <Link className="botao" href={`${base}&periodo=1`} scroll={false}><Icone nome="calendario" />Período do VT</Link>
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="fx-navegador" style={{ marginBottom: 18 }}>
        <Link className="fx-seta" href={`/pessoas/folha?mes=${somarMes(mes, -1).slice(0, 7)}`} aria-label="Mês anterior"><Icone nome="esquerda" /></Link>
        <span className="dia" style={{ textTransform: "capitalize" }}>{nomeMes(mes)} de {mes.slice(0, 4)}</span>
        {seguinte <= mesAtual
          ? <Link className="fx-seta" href={`/pessoas/folha?mes=${seguinte.slice(0, 7)}`} aria-label="Mês seguinte"><Icone nome="direita" /></Link>
          : <span className="fx-seta" aria-disabled="true"><Icone nome="direita" /></span>}
        {folha && <span className="selo ok"><i />VT de {dataBR(folha.vt_inicio)} a {dataBR(folha.vt_fim)}</span>}
      </div>

      {!folha ? (
        <section className="painel">
          <Vazio titulo={`A folha de ${nomeMes(mes)} ainda não começou`} texto="O sistema já traz as regras de cada pessoa, as vendas da Equipe do fluxo e o período do vale-transporte com os feriados.">
            <form action={criarFolha}><input type="hidden" name="mes" value={mes} /><BotaoEnviar enviando="Começando…">Começar a folha de {nomeMes(mes)}</BotaoEnviar></form>
          </Vazio>
        </section>
      ) : (
        <>
          {!equipeFluxo.length && <p className="aviso alerta"><Icone nome="alerta" />Ainda não tem vendas da equipe no fluxo de {nomeMes(mes)}. Lance a Equipe no fluxo financeiro ou ajuste o valor vendido de cada vendedora.</p>}
          {semComissao.length > 0 && <p className="aviso alerta"><Icone nome="alerta" />Na Equipe do fluxo, sem comissão na folha: {semComissao.map((e) => `${e.nome} (${reais(e.valor)})`).join(", ")}.</p>}

          <div className="kpis fx-kpis fx-fechamento">
            <Kpi destaque titulo="Total da folha" valor={<Valor v={soma((l) => l.total)} />} nota={`${linhas.length} pessoas`} />
            <Kpi titulo="Comissões" valor={<Valor v={soma((l) => l.somaComissao)} />} nota={`sobre ${reais(soma((l) => (l.vendedora ? l.realizado : 0)))} vendidos`} />
            <Kpi titulo="VT e ajuda de custo" valor={<Valor v={soma((l) => l.somaVt)} />} nota={`${dataBR(folha.vt_inicio).slice(0, 5)} a ${dataBR(folha.vt_fim).slice(0, 5)}`} />
            <Kpi titulo="Vendas da equipe" valor={<Valor v={totalEquipeFluxo} />} nota="na Equipe do fluxo" />
          </div>

          <section className="painel" style={{ marginBottom: 16 }}>
            <div className="painel-topo"><div><h2>Comissões</h2><p>Vendas do mês × percentual de cada vendedora, mais o que foi lançado</p></div></div>
            {vendedoras.length ? (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Vendedora</th><th className="num">Vendeu</th><th className="num">%</th><th className="num">Comissão</th><th className="num">Lançamentos</th><th className="num">A receber</th></tr></thead>
                  <tbody>
                    {vendedoras.map((l) => {
                      const lanc = l.itensComissao.reduce((t, i) => t + i.valor, 0);
                      return (
                        <LinhaClicavel key={l.pessoa.id} href={`${base}&pessoa=${l.pessoa.id}`}>
                          <td><Link className="linha-link" href={`${base}&pessoa=${l.pessoa.id}`} scroll={false}>{l.pessoa.nome}</Link>{!l.realizadoDoFluxo && l.vendedora && <div className="mini">{l.realizado ? "valor ajustado" : "sem vendas no fluxo"}</div>}</td>
                          <td className="num">{reais(l.realizado)}</td>
                          <td className="num mini">{percentualBR(l.percentual)}</td>
                          <td className="num">{reais(l.comissao)}</td>
                          <td className={`num${lanc < 0 ? " atrasado" : ""}`}>{l.itensComissao.length ? reais(lanc) : <span className="mini">—</span>}</td>
                          <td className="num"><strong>{reais(l.somaComissao)}</strong></td>
                        </LinhaClicavel>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td>Total</td><td className="num">{reais(vendedoras.reduce((t, l) => t + l.realizado, 0))}</td><td /><td className="num">{reais(vendedoras.reduce((t, l) => t + l.comissao, 0))}</td><td /><td className="num">{reais(vendedoras.reduce((t, l) => t + l.somaComissao, 0))}</td></tr></tfoot>
                </table>
              </div>
            ) : <p className="painel-corpo mini">Nenhuma vendedora com comissão. Marque em Regras da equipe.</p>}
          </section>

          <section className="painel">
            <div className="painel-topo"><div><h2>Vale-transporte e ajuda de custo</h2><p>Período de {dataBR(folha.vt_inicio)} a {dataBR(folha.vt_fim)}{folha.feriados?.length ? ` · feriados: ${folha.feriados.map((d) => dataBR(d).slice(0, 5)).join(", ")}` : ""}</p></div></div>
            {comVt.length ? (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Pessoa</th><th className="num">Dias</th><th className="num">VT</th><th className="num">Desconto 6%</th><th className="num">Ajuda de custo</th><th className="num">Bônus</th><th className="num">Lançamentos</th><th className="num">A receber</th></tr></thead>
                  <tbody>
                    {comVt.map((l) => {
                      const lanc = l.itensVt.reduce((t, i) => t + i.valor, 0);
                      return (
                        <LinhaClicavel key={l.pessoa.id} href={`${base}&pessoa=${l.pessoa.id}`}>
                          <td><Link className="linha-link" href={`${base}&pessoa=${l.pessoa.id}`} scroll={false}>{l.pessoa.nome}</Link><div className="mini">{l.regra.recebe_vt ? (l.regra.vt_conta_sabado ? "conta sábado" : "segunda a sexta") : "sem VT"}</div></td>
                          <td className="num">{l.regra.recebe_vt ? <>{l.dias}{l.diasAjustados && <div className="mini">ajustado</div>}</> : "—"}</td>
                          <td className="num">{l.vt ? reais(l.vt) : "—"}</td>
                          <td className="num">{l.descontoVt ? reais(-l.descontoVt) : "—"}</td>
                          <td className="num">{l.ajudaCusto ? reais(l.ajudaCusto) : "—"}</td>
                          <td className="num">{l.bonusFixo ? reais(l.bonusFixo) : "—"}</td>
                          <td className={`num${lanc < 0 ? " atrasado" : ""}`}>{l.itensVt.length ? reais(lanc) : <span className="mini">—</span>}</td>
                          <td className="num"><strong>{reais(l.somaVt)}</strong></td>
                        </LinhaClicavel>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td>Total</td><td /><td className="num">{reais(comVt.reduce((t, l) => t + l.vt, 0))}</td><td className="num">{reais(-comVt.reduce((t, l) => t + l.descontoVt, 0))}</td><td className="num">{reais(comVt.reduce((t, l) => t + l.ajudaCusto, 0))}</td><td className="num">{reais(comVt.reduce((t, l) => t + l.bonusFixo, 0))}</td><td /><td className="num">{reais(comVt.reduce((t, l) => t + l.somaVt, 0))}</td></tr></tfoot>
                </table>
              </div>
            ) : <p className="painel-corpo mini">Ninguém recebe VT ou ajuda de custo. Marque em Regras da equipe.</p>}
          </section>
        </>
      )}

      {/* ===== Janela: recibo de uma pessoa ===== */}
      {folha && linhaAberta && (
        <Suspense>
          <JanelaLateral param="pessoa" valor={linhaAberta.pessoa.id} titulo={linhaAberta.pessoa.nome} subtitulo={`Folha de ${nomeMes(mes)} · a receber ${reais(linhaAberta.total)}`} larga>
            <div className="bloco-janela">
              <h3>Recibo</h3>
              <ul className="fx-lista">
                {linhaAberta.vendedora && <>
                  <li><span>Vendas no mês {linhaAberta.realizadoDoFluxo ? "(Equipe do fluxo)" : "(ajustado)"}</span><span className="fx-valor">{reais(linhaAberta.realizado)}</span></li>
                  <li><span>Comissão ({percentualBR(linhaAberta.percentual)})</span><span className="fx-valor">{reais(linhaAberta.comissao)}</span></li>
                </>}
                {linhaAberta.regra.recebe_vt && <li><span>Vale-transporte ({linhaAberta.dias} dias × {reais(Number(linhaAberta.regra.vt_tarifa))})</span><span className="fx-valor">{reais(linhaAberta.vt)}</span></li>}
                {linhaAberta.descontoVt > 0 && <li><span>Desconto do VT (6%)</span><span className="fx-valor atrasado">{reais(-linhaAberta.descontoVt)}</span></li>}
                {linhaAberta.ajudaCusto > 0 && <li><span>Ajuda de custo</span><span className="fx-valor">{reais(linhaAberta.ajudaCusto)}</span></li>}
                {linhaAberta.bonusFixo > 0 && <li><span>Bônus fixo</span><span className="fx-valor">{reais(linhaAberta.bonusFixo)}</span></li>}
                {[...linhaAberta.itensComissao, ...linhaAberta.itensVt].map((i) => (
                  <li key={i.id}>
                    <span>{tipoItem(i.tipo).rotulo}{i.descricao ? ` · ${i.descricao}` : ""} <span className="mini">({i.parte === "vt" ? "VT" : "comissão"})</span></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`fx-valor${i.valor < 0 ? " atrasado" : ""}`}>{reais(i.valor)}</span>
                      <form action={excluirItem}><input type="hidden" name="id" value={i.id} /><button type="submit" className="fx-tirar" aria-label="Excluir lançamento"><Icone nome="fechar" tamanho={14} /></button></form>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="fx-rodape" style={{ margin: "8px 0 0" }}><span>Total a receber</span><span>{reais(linhaAberta.total)}</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <BotaoPdfFolha folha={folha} linhas={linhas} pessoa={linhaAberta.pessoa.id} rotulo="Baixar recibo (PDF)" classe="botao leve pequeno" />
                <Link className="botao leve pequeno" href={`${base}&regra=${linhaAberta.pessoa.id}`} scroll={false}><Icone nome="lapis" />Regra de {linhaAberta.pessoa.nome.split(" ")[0]}</Link>
              </div>
            </div>

            <div className="bloco-janela">
              <h3>Lançar no mês</h3>
              <p>Retirada de mercadoria, adiantamento, prêmio, desconto de roupa…</p>
              <FormAcao acao={lancarItem} limparAoSalvar>
                <input type="hidden" name="mes" value={mes} />
                <input type="hidden" name="pessoa_id" value={linhaAberta.pessoa.id} />
                <CamposItem parteInicial={linhaAberta.vendedora ? "comissao" : "vt"} />
                <div style={{ marginTop: 12 }}><BotaoEnviar className="botao pequeno" enviando="Lançando…">Lançar</BotaoEnviar></div>
              </FormAcao>
            </div>

            <div className="bloco-janela">
              <h3>Ajustes deste mês</h3>
              <p>Deixe em branco para usar o que o sistema calcula.</p>
              <FormAcao acao={salvarAjuste}>
                <input type="hidden" name="mes" value={mes} />
                <input type="hidden" name="pessoa_id" value={linhaAberta.pessoa.id} />
                <div className="campos duas">
                  {linhaAberta.vendedora && <div className="campo"><label htmlFor="aj-real">Vendeu no mês</label><input id="aj-real" name="realizado" inputMode="decimal" defaultValue={linhaAberta.realizadoDoFluxo ? "" : campo(linhaAberta.realizado)} placeholder={reais(linhaAberta.realizado)} /><span className="ajuda">Em branco: o valor da Equipe do fluxo.</span></div>}
                  {linhaAberta.regra.recebe_vt && <div className="campo"><label htmlFor="aj-dias">Dias de VT</label><input id="aj-dias" name="dias_vt" inputMode="numeric" defaultValue={linhaAberta.diasAjustados ? linhaAberta.dias : ""} placeholder={String(linhaAberta.dias)} /><span className="ajuda">Para faltas ou férias.</span></div>}
                </div>
                <div style={{ marginTop: 12 }}><BotaoEnviar className="botao leve pequeno">Salvar ajustes</BotaoEnviar></div>
              </FormAcao>
            </div>
          </JanelaLateral>
        </Suspense>
      )}

      {/* ===== Janela: regras da equipe ===== */}
      {folha && (
        <Suspense>
          <JanelaLateral param="regras" titulo="Regras da equipe" subtitulo="Como cada pessoa recebe. Vale para todos os meses.">
            <div className="bloco-janela">
              <ul className="fx-lista">
                {regras.map((r) => {
                  const p = pessoas.find((x) => x.id === r.pessoa_id);
                  const partes = [
                    r.comissao_percentual != null ? `comissão ${percentualBR(Number(r.comissao_percentual))}` : null,
                    r.recebe_vt ? `VT ${r.vt_conta_sabado ? "com sábado" : "seg a sex"}${r.vt_desconta ? "" : " sem desconto"}` : null,
                    n(r.ajuda_custo) ? `ajuda ${reais(n(r.ajuda_custo))}` : null,
                    n(r.bonus_fixo) ? `bônus ${reais(n(r.bonus_fixo))}` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={r.pessoa_id}>
                      <span><b>{p?.nome ?? "?"}</b>{!r.ativo && <span className="etiqueta neutra" style={{ marginLeft: 6 }}>fora da folha</span>}<div className="mini">{partes || "nada marcado"}</div></span>
                      <Link className="botao leve pequeno" href={`${base}&regra=${r.pessoa_id}`} scroll={false}>Editar</Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="bloco-janela">
              <h3>Incluir pessoa</h3>
              <FormAcao acao={incluirPessoa}>
                <div className="campos duas">
                  <div className="campo">
                    <label htmlFor="in-pessoa">Pessoa</label>
                    <select id="in-pessoa" name="pessoa_id" defaultValue="">
                      <option value="" disabled>Escolha</option>
                      {semRegra.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      <option value="nova">+ Pessoa nova</option>
                    </select>
                  </div>
                  <div className="campo"><label htmlFor="in-nome">Nome (se for nova)</label><input id="in-nome" name="nome_novo" maxLength={120} /></div>
                </div>
                <div style={{ marginTop: 12 }}><BotaoEnviar className="botao pequeno">Incluir</BotaoEnviar></div>
              </FormAcao>
            </div>
          </JanelaLateral>
        </Suspense>
      )}

      {/* ===== Janela: regra de uma pessoa ===== */}
      {regraAberta && (
        <Suspense>
          <JanelaLateral param="regra" valor={regraAberta.pessoa_id} titulo={`Regra de ${pessoaRegra?.nome ?? ""}`} subtitulo="Vale para todos os meses. O que muda só num mês, lance no recibo.">
            <FormAcao acao={salvarRegra}>
              <input type="hidden" name="pessoa_id" value={regraAberta.pessoa_id} />
              <div className="bloco-janela">
                <label className="guardar-padrao"><input type="checkbox" name="ativo" defaultChecked={regraAberta.ativo} /><span><b style={{ display: "block" }}>Está na folha</b>Desmarque quando a pessoa sair.</span></label>
              </div>
              <div className="bloco-janela">
                <h3>Comissão</h3>
                <label className="guardar-padrao"><input type="checkbox" name="vendedora" defaultChecked={regraAberta.comissao_percentual != null} /><span><b style={{ display: "block" }}>Recebe comissão sobre as vendas</b>As vendas vêm da Equipe do fluxo financeiro.</span></label>
                <div className="campos duas" style={{ marginTop: 12 }}>
                  <div className="campo"><label htmlFor="rg-pct">Percentual (%)</label><input id="rg-pct" name="comissao_percentual" inputMode="decimal" defaultValue={regraAberta.comissao_percentual != null ? campo(Math.round(Number(regraAberta.comissao_percentual) * 10000) / 100) : ""} placeholder="3,5" /></div>
                  <div className="campo"><label htmlFor="rg-fluxo">Nome na Equipe do fluxo</label><input id="rg-fluxo" name="nome_no_fluxo" defaultValue={regraAberta.nome_no_fluxo ?? ""} placeholder="Ex.: Rose" /><span className="ajuda">Igual ao que você digita no fluxo.</span></div>
                </div>
              </div>
              <div className="bloco-janela">
                <h3>Vale-transporte</h3>
                <label className="guardar-padrao"><input type="checkbox" name="recebe_vt" defaultChecked={regraAberta.recebe_vt} /><span><b style={{ display: "block" }}>Recebe vale-transporte</b>Dias do período × valor por dia.</span></label>
                <label className="guardar-padrao"><input type="checkbox" name="vt_conta_sabado" defaultChecked={regraAberta.vt_conta_sabado} /><span><b style={{ display: "block" }}>Conta os sábados</b>Desmarcado: só segunda a sexta.</span></label>
                <label className="guardar-padrao"><input type="checkbox" name="vt_desconta" defaultChecked={regraAberta.vt_desconta} /><span><b style={{ display: "block" }}>Desconta 6% do salário</b>Nunca passa do valor do vale.</span></label>
                <div className="campos tres" style={{ marginTop: 12 }}>
                  <div className="campo"><label htmlFor="rg-tarifa">VT por dia</label><input id="rg-tarifa" name="vt_tarifa" inputMode="decimal" defaultValue={campo(n(regraAberta.vt_tarifa))} /></div>
                  <div className="campo"><label htmlFor="rg-sal">Salário (base dos 6%)</label><input id="rg-sal" name="salario_base" inputMode="decimal" defaultValue={campo(regraAberta.salario_base)} placeholder="Opcional" /></div>
                  <div className="campo"><label htmlFor="rg-descv">Desconto sem salário</label><input id="rg-descv" name="vt_desconto_valor" inputMode="decimal" defaultValue={campo(regraAberta.vt_desconto_valor)} placeholder="70,00" /><span className="ajuda">Usado enquanto o salário estiver em branco.</span></div>
                </div>
              </div>
              <div className="bloco-janela">
                <h3>Ajuda de custo e bônus</h3>
                <div className="campos duas">
                  <div className="campo"><label htmlFor="rg-ajuda">Ajuda de custo</label><input id="rg-ajuda" name="ajuda_custo" inputMode="decimal" defaultValue={campo(n(regraAberta.ajuda_custo))} /></div>
                  <div className="campo"><label htmlFor="rg-bonus">Bônus fixo</label><input id="rg-bonus" name="bonus_fixo" inputMode="decimal" defaultValue={campo(n(regraAberta.bonus_fixo))} /></div>
                </div>
                <div className="campo" style={{ marginTop: 12 }}><label htmlFor="rg-obs">Anotações</label><textarea id="rg-obs" name="observacao" rows={3} defaultValue={regraAberta.observacao ?? ""} placeholder="Ex.: premiação por meta 1ª R$ 100, 2ª R$ 150…" /></div>
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar regra</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}

      {/* ===== Janela: período do VT ===== */}
      {folha && (
        <Suspense>
          <JanelaLateral param="periodo" titulo="Período do vale-transporte" subtitulo={`Folha de ${nomeMes(mes)}`}>
            <FormAcao acao={salvarPeriodo}>
              <input type="hidden" name="mes" value={mes} />
              <div className="bloco-janela">
                <div className="campos duas">
                  <div className="campo"><label htmlFor="pd-ini">Começa em</label><input id="pd-ini" name="vt_inicio" type="date" defaultValue={folha.vt_inicio} required /></div>
                  <div className="campo"><label htmlFor="pd-fim">Termina em</label><input id="pd-fim" name="vt_fim" type="date" defaultValue={folha.vt_fim} required /></div>
                </div>
                <div className="campo" style={{ marginTop: 12 }}>
                  <label htmlFor="pd-fer">Feriados (a loja fecha)</label>
                  <input id="pd-fer" name="feriados" defaultValue={(folha.feriados ?? []).map((d) => dataBR(d).slice(0, 5)).join(", ")} placeholder="20/11, 25/12" />
                  <span className="ajuda">Já vêm os feriados nacionais. Tire o que a loja abre e ponha os que faltam.</span>
                </div>
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar período</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

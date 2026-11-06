import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { BotoesPdf } from "@/components/fluxo/botoes-pdf";
import { diaDaSemana, diasDeVenda, inicioDoMes, lerLinhas, mesDoLancamento, mesPorExtenso, somar, somarDias, totaisFluxo, type DadosFluxo, type LinhaValor } from "@/lib/fluxo";
import { reais } from "@/lib/formatos";
import { salvarContasDoMes } from "../../acoes";

export const metadata = { title: "Fechamento do mês" };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : "—");
const campo = (v: number) => (v ? v.toFixed(2).replace(".", ",") : "");
const nomeMes = (mes: string) => mesPorExtenso(mes).replace(/^./, (c) => c.toUpperCase());
const fimDoMes = (mes: string) => somarDias(inicioDoMes(somarDias(mes, 32)), -1);

/** "R$ 157.927,15" com o R$ e os centavos menores, como na tela do fluxo. */
function Valor({ v }: { v: number }) {
  const [inteiro, centavos] = reais(v).replace("R$", "").trim().split(",");
  return <><small>R$</small>{inteiro}{centavos !== undefined && <small style={{ verticalAlign: "baseline", marginLeft: 1 }}>,{centavos}</small>}</>;
}

function Lista({ linhas, total, vazio }: { linhas: LinhaValor[]; total: string; vazio: string }) {
  const soma = somar(linhas);
  return (
    <>
      <ul className="fx-lista">
        {linhas.length ? linhas.map((l) => <li key={l.nome}><span>{l.nome}</span><span className="fx-valor">{reais(l.valor)}</span></li>) : <li>{vazio}</li>}
      </ul>
      <div className="fx-rodape"><span>{total}</span><span>{reais(soma)}</span></div>
    </>
  );
}

export default async function Fechamento({ searchParams }: { searchParams: Promise<{ mes?: string; contas?: string }> }) {
  const sessao = await exigir("financeiro");
  const { mes: pedido } = await searchParams;
  const hoje = hojeSP();
  // Até o dia 15, abre o mês anterior (o que está sendo fechado); depois, o mês corrente.
  const padrao = Number(hoje.slice(8, 10)) <= 15 ? inicioDoMes(somarDias(inicioDoMes(hoje), -1)) : inicioDoMes(hoje);
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) && `${pedido}-01` <= inicioDoMes(hoje) ? `${pedido}-01` : padrao;
  const fim = fimDoMes(mes);
  const anterior = inicioDoMes(somarDias(mes, -1)).slice(0, 7);
  const seguinte = inicioDoMes(somarDias(fim, 1));

  const supabase = await supabaseServidor();
  const [{ data: mesR }, { data: diasR }] = await Promise.all([
    supabase.from("fluxo_meses").select("vendas, vendedoras, contas_a_pagar, contas_pagas").eq("mes", mes).maybeSingle(),
    supabase.from("fluxo_dias").select("data, saldos, a_receber").gte("data", mes).lte("data", somarDias(fim, 4)).order("data", { ascending: false }),
  ]);
  // Último lançamento que ainda traz vendas deste mês (em 2/11, o de sexta e sábado de outubro).
  const ultimo = (diasR ?? []).find((d) => mesDoLancamento(d.data) === mes) as { data: string; saldos: unknown; a_receber: unknown } | undefined;
  const m = mesR as { vendas: unknown; vendedoras: unknown; contas_a_pagar: number; contas_pagas: number } | null;

  const dados: DadosFluxo | null = m || ultimo ? {
    data: ultimo?.data ?? fim, diasVenda: [], vendasDia: [], observacao: "",
    saldos: lerLinhas(ultimo?.saldos), aReceber: lerLinhas(ultimo?.a_receber),
    vendasMes: lerLinhas(m?.vendas), vendedoras: lerLinhas(m?.vendedoras),
    contasAPagar: Number(m?.contas_a_pagar ?? 0), contasPagas: Number(m?.contas_pagas ?? 0),
  } : null;
  const t = dados ? totaisFluxo(dados) : null;
  const formas = dados ? [...dados.vendasMes].sort((a, b) => b.valor - a.valor) : [];
  const equipe = dados ? [...dados.vendedoras].sort((a, b) => b.valor - a.valor) : [];
  const totalEquipe = somar(equipe);
  const difEquipe = t ? Math.round((t.vendasMes - totalEquipe) * 100) / 100 : 0;

  // O mês está completo quando o último lançamento traz o último dia de venda do mês (domingo não tem venda).
  let ultimoDiaVenda = fim;
  while (diaDaSemana(ultimoDiaVenda) === 0) ultimoDiaVenda = somarDias(ultimoDiaVenda, -1);
  const vendasAte = ultimo ? diasDeVenda(ultimo.data).at(-1) ?? ultimo.data : null;
  const completo = !!vendasAte && vendasAte >= ultimoDiaVenda;
  const podeEditar = sessao.pode("financeiro", "editar") || sessao.pode("financeiro", "criar");
  const base = `/financeiro/fluxo/fechamento?mes=${mes.slice(0, 7)}`;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Fluxo financeiro", href: "/financeiro/fluxo" }]}
        titulo={`Fechamento de ${mesPorExtenso(mes).split(" ")[0]}`}
        descricao="O mês fechado: o que vendeu, as contas, o saldo dos bancos e o que ficou a receber. Daqui sai o PDF do fechamento."
        acoes={<>
          <BotoesPdf dados={dados} fechamento={mes} enviar={sessao.pode("financeiro", "criar")} />
          {podeEditar && <Link className="botao" href={`${base}&contas=1`} scroll={false}><Icone nome="lapis" />Ajustar contas do mês</Link>}
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="fx-navegador" style={{ marginBottom: 18 }}>
        <Link className="fx-seta" href={`/financeiro/fluxo/fechamento?mes=${anterior}`} aria-label="Mês anterior"><Icone nome="esquerda" /></Link>
        <span className="dia">{nomeMes(mes)}</span>
        {seguinte <= inicioDoMes(hoje)
          ? <Link className="fx-seta" href={`/financeiro/fluxo/fechamento?mes=${seguinte.slice(0, 7)}`} aria-label="Mês seguinte"><Icone nome="direita" /></Link>
          : <span className="fx-seta" aria-disabled="true"><Icone nome="direita" /></span>}
        {ultimo && (completo
          ? <span className="selo ok"><i />Vendas até {vendasAte!.split("-").reverse().join("/")}: mês completo</span>
          : <span className="selo pendente"><i />Vendas lançadas até {vendasAte!.split("-").reverse().join("/")}</span>)}
      </div>

      {!dados || !t ? (
        <section className="painel"><Vazio titulo="Nada lançado neste mês" texto="Os lançamentos do fluxo financeiro deste mês aparecem aqui." /></section>
      ) : (
        <>
          {!completo && ultimo && (
            <p className="aviso alerta"><Icone nome="alerta" />O último lançamento traz vendas só até {vendasAte!.split("-").reverse().join("/")}. Para fechar o mês inteiro, lance até as vendas de {ultimoDiaVenda.split("-").reverse().join("/")}.</p>
          )}
          {equipe.length > 0 && Math.abs(difEquipe) >= 0.01 && (
            <p className="aviso alerta"><Icone nome="alerta" />A soma da equipe ({reais(totalEquipe)}) não bate com as vendas do mês ({reais(t.vendasMes)}): diferença de {reais(Math.abs(difEquipe))}.</p>
          )}

          <div className="kpis fx-kpis fx-fechamento">
            <Kpi destaque titulo="Vendas no mês" valor={<Valor v={t.vendasMes} />} nota={`total de ${mesPorExtenso(mes).split(" ")[0]}`} />
            <Kpi titulo="Contas pagas" valor={<Valor v={t.contasPagas} />} nota={`${pct(t.contasPagas, t.contasPagas + t.contasAPagar)} das contas · ${reais(t.contasAPagar)} a pagar`} />
            <Kpi titulo="Saldo em conta" valor={<Valor v={t.saldo} />} nota={ultimo ? `no lançamento de ${ultimo.data.slice(8, 10)}/${ultimo.data.slice(5, 7)}` : "sem lançamento"} />
            <Kpi titulo="Saldo após as contas" valor={<Valor v={t.sobra} />} nota="saldo em conta - contas a pagar" />
          </div>

          <div className="grade-lateral">
            <div style={{ display: "grid", gap: 16 }}>
              <section className="painel">
                <div className="painel-topo"><div><h2>Vendas por forma de pagamento</h2><p>Total do mês</p></div></div>
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead><tr><th>Forma</th><th className="num">No mês</th><th className="num">% do mês</th></tr></thead>
                    <tbody>{formas.map((f) => <tr key={f.nome}><td>{f.nome}</td><td className="num"><strong>{reais(f.valor)}</strong></td><td className="num mini">{pct(f.valor, t.vendasMes)}</td></tr>)}</tbody>
                    <tfoot><tr><td>Total</td><td className="num">{reais(t.vendasMes)}</td><td /></tr></tfoot>
                  </table>
                </div>
              </section>
              <section className="painel">
                <div className="painel-topo"><div><h2>Equipe em {mesPorExtenso(mes).split(" ")[0]}</h2><p>Vendas de cada vendedora no mês</p></div></div>
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead><tr><th>Vendedora</th><th className="num">Vendeu</th><th className="num">% da equipe</th></tr></thead>
                    <tbody>{equipe.map((v, i) => <tr key={v.nome}><td><strong>{i + 1}.</strong> {v.nome}</td><td className="num"><strong>{reais(v.valor)}</strong></td><td className="num mini">{pct(v.valor, totalEquipe)}</td></tr>)}</tbody>
                    <tfoot><tr><td>Total da equipe</td><td className="num">{reais(totalEquipe)}</td><td /></tr></tfoot>
                  </table>
                </div>
              </section>
            </div>
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <section className="painel">
                <div className="painel-topo"><div><h2>Contas de {mesPorExtenso(mes).split(" ")[0]}</h2><p>{pct(t.contasPagas, t.contasPagas + t.contasAPagar)} pago</p></div></div>
                <div className="fx-duas">
                  <div><span><i style={{ background: "var(--verde-900)" }} />Pagas</span><b>{reais(t.contasPagas)}</b></div>
                  <div><span><i style={{ background: "#f2d98a" }} />A pagar</span><b>{reais(t.contasAPagar)}</b></div>
                </div>
              </section>
              <section className="painel">
                <div className="painel-topo"><div><h2>Saldo nos bancos</h2><p>{ultimo ? `Lançamento de ${ultimo.data.split("-").reverse().join("/")}` : "Sem lançamento"}</p></div></div>
                <Lista linhas={dados.saldos} total="Total" vazio="Nenhuma conta informada." />
              </section>
              <section className="painel">
                <div className="painel-topo"><div><h2>A receber</h2><p>O que ficou para entrar</p></div></div>
                <Lista linhas={dados.aReceber} total="Total a receber" vazio="Nada a receber." />
              </section>
            </div>
          </div>
        </>
      )}

      {podeEditar && (
        <Suspense>
          <JanelaLateral param="contas" titulo={`Contas de ${mesPorExtenso(mes).split(" ")[0]}`} subtitulo="Os valores finais do mês. Não mexe nas contas do mês seguinte.">
            <FormAcao acao={salvarContasDoMes}>
              <input type="hidden" name="mes" value={mes} />
              <div className="bloco-janela">
                <div className="campos duas">
                  <div className="campo"><label htmlFor="contas_pagas">Pagas no mês</label><input id="contas_pagas" name="contas_pagas" inputMode="decimal" defaultValue={campo(t?.contasPagas ?? 0)} placeholder="0,00" /></div>
                  <div className="campo"><label htmlFor="contas_a_pagar">Ficaram a pagar</label><input id="contas_a_pagar" name="contas_a_pagar" inputMode="decimal" defaultValue={campo(t?.contasAPagar ?? 0)} placeholder="0,00" /></div>
                </div>
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar contas</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

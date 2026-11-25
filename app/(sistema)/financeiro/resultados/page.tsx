import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { reais } from "@/lib/formatos";
import { agruparFormas, somarPares, type ParHera } from "@/lib/hera";
import {
  GRUPOS, dre, grupo, mesCurto, mesLongo, montarMeses, percentualFixas, somarMeses,
  type GrupoDre, type Mes, type Pagamento,
} from "@/lib/resultados";
import { usarFixasNaPrecificacao } from "../acoes";

export const metadata = { title: "Resultados" };

const pct = (parte: number, total: number) => (total ? (parte / total) * 100 : 0);
const fmtPct = (v: number | null, casas = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const mil = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function Variacao({ atual, anterior, inverter = false }: { atual: number; anterior: number | null; inverter?: boolean }) {
  if (anterior == null || !anterior) return null;
  const d = ((atual - anterior) / Math.abs(anterior)) * 100;
  const bom = inverter ? d <= 0 : d >= 0;
  return <span className={bom ? "sobe" : "desce"}>{d >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(d), 0)}</span>;
}

export default async function Resultados({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string; ano?: string }> }) {
  const sessao = await exigir("financeiro");
  const sp = await searchParams;
  const aba = sp.aba === "ano" || sp.aba === "dre" ? sp.aba : "mes";
  const hoje = hojeSP();
  const ano = /^\d{4}$/.test(sp.ano ?? "") ? sp.ano! : (/^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes!.slice(0, 4) : hoje.slice(0, 4));
  const supabase = await supabaseServidor();

  // Contas pagas do ano (o Supabase entrega no máximo 1000 por vez).
  const pagamentos: Pagamento[] = [];
  for (let de = 0; de < 30000; de += 1000) {
    const { data } = await supabase.from("contas_pagar").select("pago_em, valor_pago, categoria, fornecedor, descricao")
      .gte("pago_em", `${ano}-01-01`).lte("pago_em", `${ano}-12-31`).gt("valor_pago", 0).order("pago_em").range(de, de + 999);
    pagamentos.push(...((data ?? []) as Pagamento[]));
    if (!data || data.length < 1000) break;
  }
  const [{ data: heraR }, { data: cfgR }, { data: abertoR }] = await Promise.all([
    supabase.from("hera_meses").select("mes, caixa").gte("mes", `${ano}-01-01`).lte("mes", `${ano}-12-01`),
    supabase.from("config_precificacao").select("despesas_fixas, simples, cartao, comissao, lucro_desejado").eq("id", 1).maybeSingle(),
    supabase.from("contas_pagar").select("vencimento, em_aberto, categoria, fornecedor").gte("vencimento", `${ano}-01-01`).lte("vencimento", `${ano}-12-31`).gt("em_aberto", 0),
  ]);
  const caixaPorMes = new Map<string, ParHera[][]>();
  for (const h of (heraR ?? []) as { mes: string; caixa: ParHera[] }[]) {
    const k = h.mes.slice(0, 7);
    caixaPorMes.set(k, [...(caixaPorMes.get(k) ?? []), h.caixa ?? []]);
  }
  const vendas = new Map([...caixaPorMes.entries()].map(([k, l]) => [k, somarPares(l).reduce((t, p) => t + p.y, 0)]));

  // Meses com contas pagas importadas são os que têm resultado completo.
  const mesesComContas = [...new Set(pagamentos.map((p) => p.pago_em.slice(0, 7)))].sort();
  const todosMeses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`).filter((m) => m <= hoje.slice(0, 7));
  const { meses, semClasse } = montarMeses(pagamentos, vendas, todosMeses);
  const completos = meses.filter((m) => mesesComContas.includes(m.mes));
  const mesAtual = hoje.slice(0, 7);
  const mesSel = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && completos.some((m) => m.mes === sp.mes) ? sp.mes! : (completos.at(-1)?.mes ?? mesAtual);
  const m = meses.find((x) => x.mes === mesSel) ?? null;
  const iSel = completos.findIndex((x) => x.mes === mesSel);
  const anterior = iSel > 0 ? completos[iSel - 1] : null;
  const emAndamento = mesSel === mesAtual;
  const fixasAtual = Number(cfgR?.despesas_fixas ?? 48);

  const link = (q: Record<string, string>) => `/financeiro/resultados?${new URLSearchParams({ aba, ...(aba === "mes" ? { mes: mesSel } : { ano }), ...q }).toString()}`;

  return (
    <>
      <Cabecalho titulo="Resultados" descricao="Quanto entrou, quanto saiu e o que sobrou. Vendas do caixa do HeraDash e contas pagas importadas do Conta Azul." />

      <div className="rs-topo">
        <nav className="abas" aria-label="Visão">
          <Link href={`/financeiro/resultados?aba=mes&mes=${mesSel}`} aria-current={aba === "mes" ? "page" : undefined}>Fechamento do mês</Link>
          <Link href={`/financeiro/resultados?aba=ano&ano=${ano}`} aria-current={aba === "ano" ? "page" : undefined}>Visão do ano</Link>
          <Link href={`/financeiro/resultados?aba=dre&ano=${ano}`} aria-current={aba === "dre" ? "page" : undefined}>DRE gerencial</Link>
        </nav>
        {aba === "mes" && completos.length > 0 && (
          <nav className="abas rs-meses" aria-label="Mês">
            {completos.map((x) => <Link key={x.mes} href={link({ mes: x.mes })} aria-current={x.mes === mesSel ? "page" : undefined}>{mesCurto(x.mes)}</Link>)}
          </nav>
        )}
      </div>

      {semClasse.size > 0 && (
        <p className="aviso alerta"><Icone nome="alerta" />Categorias novas entraram em “Administrativo”: {[...semClasse].slice(0, 6).join(", ")}{semClasse.size > 6 ? "…" : ""}. Me avise se alguma for de outro grupo.</p>
      )}

      {!completos.length ? (
        <section className="painel fx-vazio">
          <span className="marcador areia"><Icone nome="banco" tamanho={24} /></span>
          <h2>Ainda não tem contas pagas de {ano}</h2>
          <p>Importe a planilha de contas pagas do Conta Azul em Contas a pagar. O fechamento sai sozinho.</p>
          <Link className="botao" href="/financeiro/contas?importar=1">Importar contas</Link>
        </section>
      ) : aba === "mes" && m ? (
        <FechamentoMes m={m} anterior={anterior} emAndamento={emAndamento} caixa={somarPares(caixaPorMes.get(mesSel) ?? [])}
          aberto={((abertoR ?? []) as { vencimento: string; em_aberto: number; categoria: string | null; fornecedor: string | null }[]).filter((a) => a.vencimento.slice(0, 7) === mesSel)} />
      ) : aba === "ano" ? (
        <VisaoAno ano={ano} meses={meses} completos={completos} mesAtual={mesAtual} />
      ) : (
        <DreGerencial ano={ano} completos={completos} mesAtual={mesAtual} fixasAtual={fixasAtual} podeAplicar={sessao.pode("produto", "editar")}
          taxas={{ simples: Number(cfgR?.simples ?? 0), cartao: Number(cfgR?.cartao ?? 0), comissao: Number(cfgR?.comissao ?? 0), lucro: Number(cfgR?.lucro_desejado ?? 0) }} />
      )}
    </>
  );
}

/* ============================ Fechamento do mês ============================ */
function FechamentoMes({ m, anterior, emAndamento, caixa, aberto }: {
  m: Mes; anterior: Mes | null; emAndamento: boolean; caixa: ParHera[];
  aberto: { vencimento: string; em_aberto: number; categoria: string | null; fornecedor: string | null }[];
}) {
  const d = dre(m);
  const dAnt = anterior ? dre(anterior) : null;
  const resultado = m.vendas - m.saiu;
  const grupos = GRUPOS.map((g) => ({ ...g, valor: m.porGrupo[g.id] })).filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
  const maiorGrupo = grupos[0]?.valor || 1;
  const categorias = [...m.porCategoria.entries()].map(([nome, c]) => ({ nome, ...c })).sort((a, b) => b.valor - a.valor);
  const maiorCat = categorias[0]?.valor || 1;
  const fornecedores = [...m.porFornecedor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const formas = agruparFormas(caixa);
  const totalAberto = aberto.reduce((t, a) => t + Number(a.em_aberto), 0);
  const margemContrib = d.receita ? d.contribuicao / d.receita : 0;
  const equilibrio = margemContrib > 0 ? d.fixas / margemContrib : null;
  const indicadores: { nome: string; valor: number; explica: string }[] = [
    { nome: "Produto", valor: pct(m.porGrupo.produto, m.vendas), explica: "tecido, aviamento e mão de obra" },
    { nome: "Pessoal + pró-labore", valor: pct(m.porGrupo.pessoal + m.porGrupo.prolabore, m.vendas), explica: "equipe e sócias" },
    { nome: "Ocupação", valor: pct(m.porGrupo.ocupacao, m.vendas), explica: "aluguel, luz, água, IPTU" },
    { nome: "Marketing", valor: pct(m.porGrupo.marketing, m.vendas), explica: "publicidade e tráfego" },
  ];
  return (
    <>
      {emAndamento && <p className="aviso"><Icone nome="relogio" />Mês em andamento: as vendas entram de hora em hora e as contas pagas, a cada nova importação do Conta Azul.</p>}
      <section className="kpis rs-kpis" aria-label={`Resumo de ${mesLongo(m.mes)}`}>
        <div className="kpi destaque">
          <div className="kpi-topo"><span>Entrou</span><span className="seta"><Icone nome="entrada" tamanho={16} /></span></div>
          <p className="kpi-valor">{reais(m.vendas)}</p>
          <p className="kpi-nota"><Variacao atual={m.vendas} anterior={anterior?.vendas ?? null} /> vendas no caixa</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Saiu</span><span className="seta"><Icone nome="cifrao" tamanho={16} /></span></div>
          <p className="kpi-valor">{reais(m.saiu)}</p>
          <p className="kpi-nota"><Variacao atual={m.saiu} anterior={anterior?.saiu ?? null} inverter /> {m.pagamentos} contas pagas</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Sobrou no caixa</span><span className="seta"><Icone nome="banco" tamanho={16} /></span></div>
          <p className={`kpi-valor ${resultado < 0 ? "negativo" : ""}`}>{reais(resultado)}</p>
          <p className="kpi-nota">entrou − saiu</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Resultado operacional</span><span className="seta"><Icone nome="diagonal" tamanho={16} /></span></div>
          <p className={`kpi-valor ${d.operacional < 0 ? "negativo" : ""}`}>{fmtPct(pct(d.operacional, d.receita))}</p>
          <p className="kpi-nota">{reais(d.operacional)}{dAnt ? <> · antes {fmtPct(pct(dAnt.operacional, dAnt.receita))}</> : null}</p>
        </div>
      </section>

      <div className="fx-grade">
        <section className="painel c7">
          <div className="painel-topo"><div><h2>Para onde foi o dinheiro</h2><p>Saídas de {mesLongo(m.mes)} por grupo</p></div><div className="fx-total"><strong>{reais(m.saiu)}</strong><span>pago no mês</span></div></div>
          <ul className="rs-barras">
            {grupos.map((g) => (
              <li key={g.id} title={g.explica}>
                <span className="rs-nome"><i style={{ background: g.cor }} />{g.nome}</span>
                <span className="rs-trilho"><i style={{ width: `${Math.max(2, (g.valor / maiorGrupo) * 100)}%`, background: g.cor }} /></span>
                <span className="rs-valor">{reais(g.valor)}<small>{fmtPct(pct(g.valor, m.vendas), 0)} das vendas</small></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="painel c5">
          <div className="painel-topo"><div><h2>Resumo do resultado</h2><p>Do que vendeu até o que sobrou</p></div></div>
          <ul className="rs-cascata">
            <li><span>Vendas</span><b>{reais(d.receita)}</b></li>
            <li className="menos"><span>Impostos</span><b>− {reais(m.porGrupo.impostos)}</b></li>
            <li className="menos"><span>Custo do produto</span><b>− {reais(m.porGrupo.produto)}</b></li>
            <li className="menos"><span>Despesas variáveis</span><b>− {reais(m.porGrupo.variaveis)}</b></li>
            <li className="sub"><span>Margem de contribuição <small>{fmtPct(margemContrib * 100, 0)}</small></span><b>{reais(d.contribuicao)}</b></li>
            <li className="menos"><span>Despesas fixas</span><b>− {reais(d.fixas)}</b></li>
            <li className={`sub ${d.operacional < 0 ? "neg" : "pos"}`}><span>Resultado operacional</span><b>{reais(d.operacional)}</b></li>
            <li className="menos"><span>Investimentos, dívidas e outros</span><b>− {reais(d.naoOperacional)}</b></li>
            <li className={`total ${d.caixa < 0 ? "neg" : "pos"}`}><span>Resultado de caixa</span><b>{reais(d.caixa)}</b></li>
          </ul>
          {equilibrio != null && (
            <p className="rs-equilibrio"><b>Ponto de equilíbrio: {reais(equilibrio)}</b> em vendas no mês para cobrir as despesas fixas com a margem atual{m.vendas ? ` (${m.vendas >= equilibrio ? "atingido" : `faltaram ${reais(equilibrio - m.vendas)}`})` : ""}.</p>
          )}
        </section>

        <section className="painel c12">
          <div className="painel-topo"><div><h2>Quanto cada gasto pesa nas vendas</h2><p>Percentual sobre o que entrou no mês</p></div></div>
          <div className="rs-indicadores">
            {indicadores.map((i) => (
              <div key={i.nome}><span>{i.nome}</span><strong>{fmtPct(i.valor, 0)}</strong><small>{i.explica}</small></div>
            ))}
            <div><span>Despesas fixas</span><strong>{fmtPct(pct(d.fixas, m.vendas), 0)}</strong><small>é o que vai na precificação</small></div>
          </div>
        </section>

        <section className="painel c7">
          <div className="painel-topo"><div><h2>Maiores gastos por categoria</h2><p>As 12 categorias que mais pesaram</p></div></div>
          <ul className="rs-barras rs-cat">
            {categorias.slice(0, 12).map((c, i) => (
              <li key={c.nome}>
                <span className="rs-nome"><em>{i + 1}</em>{c.nome}</span>
                <span className="rs-trilho"><i style={{ width: `${Math.max(2, (c.valor / maiorCat) * 100)}%`, background: grupo(c.grupo).cor }} /></span>
                <span className="rs-valor">{reais(c.valor)}<small>{fmtPct(pct(c.valor, m.saiu), 0)} das saídas</small></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="painel c5">
          <div className="painel-topo"><div><h2>Para quem mais pagamos</h2><p>Fornecedores e pessoas do mês</p></div></div>
          <ul className="fx-lista">
            {fornecedores.map(([nome, v]) => <li key={nome}><span>{nome.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())}</span><span className="fx-valor">{reais(v)}</span></li>)}
          </ul>
        </section>

        <section className="painel c5">
          <div className="painel-topo"><div><h2>Como entrou</h2><p>Vendas por forma de pagamento</p></div></div>
          {formas.length ? (
            <ul className="fx-lista">
              {formas.map((f) => <li key={f.nome}><span>{f.nome}<small className="mini">{fmtPct(pct(f.valor, m.vendas), 0)}</small></span><span className="fx-valor">{reais(f.valor)}</span></li>)}
            </ul>
          ) : <p className="fx-sem-grafico">Sem vendas do HeraDash neste mês.</p>}
        </section>

        <section className="painel c7">
          <div className="painel-topo"><div><h2>Ainda a pagar com vencimento no mês</h2><p>{aberto.length ? `${aberto.length} contas em aberto` : "Nada em aberto"}</p></div><div className="fx-total"><strong>{reais(totalAberto)}</strong><span>em aberto</span></div></div>
          {aberto.length > 0 && (
            <ul className="fx-lista">
              {[...aberto].sort((a, b) => Number(b.em_aberto) - Number(a.em_aberto)).slice(0, 6).map((a, i) => (
                <li key={i}><span>{(a.fornecedor ?? a.categoria ?? "—").toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())}<small className="mini">vence {a.vencimento.slice(8, 10)}/{a.vencimento.slice(5, 7)} · {a.categoria}</small></span><span className="fx-valor">{reais(Number(a.em_aberto))}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/* ============================ Visão do ano ============================ */
function VisaoAno({ ano, meses, completos, mesAtual }: { ano: string; meses: Mes[]; completos: Mes[]; mesAtual: string }) {
  const soma = somarMeses(completos);
  const d = dre(soma);
  const vendasAno = meses.reduce((t, m) => t + m.vendas, 0);
  const maior = Math.max(1, ...meses.map((m) => Math.max(m.vendas, m.saiu)));
  const fechados = completos.filter((m) => m.mes < mesAtual);
  const mediaFixas = fechados.length ? fechados.reduce((t, m) => t + dre(m).fixas, 0) / fechados.length : null;
  const categoriasAno = new Map<string, { valor: number; grupo: GrupoDre }>();
  for (const m of completos) for (const [nome, c] of m.porCategoria) {
    const a = categoriasAno.get(nome) ?? { valor: 0, grupo: c.grupo };
    a.valor += c.valor;
    categoriasAno.set(nome, a);
  }
  const topCat = [...categoriasAno.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
  const maiorCat = topCat[0]?.[1].valor || 1;
  const gruposComValor = GRUPOS.filter((g) => completos.some((m) => m.porGrupo[g.id] > 0));
  return (
    <>
      <section className="kpis rs-kpis" aria-label={`Resumo de ${ano}`}>
        <div className="kpi destaque"><div className="kpi-topo"><span>Vendas no ano</span><span className="seta"><Icone nome="entrada" tamanho={16} /></span></div><p className="kpi-valor">{reais(vendasAno)}</p><p className="kpi-nota">{meses.filter((m) => m.vendas > 0).length} meses com venda</p></div>
        <div className="kpi"><div className="kpi-topo"><span>Saídas</span><span className="seta"><Icone nome="cifrao" tamanho={16} /></span></div><p className="kpi-valor">{reais(soma.saiu)}</p><p className="kpi-nota">{completos.length} meses com contas importadas</p></div>
        <div className="kpi"><div className="kpi-topo"><span>Sobrou no caixa</span><span className="seta"><Icone nome="banco" tamanho={16} /></span></div><p className={`kpi-valor ${soma.vendas - soma.saiu < 0 ? "negativo" : ""}`}>{reais(soma.vendas - soma.saiu)}</p><p className="kpi-nota">nos meses com contas</p></div>
        <div className="kpi"><div className="kpi-topo"><span>Despesas fixas por mês</span><span className="seta"><Icone nome="calendario" tamanho={16} /></span></div><p className="kpi-valor">{mediaFixas != null ? reais(mediaFixas) : "—"}</p><p className="kpi-nota">média dos meses fechados</p></div>
      </section>

      <div className="fx-grade">
        <section className="painel c12">
          <div className="painel-topo"><div><h2>Entrou × saiu, mês a mês</h2><p>{ano}. Sem barra de saída: mês ainda sem contas importadas.</p></div>
            <div className="rs-legenda"><span><i className="e" />Entrou</span><span><i className="s" />Saiu</span></div></div>
          <div className="rs-colunas" role="img" aria-label="Gráfico de entradas e saídas por mês">
            {meses.map((m) => {
              const temContas = completos.some((c) => c.mes === m.mes);
              const res = m.vendas - m.saiu;
              return (
                <div key={m.mes} className="rs-col">
                  <span className={`rs-res ${!temContas ? "" : res < 0 ? "neg" : "pos"}`}>{temContas ? (res >= 0 ? "+" : "−") + mil(Math.abs(res)) : ""}</span>
                  <div className="rs-par">
                    <i className="e" style={{ height: `${(m.vendas / maior) * 100}%` }} title={`Entrou ${reais(m.vendas)}`} />
                    <i className="s" style={{ height: `${temContas ? (m.saiu / maior) * 100 : 0}%` }} title={temContas ? `Saiu ${reais(m.saiu)}` : "Sem contas importadas"} />
                  </div>
                  <small>{mesCurto(m.mes).slice(0, 3)}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="painel c12">
          <div className="painel-topo"><div><h2>Saídas por grupo, mês a mês</h2><p>Valores pagos em cada mês</p></div></div>
          <div className="tabela-rolagem">
            <table className="tabela rs-tabela">
              <thead><tr><th>Grupo</th>{completos.map((m) => <th key={m.mes} className="num">{mesCurto(m.mes)}</th>)}<th className="num">Total</th><th className="num">Média</th></tr></thead>
              <tbody>
                <tr className="rs-linha-forte"><td>Vendas (entrou)</td>{completos.map((m) => <td key={m.mes} className="num">{reais(m.vendas)}</td>)}<td className="num">{reais(soma.vendas)}</td><td className="num">{reais(soma.vendas / completos.length)}</td></tr>
                {gruposComValor.map((g) => (
                  <tr key={g.id}><td><span className="rs-nome"><i style={{ background: g.cor }} />{g.nome}</span></td>{completos.map((m) => <td key={m.mes} className="num">{m.porGrupo[g.id] ? reais(m.porGrupo[g.id]) : "—"}</td>)}<td className="num">{reais(soma.porGrupo[g.id])}</td><td className="num">{reais(soma.porGrupo[g.id] / completos.length)}</td></tr>
                ))}
                <tr className="rs-linha-forte"><td>Total de saídas</td>{completos.map((m) => <td key={m.mes} className="num">{reais(m.saiu)}</td>)}<td className="num">{reais(soma.saiu)}</td><td className="num">{reais(soma.saiu / completos.length)}</td></tr>
                <tr className="rs-linha-forte"><td>Sobrou no caixa</td>{completos.map((m) => <td key={m.mes} className={`num ${m.vendas - m.saiu < 0 ? "neg" : "pos"}`}>{reais(m.vendas - m.saiu)}</td>)}<td className={`num ${soma.vendas - soma.saiu < 0 ? "neg" : "pos"}`}>{reais(soma.vendas - soma.saiu)}</td><td className="num">{reais((soma.vendas - soma.saiu) / completos.length)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="painel c7">
          <div className="painel-topo"><div><h2>Maiores gastos do ano</h2><p>Soma dos meses com contas importadas</p></div></div>
          <ul className="rs-barras rs-cat">
            {topCat.map(([nome, c], i) => (
              <li key={nome}>
                <span className="rs-nome"><em>{i + 1}</em>{nome}</span>
                <span className="rs-trilho"><i style={{ width: `${Math.max(2, (c.valor / maiorCat) * 100)}%`, background: grupo(c.grupo).cor }} /></span>
                <span className="rs-valor">{reais(c.valor)}<small>{fmtPct(pct(c.valor, soma.saiu), 0)} das saídas</small></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="painel c5">
          <div className="painel-topo"><div><h2>Indicadores do período</h2><p>Sobre as vendas dos meses com contas</p></div></div>
          <ul className="rs-cascata">
            <li><span>Margem de contribuição</span><b>{fmtPct(pct(d.contribuicao, d.receita))}</b></li>
            <li><span>Despesas fixas</span><b>{fmtPct(pct(d.fixas, d.receita))}</b></li>
            <li><span>Resultado operacional</span><b className={d.operacional < 0 ? "neg" : "pos"}>{fmtPct(pct(d.operacional, d.receita))}</b></li>
            <li><span>Custo do produto</span><b>{fmtPct(pct(soma.porGrupo.produto, d.receita))}</b></li>
            <li><span>Pessoal + pró-labore</span><b>{fmtPct(pct(soma.porGrupo.pessoal + soma.porGrupo.prolabore, d.receita))}</b></li>
            <li><span>Marketing</span><b>{fmtPct(pct(soma.porGrupo.marketing, d.receita))}</b></li>
          </ul>
        </section>
      </div>
    </>
  );
}

/* ============================ DRE gerencial ============================ */
function DreGerencial({ ano, completos, mesAtual, fixasAtual, podeAplicar, taxas }: {
  ano: string; completos: Mes[]; mesAtual: string; fixasAtual: number; podeAplicar: boolean;
  taxas: { simples: number; cartao: number; comissao: number; lucro: number };
}) {
  const soma = somarMeses(completos);
  const total = dre(soma);
  const cols = completos.map((m) => ({ m, d: dre(m) }));
  type Linha = { rotulo: string; valores: number[]; total: number; tipo: "receita" | "menos" | "sub" | "res" | "cat"; grupo?: GrupoDre; nivel?: number };
  const linhas: Linha[] = [];
  const linhaGrupo = (g: GrupoDre) => {
    linhas.push({ rotulo: `(−) ${grupo(g).nome}`, valores: completos.map((m) => m.porGrupo[g]), total: soma.porGrupo[g], tipo: "menos", grupo: g });
    const cats = new Map<string, number[]>();
    completos.forEach((m, i) => { for (const [nome, c] of m.porCategoria) if (c.grupo === g) { const a = cats.get(nome) ?? completos.map(() => 0); a[i] += c.valor; cats.set(nome, a); } });
    [...cats.entries()].sort((a, b) => b[1].reduce((t, v) => t + v, 0) - a[1].reduce((t, v) => t + v, 0))
      .forEach(([nome, v]) => linhas.push({ rotulo: nome, valores: v, total: v.reduce((t, x) => t + x, 0), tipo: "cat", grupo: g }));
  };
  linhas.push({ rotulo: "Receita bruta de vendas", valores: cols.map((c) => c.d.receita), total: total.receita, tipo: "receita" });
  linhaGrupo("impostos");
  linhas.push({ rotulo: "= Receita líquida", valores: cols.map((c) => c.d.liquida), total: total.liquida, tipo: "sub" });
  linhaGrupo("produto");
  linhas.push({ rotulo: "= Lucro bruto", valores: cols.map((c) => c.d.bruto), total: total.bruto, tipo: "sub" });
  linhaGrupo("variaveis");
  linhas.push({ rotulo: "= Margem de contribuição", valores: cols.map((c) => c.d.contribuicao), total: total.contribuicao, tipo: "sub" });
  (["pessoal", "prolabore", "ocupacao", "marketing", "administrativo"] as GrupoDre[]).forEach(linhaGrupo);
  linhas.push({ rotulo: "= Resultado operacional", valores: cols.map((c) => c.d.operacional), total: total.operacional, tipo: "res" });
  (["investimentos", "dividas", "outros"] as GrupoDre[]).forEach(linhaGrupo);
  linhas.push({ rotulo: "= Resultado de caixa do período", valores: cols.map((c) => c.d.caixa), total: total.caixa, tipo: "res" });

  // Base da precificação: meses fechados (sem o mês em andamento).
  const fechados = completos.filter((m) => m.mes < mesAtual);
  const ult3 = fechados.slice(-3);
  const p3 = percentualFixas(ult3);
  const p3sem = percentualFixas(ult3, false);
  const fixasMes = ult3.length ? ult3.reduce((t, m) => t + dre(m).fixas, 0) / ult3.length : 0;
  const vendasMes = ult3.length ? ult3.reduce((t, m) => t + m.vendas, 0) / ult3.length : 0;
  const somaSemFixas = taxas.simples + taxas.cartao + taxas.comissao + taxas.lucro;
  const markup = (fixas: number) => (somaSemFixas + fixas < 100 ? 100 / (100 - somaSemFixas - fixas) : null);
  const vendaPara = (pctAlvo: number) => (pctAlvo > 0 ? (fixasMes / pctAlvo) * 100 : null);

  return (
    <>
      <section className="painel">
        <div className="painel-topo"><div><h2>DRE gerencial · {ano}</h2><p>Regime de caixa: vendas do mês (caixa do HeraDash) e contas pagas no mês (Conta Azul). {completos.some((m) => m.mes === mesAtual) ? `${mesCurto(mesAtual)} ainda está em andamento.` : ""}</p></div></div>
        <div className="tabela-rolagem">
          <table className="tabela rs-dre">
            <thead><tr><th>Conta</th>{completos.map((m) => <th key={m.mes} className="num">{mesCurto(m.mes)}{m.mes === mesAtual ? "*" : ""}</th>)}<th className="num">Total</th><th className="num">% vendas</th></tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className={`rs-${l.tipo}`}>
                  <td>{l.tipo === "cat" ? <span className="rs-cat-nome">{l.rotulo}</span> : l.grupo ? <span className="rs-nome"><i style={{ background: grupo(l.grupo).cor }} />{l.rotulo}</span> : l.rotulo}</td>
                  {l.valores.map((v, k) => <td key={k} className={`num ${(l.tipo === "res" || l.tipo === "sub") && v < 0 ? "neg" : ""}`}>{l.tipo === "cat" && !v ? "—" : reais(v)}</td>)}
                  <td className={`num ${(l.tipo === "res" || l.tipo === "sub") && l.total < 0 ? "neg" : ""}`}>{reais(l.total)}</td>
                  <td className="num">{fmtPct(pct(l.total, total.receita))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="painel rs-precificacao">
        <div className="painel-topo"><div><h2>Despesas fixas na precificação</h2><p>Quanto as despesas fixas representam das vendas. Recalcula sozinho a cada mês fechado.</p></div></div>
        <div className="painel-corpo">
          <div className="rs-indicadores">
            <div><span>Usado hoje</span><strong>{fmtPct(fixasAtual, 0)}</strong><small>na ficha de custo</small></div>
            <div className="destaque"><span>Real · últimos {ult3.length} meses</span><strong>{fmtPct(p3, 0)}</strong><small>{reais(fixasMes)} de fixas ÷ {reais(vendasMes)} de vendas por mês</small></div>
            <div><span>Sem o pró-labore</span><strong>{fmtPct(p3sem, 0)}</strong><small>só equipe, loja, marketing e adm.</small></div>
            <div><span>Vendas para os {fmtPct(fixasAtual, 0)} fecharem</span><strong>{reais(vendaPara(fixasAtual))}</strong><small>por mês, com as fixas de hoje</small></div>
          </div>
          <div className="rs-explica">
            <p><b>Como a conta funciona.</b> O preço sugerido divide o custo da peça por 100% menos a soma dos percentuais: Simples {fmtPct(taxas.simples, 2)} + cartão {fmtPct(taxas.cartao, 2)} + comissão {fmtPct(taxas.comissao, 0)} + despesas fixas {fmtPct(fixasAtual, 0)} + lucro {fmtPct(taxas.lucro, 0)} = {fmtPct(somaSemFixas + fixasAtual, 2)}. Sobra {fmtPct(100 - somaSemFixas - fixasAtual, 2)} para o custo, por isso o preço sai {markup(fixasAtual)?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"} vezes o custo.</p>
            {p3 != null && p3 + somaSemFixas >= 80 ? (
              <p><b>Com o percentual real ({fmtPct(p3, 0)}) a soma chega a {fmtPct(p3 + somaSemFixas, 0)}</b> e a conta deixa de fazer sentido: {p3 + somaSemFixas >= 100 ? "nenhum preço cobre tudo" : `o preço teria de ser ${markup(p3)?.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} vezes o custo`} nesse nível de vendas. Isso mostra que o ajuste não é só no percentual. Ou as vendas sobem (perto de {reais(vendaPara(fixasAtual))} por mês para os {fmtPct(fixasAtual, 0)} valerem), ou as despesas fixas caem, ou o lucro desejado é revisto.</p>
            ) : p3 != null ? (
              <p>Com o percentual real ({fmtPct(p3, 0)}), o preço sairia {markup(p3)?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} vezes o custo.</p>
            ) : null}
          </div>
          {podeAplicar && p3 != null && p3 + somaSemFixas < 80 && Math.abs(p3 - fixasAtual) >= 1 && (
            <form action={usarFixasNaPrecificacao} className="rs-aplicar">
              <input type="hidden" name="percentual" value={p3.toFixed(2)} />
              <button className="botao leve">Usar {fmtPct(p3, 0)} nas próximas fichas</button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

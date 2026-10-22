import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { numero, reais } from "@/lib/formatos";

export const metadata = { title: "Vendas" };

type Mensal = { mes: string; pecas: number; devolucoes: number; faturadas: number; qtd_vendas: number; valor_total: number; preco_medio: number };
type Comissao = { codigo: string; vendedora: string; vendas: number; comissao: number; percentual: number; qtd_vendas: number; qtd_pecas: number; ticket_medio: number; valor_pagar: number };
type Produto = { codigo: string; referencia: string | null; descricao: string; classe: string | null; quantidade: number; custo: number; venda: number; percentual: number };
type Item = { data: string; quantidade: number; valor_produto: number; variacao_valor: number; valor_total: number };
type Compra = { data: string; vendedora_nome: string | null; valor: number; valor_produtos: number; valor_variacao: number };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const mesExtenso = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const curto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 100000 ? 0 : 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const n = (v: unknown) => Number(v ?? 0);

export default async function Vendas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sessao = await exigir("comercial");
  if (!sessao.pode("comercial", "aprovar") && !sessao.pode("financeiro", "ver")) await exigir("comercial", "aprovar");
  const { mes: pedido } = await searchParams;
  const supabase = await supabaseServidor();

  const [{ data: mR }, { data: mesesC }, { data: mesesP }, { data: mesesI }, { data: mesesV }] = await Promise.all([
    supabase.from("vendas_mensais").select("mes, pecas, devolucoes, faturadas, qtd_vendas, valor_total, preco_medio").order("mes"),
    supabase.from("comissoes_mensais").select("mes").limit(1000),
    supabase.from("produtos_vendidos_mes").select("mes").limit(5000),
    supabase.from("relatorios_importados").select("mes").eq("tipo", "vendas_dia").not("mes", "is", null),
    supabase.from("importacoes_clientes").select("mes").eq("tipo", "vendas_vendedora").not("mes", "is", null),
  ]);
  const mensais = ((mR ?? []) as Mensal[]).map((m) => ({ ...m, mes: m.mes.slice(0, 7), valor_total: n(m.valor_total), preco_medio: n(m.preco_medio) }));
  const disponiveis = [...new Set([...mensais.map((m) => m.mes), ...[...(mesesC ?? []), ...(mesesP ?? []), ...(mesesI ?? []), ...(mesesV ?? [])].map((x) => String(x.mes).slice(0, 7))])].sort();
  const mes = pedido && disponiveis.includes(pedido) ? pedido : disponiveis[disponiveis.length - 1];
  const podeImportar = sessao.pode("comercial", "aprovar") || sessao.pode("financeiro", "editar");

  if (!mes) {
    return (
      <>
        <Cabecalho titulo="Vendas" descricao="Vendas, comissões e produtos mais vendidos, a partir dos relatórios do sistema de vendas da loja." />
        <section className="painel">
          <Vazio titulo="Nenhum relatório de vendas ainda" texto="Importe os PDFs do sistema de vendas (resumo do ano, comissão, curva ABC e vendas por dia) para ver os números aqui.">
            {podeImportar && <Link className="botao" href="/comercial/relatorios"><Icone nome="arquivo" />Importar relatórios</Link>}
          </Vazio>
        </section>
      </>
    );
  }

  const inicio = `${mes}-01`;
  const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [{ data: cR }, { data: pR }, { data: iR }, { data: vR }] = await Promise.all([
    supabase.from("comissoes_mensais").select("codigo, vendedora, vendas, comissao, percentual, qtd_vendas, qtd_pecas, ticket_medio, valor_pagar").eq("mes", inicio).order("vendas", { ascending: false }),
    supabase.from("produtos_vendidos_mes").select("codigo, referencia, descricao, classe, quantidade, custo, venda, percentual").eq("mes", inicio).order("quantidade", { ascending: false }).limit(20),
    supabase.from("vendas_itens").select("data, quantidade, valor_produto, variacao_valor, valor_total").eq("mes", inicio).limit(10000),
    supabase.from("cliente_compras").select("data, vendedora_nome, valor, valor_produtos, valor_variacao").gte("data", inicio).lte("data", fim).limit(10000),
  ]);
  const compras = (vR ?? []) as Compra[];
  // Sem o relatório de comissão, o ranking sai das vendas por vendedora.
  const porVendedora = new Map<string, { vendas: number; qtd: number }>();
  for (const c of compras) {
    const nome = c.vendedora_nome || "Sem vendedora";
    const a = porVendedora.get(nome) ?? { vendas: 0, qtd: 0 };
    porVendedora.set(nome, { vendas: a.vendas + n(c.valor), qtd: a.qtd + 1 });
  }
  const comissoesRel = (cR ?? []) as Comissao[];
  const comissoes: Comissao[] = comissoesRel.length ? comissoesRel : [...porVendedora.entries()].sort((a, b) => b[1].vendas - a[1].vendas).map(([nome, v]) => ({
    codigo: nome, vendedora: nome, vendas: v.vendas, comissao: 0, percentual: 0, qtd_vendas: v.qtd, qtd_pecas: 0, ticket_medio: v.qtd ? v.vendas / v.qtd : 0, valor_pagar: 0,
  }));
  const semComissao = !comissoesRel.length && comissoes.length > 0;
  const produtos = (pR ?? []) as Produto[];
  const itens = (iR ?? []) as Item[];
  const doMes = mensais.find((m) => m.mes === mes);
  const anterior = mensais.find((m) => m.mes === disponiveis[disponiveis.indexOf(mes) - 1]);

  // Números do mês: o resumo mensal manda; sem ele, usa a comissão ou as vendas peça a peça.
  const totalComissoes = comissoes.reduce((t, c) => t + n(c.vendas), 0);
  const totalItens = itens.reduce((t, i) => t + n(i.valor_total), 0);
  const totalCompras = compras.reduce((t, c) => t + n(c.valor), 0);
  const valorMes = doMes?.valor_total ?? (totalComissoes || totalCompras || totalItens);
  const qtdVendas = doMes?.qtd_vendas ?? (comissoes.reduce((t, c) => t + n(c.qtd_vendas), 0) || compras.length);
  const pecas = doMes?.faturadas ?? (comissoes.reduce((t, c) => t + n(c.qtd_pecas), 0) || itens.reduce((t, i) => t + n(i.quantidade), 0));
  const ticket = qtdVendas ? valorMes / qtdVendas : 0;
  const variacao = anterior && anterior.valor_total ? ((valorMes - anterior.valor_total) / anterior.valor_total) * 100 : null;

  // Gráfico do ano: últimos 12 meses do resumo
  const ano = mensais.slice(-12);
  const maiorMes = Math.max(0, ...ano.map((m) => m.valor_total));

  // Dia a dia e descontos (vendas peça a peça)
  const porDia = new Map<string, number>();
  if (itens.length) for (const i of itens) porDia.set(i.data, (porDia.get(i.data) ?? 0) + n(i.valor_total));
  else for (const c of compras) porDia.set(c.data, (porDia.get(c.data) ?? 0) + n(c.valor));
  const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maiorDia = Math.max(0, ...dias.map((d) => d[1]));
  const bruto = itens.length ? itens.reduce((t, i) => t + n(i.valor_produto) * n(i.quantidade), 0) : compras.reduce((t, c) => t + n(c.valor_produtos), 0);
  const descontos = itens.length ? itens.reduce((t, i) => t + Math.min(0, n(i.variacao_valor)), 0) : compras.reduce((t, c) => t + Math.min(0, n(c.valor_variacao)), 0);
  const comDesconto = itens.length ? itens.filter((i) => n(i.variacao_valor) < 0).length : compras.filter((c) => n(c.valor_variacao) < 0).length;
  const unidade = itens.length ? ["peça", "peças"] : ["venda", "vendas"];
  const maiorVendedora = Math.max(1, ...comissoes.map((c) => n(c.vendas)));
  const totalComissao = comissoes.reduce((t, c) => t + n(c.valor_pagar), 0);

  return (
    <>
      <Cabecalho
        titulo="Vendas"
        descricao={`Números de ${mesExtenso(mes)}, dos relatórios do sistema de vendas da loja.`}
        acoes={podeImportar && <Link className="botao leve" href="/comercial/relatorios"><Icone nome="arquivo" />Importar relatórios</Link>}
      />
      <nav className="abas" aria-label="Mês" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {disponiveis.slice(-12).map((m) => <Link key={m} href={`/comercial/vendas?mes=${m}`} className={m === mes ? "ativa" : undefined}>{nomeMes(m)}</Link>)}
      </nav>

      <section className="kpis fx-kpis">
        <div className="kpi destaque">
          <div className="kpi-topo"><span>Vendido no mês</span><span className="seta"><Icone nome="cifrao" tamanho={16} /></span></div>
          <p className="kpi-valor">{reais(valorMes)}</p>
          <p className="kpi-nota">{variacao != null ? <b>{variacao >= 0 ? "▲" : "▼"} {Math.abs(Math.round(variacao))}%</b> : null}{variacao != null ? `vs ${nomeMes(anterior!.mes)}` : "valor total das vendas"}</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Peças vendidas</span><span className="seta"><Icone nome="catalogo" tamanho={16} /></span></div>
          <p className="kpi-valor">{numero(pecas)}</p>
          <p className="kpi-nota">{doMes?.devolucoes ? `${numero(doMes.devolucoes)} devolvidas` : "no mês"}</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Vendas</span><span className="seta"><Icone nome="caixa" tamanho={16} /></span></div>
          <p className="kpi-valor">{numero(qtdVendas)}</p>
          <p className="kpi-nota">{qtdVendas ? `${(pecas / qtdVendas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} peças por venda` : "atendimentos com venda"}</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Ticket médio</span><span className="seta"><Icone nome="clientes" tamanho={16} /></span></div>
          <p className="kpi-valor">{reais(ticket)}</p>
          <p className="kpi-nota">{doMes ? `preço médio da peça ${reais(doMes.preco_medio)}` : "por venda"}</p>
        </div>
      </section>

      <div className="fx-grade">
        <section className="painel c7">
          <div className="painel-topo"><div><h2>Vendas mês a mês</h2><p>{ano.length ? `${nomeMes(ano[0].mes)} a ${nomeMes(ano[ano.length - 1].mes)}` : "Importe o resumo de vendas por mês"}</p></div></div>
          {ano.length ? (
            <>
              <div className="fx-barras">
                {ano.map((m) => (
                  <Link key={m.mes} href={`/comercial/vendas?mes=${m.mes}`} className={`fx-barra ${m.valor_total === maiorMes ? "maior" : m.mes === mes ? "atual" : ""}`} title={`${nomeMes(m.mes)}: ${reais(m.valor_total)}`}>
                    <i style={{ height: `${Math.max(4, (m.valor_total / maiorMes) * 100)}%` }} />
                    {(m.mes === mes || m.valor_total === maiorMes) && <span className="balao" style={{ bottom: `${Math.max(4, (m.valor_total / maiorMes) * 100)}%` }}>{curto(m.valor_total)}</span>}
                  </Link>
                ))}
              </div>
              <div className="fx-eixo">{ano.map((m) => <span key={m.mes}>{nomeMes(m.mes)}</span>)}</div>
            </>
          ) : <p className="fx-sem-grafico">Sem o relatório “Evolução de vendas” ainda.</p>}
        </section>

        <section className="painel c5">
          <div className="painel-topo"><div><h2>Vendedoras</h2><p>{semComissao ? "Vendas no mês (sem o relatório de comissão)" : "Vendas e comissão no mês"}</p></div>{totalComissao > 0 && <div className="fx-total"><strong>{reais(totalComissao)}</strong><span>de comissão a pagar</span></div>}</div>
          {comissoes.length ? (
            <ul className="fx-lista">
              {comissoes.map((c, i) => (
                <li key={c.codigo}>
                  <div className="fx-equipe" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) auto" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}º</span>
                      <span style={{ minWidth: 0 }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.vendedora}</b><span className="mini">{numero(c.qtd_vendas)} vendas · ticket {reais(n(c.ticket_medio))}</span></span>
                    </span>
                    <span className={`fx-trilho ${i === 0 ? "primeira" : ""}`}><i style={{ width: `${Math.max(2, (n(c.vendas) / maiorVendedora) * 100)}%` }} /></span>
                    <span className="fx-valor">{reais(n(c.vendas))}{!semComissao && <small style={{ color: "var(--suave)" }}>comissão {reais(n(c.valor_pagar))}</small>}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="fx-sem-grafico">Sem o relatório de comissão deste mês.</p>}
        </section>

        <section className="painel c12">
          <div className="painel-topo">
            <div><h2>Vendas dia a dia</h2><p>{dias.length ? `${dias.length} dias com venda em ${mesExtenso(mes)}` : "Importe o relatório de vendas por data"}</p></div>
            {(itens.length > 0 || compras.length > 0) && <div className="fx-total"><strong>{reais(descontos)}</strong><span>de descontos em {numero(comDesconto)} {comDesconto === 1 ? unidade[0] : unidade[1]}{bruto ? ` (${Math.abs(Math.round((descontos / bruto) * 1000) / 10).toLocaleString("pt-BR")}%)` : ""}</span></div>}
          </div>
          {dias.length ? (
            <>
              <div className="fx-barras" style={{ height: 200 }}>
                {dias.map(([d, v]) => (
                  <div key={d} className={`fx-barra ${v === maiorDia ? "maior" : ""}`} title={`${d.split("-").reverse().join("/")}: ${reais(v)}`}>
                    <i style={{ height: `${Math.max(4, (v / maiorDia) * 100)}%` }} />
                    {v === maiorDia && <span className="balao" style={{ bottom: `${Math.max(4, (v / maiorDia) * 100)}%` }}>{curto(v)}</span>}
                  </div>
                ))}
              </div>
              <div className="fx-eixo">{dias.map(([d]) => <span key={d}>{Number(d.slice(8, 10))}</span>)}</div>
            </>
          ) : <p className="fx-sem-grafico">Sem o relatório de vendas por data deste mês.</p>}
        </section>

        <section className="painel c12">
          <div className="painel-topo"><div><h2>Produtos mais vendidos</h2><p>Os 20 modelos que mais saíram em {mesExtenso(mes)} (curva ABC)</p></div></div>
          {produtos.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>#</th><th>Produto</th><th>Classe</th><th className="num">Peças</th><th className="num">Do mês</th><th className="num">Custo</th><th className="num">Venda</th></tr></thead>
                <tbody>
                  {produtos.map((p, i) => (
                    <tr key={p.codigo}>
                      <td><span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}</span></td>
                      <td><strong>{p.descricao}</strong><div className="mini">ref. {p.referencia}</div></td>
                      <td>{p.classe && <span className={`etiqueta ${p.classe === "A" ? "ok" : p.classe === "B" ? "info" : "neutra"}`}>{p.classe}</span>}</td>
                      <td className="num"><strong>{numero(p.quantidade)}</strong></td>
                      <td className="num">{n(p.percentual).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                      <td className="num">{reais(n(p.custo))}</td>
                      <td className="num">{reais(n(p.venda))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="fx-sem-grafico">Sem a curva ABC deste mês.</p>}
        </section>
      </div>
    </>
  );
}

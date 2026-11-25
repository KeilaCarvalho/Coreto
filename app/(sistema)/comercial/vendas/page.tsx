import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { numero, reais } from "@/lib/formatos";
import { FaixaHera } from "@/components/hera/atualizar";
import { agruparFormas, curvaABC, haQuanto, maquinaDoTipo, nomeBonito, somarClientes, somarPares, type DiaHera, type MesHera, type MetricasHera, type SubgrupoHera } from "@/lib/hera";

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

  const [{ data: mR }, { data: mesesC }, { data: mesesP }, { data: mesesI }, { data: mesesV }, { data: hMesesR }, { data: sincR }] = await Promise.all([
    supabase.from("vendas_mensais").select("mes, pecas, devolucoes, faturadas, qtd_vendas, valor_total, preco_medio").order("mes"),
    supabase.from("comissoes_mensais").select("mes").limit(1000),
    supabase.from("produtos_vendidos_mes").select("mes").limit(5000),
    supabase.from("relatorios_importados").select("mes").eq("tipo", "vendas_dia").not("mes", "is", null),
    supabase.from("importacoes_clientes").select("mes").eq("tipo", "vendas_vendedora").not("mes", "is", null),
    supabase.from("hera_meses").select("mes, loja, metricas").not("metricas", "is", null),
    supabase.from("hera_sincronizacoes").select("inicio, fim, ok, erro").order("inicio", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Totais do HeraDash por mês (somando as lojas que têm venda).
  const heraPorMes = new Map<string, MetricasHera>();
  for (const h of (hMesesR ?? []) as { mes: string; metricas: MetricasHera }[]) {
    const m = h.mes.slice(0, 7), a = heraPorMes.get(m);
    heraPorMes.set(m, a ? { VALOR_TOTAL: a.VALOR_TOTAL + h.metricas.VALOR_TOTAL, PREVISAO: a.PREVISAO + h.metricas.PREVISAO, QUANTIDADE: a.QUANTIDADE + h.metricas.QUANTIDADE, ATENDIMENTOS: a.ATENDIMENTOS + h.metricas.ATENDIMENTOS, TICKET_MEDIO: 0, MEDIA_DIA: a.MEDIA_DIA + h.metricas.MEDIA_DIA } : h.metricas);
  }
  const sinc = sincR as { inicio: string; fim: string | null; ok: boolean | null; erro: string | null } | null;
  const mensaisRel = ((mR ?? []) as Mensal[]).map((m) => ({ ...m, mes: m.mes.slice(0, 7), valor_total: n(m.valor_total), preco_medio: n(m.preco_medio) }));
  // O HeraDash manda nos meses que ele tem; o relatório importado cobre os anteriores.
  const mensais = [...new Set([...mensaisRel.map((m) => m.mes), ...heraPorMes.keys()])].sort().map((mes) => {
    const h = heraPorMes.get(mes), r = mensaisRel.find((x) => x.mes === mes);
    return h ? { mes, pecas: h.QUANTIDADE, devolucoes: r?.devolucoes ?? 0, faturadas: h.QUANTIDADE, qtd_vendas: h.ATENDIMENTOS, valor_total: h.VALOR_TOTAL, preco_medio: h.QUANTIDADE ? h.VALOR_TOTAL / h.QUANTIDADE : 0 } : r!;
  });
  const disponiveis = [...new Set([...mensais.map((m) => m.mes), ...[...(mesesC ?? []), ...(mesesP ?? []), ...(mesesI ?? []), ...(mesesV ?? [])].map((x) => String(x.mes).slice(0, 7))])].sort();
  const mes = pedido && disponiveis.includes(pedido) ? pedido : disponiveis[disponiveis.length - 1];
  const podeImportar = sessao.pode("relatorios");

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
  const [{ data: cR }, { data: pR }, { data: iR }, { data: vR }, { data: hMesR }, { data: hDiasR }] = await Promise.all([
    supabase.from("comissoes_mensais").select("codigo, vendedora, vendas, comissao, percentual, qtd_vendas, qtd_pecas, ticket_medio, valor_pagar").eq("mes", inicio).order("vendas", { ascending: false }),
    supabase.from("produtos_vendidos_mes").select("codigo, referencia, descricao, classe, quantidade, custo, venda, percentual").eq("mes", inicio).order("quantidade", { ascending: false }).limit(2000),
    supabase.from("vendas_itens").select("data, quantidade, valor_produto, variacao_valor, valor_total").eq("mes", inicio).limit(10000),
    supabase.from("cliente_compras").select("data, vendedora_nome, valor, valor_produtos, valor_variacao").gte("data", inicio).lte("data", fim).limit(10000),
    supabase.from("hera_meses").select("mes, loja, metricas, caixa, vendedoras, produtos, subgrupos, atualizado_em").eq("mes", inicio),
    supabase.from("hera_dias").select("data, loja, faturamento, caixa, vendedoras, clientes, atualizado_em").gte("data", inicio).lte("data", fim).order("data"),
  ]);
  const { data: pessoasR } = await supabase.from("pessoas").select("nome, apelido").eq("e_vendedora", true);
  // O HeraDash corta o nome em 15 letras ("ROSEMEIRE AUGUS"); usa o nome do cadastro quando bate.
  const nomeVendedora = (bruto: string) => {
    const b = bruto.trim().toLowerCase();
    const p = (pessoasR ?? []).find((x) => x.nome.toLowerCase().startsWith(b) || (b.length >= 15 && x.nome.toLowerCase().startsWith(b.slice(0, 12))));
    return p ? (p.apelido || p.nome) : nomeBonito(bruto);
  };
  const hMes = ((hMesR ?? []) as MesHera[]).filter((h) => h.metricas);
  const hDias = (hDiasR ?? []) as DiaHera[];
  const temHera = hMes.length > 0;
  const heraVendedoras = somarPares(hMes.map((h) => h.vendedoras));
  const formasMes = agruparFormas(somarPares(hMes.map((h) => h.caixa)));
  const totalFormasMes = formasMes.reduce((t, f) => t + f.valor, 0);
  const curva = curvaABC(hMes.flatMap((h) => h.produtos ?? []));
  const subgrupos = (hMes.flatMap((h) => h.subgrupos ?? []) as SubgrupoHera[]).sort((a, b) => b.VLR_TOTAL - a.VLR_TOTAL);
  const maiorSub = Math.max(1, ...subgrupos.map((g) => g.VLR_TOTAL));
  const clientesMes = somarClientes(hDias).slice(0, 15);
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const diasHoje = hDias.filter((d) => d.data === hojeIso);
  const hoje = diasHoje.length ? { total: diasHoje.reduce((t, d) => t + n(d.faturamento), 0), formas: agruparFormas(somarPares(diasHoje.map((d) => d.caixa))), vendedoras: somarPares(diasHoje.map((d) => d.vendedoras)), clientes: somarClientes(diasHoje) } : null;
  const atualizadoHera = hMes.map((h) => h.atualizado_em).sort().at(-1) ?? null;
  const compras = (vR ?? []) as Compra[];
  // Sem o relatório de comissão, o ranking sai das vendas por vendedora.
  const porVendedora = new Map<string, { vendas: number; qtd: number }>();
  for (const c of compras) {
    const nome = c.vendedora_nome || "Sem vendedora";
    const a = porVendedora.get(nome) ?? { vendas: 0, qtd: 0 };
    porVendedora.set(nome, { vendas: a.vendas + n(c.valor), qtd: a.qtd + 1 });
  }
  const comissoesRel = (cR ?? []) as Comissao[];
  const comissoes: Comissao[] = comissoesRel.length ? comissoesRel : heraVendedoras.length ? heraVendedoras.map((v) => ({
    codigo: v.x, vendedora: nomeVendedora(v.x), vendas: v.y, comissao: 0, percentual: 0, qtd_vendas: 0, qtd_pecas: 0, ticket_medio: 0, valor_pagar: 0,
  })) : [...porVendedora.entries()].sort((a, b) => b[1].vendas - a[1].vendas).map(([nome, v]) => ({
    codigo: nome, vendedora: nome, vendas: v.vendas, comissao: 0, percentual: 0, qtd_vendas: v.qtd, qtd_pecas: 0, ticket_medio: v.qtd ? v.vendas / v.qtd : 0, valor_pagar: 0,
  }));
  const semComissao = !comissoesRel.length && comissoes.length > 0;
  const todosProdutos = (pR ?? []) as Produto[];
  const produtos = todosProdutos.slice(0, 20);
  const pecasCurva = todosProdutos.reduce((t, p) => t + n(p.quantidade), 0);
  const itens = (iR ?? []) as Item[];
  const doMes = mensais.find((m) => m.mes === mes);
  const anterior = mensais.find((m) => m.mes === disponiveis[disponiveis.indexOf(mes) - 1]);

  // Números do mês: o resumo mensal manda; sem ele, usa a comissão ou as vendas peça a peça.
  const totalComissoes = comissoes.reduce((t, c) => t + n(c.vendas), 0);
  const totalItens = itens.reduce((t, i) => t + n(i.valor_total), 0);
  const totalCompras = compras.reduce((t, c) => t + n(c.valor), 0);
  const valorMes = doMes?.valor_total ?? (totalComissoes || totalCompras || totalItens);
  const qtdVendas = doMes?.qtd_vendas ?? (comissoes.reduce((t, c) => t + n(c.qtd_vendas), 0) || compras.length);
  // Peças: resumo do mês > comissão > vendas peça a peça > curva ABC (soma das quantidades dos produtos).
  const pecasComissao = comissoes.reduce((t, c) => t + n(c.qtd_pecas), 0);
  const pecasItens = itens.reduce((t, i) => t + n(i.quantidade), 0);
  const pecas = doMes?.faturadas ?? (pecasComissao || pecasItens || pecasCurva);
  const pecasDaCurva = doMes?.faturadas == null && !pecasComissao && !pecasItens && pecasCurva > 0;
  const ticket = qtdVendas ? valorMes / qtdVendas : 0;
  const variacao = anterior && anterior.valor_total ? ((valorMes - anterior.valor_total) / anterior.valor_total) * 100 : null;

  // Gráfico do ano: últimos 12 meses do resumo
  const ano = mensais.slice(-12);
  const maiorMes = Math.max(0, ...ano.map((m) => m.valor_total));

  // Dia a dia e descontos (vendas peça a peça)
  const porDia = new Map<string, number>();
  if (hDias.length) for (const d of hDias) { if (n(d.faturamento)) porDia.set(d.data, (porDia.get(d.data) ?? 0) + n(d.faturamento)); }
  else if (itens.length) for (const i of itens) porDia.set(i.data, (porDia.get(i.data) ?? 0) + n(i.valor_total));
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
        descricao={temHera ? `Números de ${mesExtenso(mes)}, puxados do HeraDash.` : `Números de ${mesExtenso(mes)}, dos relatórios do sistema de vendas da loja.`}
        acoes={podeImportar && <Link className="botao leve" href="/comercial/relatorios"><Icone nome="arquivo" />Importar relatórios</Link>}
      />
      {(temHera || sinc) && <FaixaHera quando={haQuanto(atualizadoHera ?? sinc?.fim)} erro={sinc && sinc.ok === false ? sinc.erro : null} />}
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
          <p className="kpi-nota">{doMes?.devolucoes ? `${numero(doMes.devolucoes)} devolvidas` : pecasDaCurva ? "pela curva ABC importada" : pecas ? "no mês" : "importe a curva ABC ou vendas por dia"}</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Vendas</span><span className="seta"><Icone nome="caixa" tamanho={16} /></span></div>
          <p className="kpi-valor">{numero(qtdVendas)}</p>
          <p className="kpi-nota">{qtdVendas ? `${(pecas / qtdVendas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} peças por venda` : "atendimentos com venda"}</p>
        </div>
        <div className="kpi">
          <div className="kpi-topo"><span>Ticket médio</span><span className="seta"><Icone nome="clientes" tamanho={16} /></span></div>
          <p className="kpi-valor">{reais(ticket)}</p>
          <p className="kpi-nota">{temHera && heraPorMes.get(mes)?.PREVISAO ? `previsão do mês ${reais(heraPorMes.get(mes)!.PREVISAO)}` : doMes ? `preço médio da peça ${reais(doMes.preco_medio)}` : "por venda"}</p>
        </div>
      </section>

      <div className="fx-grade">
        {temHera && mes === hojeIso.slice(0, 7) && (
          <section className="painel c5 hera-hoje">
            <div className="painel-topo"><div><h2>Hoje</h2><p>{hoje?.clientes.length ? (() => { const v = hoje.clientes.reduce((t, c) => t + c.vendas, 0), p = hoje.clientes.reduce((t, c) => t + c.pecas, 0); return `${v} ${v === 1 ? "venda" : "vendas"} · ${p} ${p === 1 ? "peça" : "peças"}`; })() : "Nenhuma venda lançada ainda"}</p></div><div className="fx-total"><strong>{reais(hoje?.total ?? 0)}</strong><span>vendido hoje</span></div></div>
            {hoje && (hoje.formas.length > 0 || hoje.vendedoras.length > 0) ? (
              <ul className="fx-lista">
                {hoje.formas.map((f) => <li key={f.nome}><span>{f.nome}<small className="mini">{f.detalhes.map((d) => maquinaDoTipo(d.x)).filter(Boolean).join(", ")}</small></span><span className="fx-valor">{reais(f.valor)}</span></li>)}
                {hoje.vendedoras.map((v) => <li key={v.x} className="hera-vend"><span>{nomeVendedora(v.x)}</span><span className="fx-valor">{reais(v.y)}</span></li>)}
              </ul>
            ) : <p className="fx-sem-grafico">Assim que entrar a primeira venda no caixa, ela aparece aqui.</p>}
          </section>
        )}
        {temHera && (
          <section className={`painel ${mes === hojeIso.slice(0, 7) ? "c7" : "c12"}`}>
            <div className="painel-topo"><div><h2>Formas de pagamento</h2><p>Recebido no caixa em {mesExtenso(mes)}</p></div><div className="fx-total"><strong>{reais(totalFormasMes)}</strong><span>no caixa</span></div></div>
            <ul className="fx-lista hera-formas">
              {formasMes.map((f) => (
                <li key={f.nome}>
                  <details>
                    <summary><span>{f.nome}</span><span className="fx-trilho"><i style={{ width: `${Math.max(2, (f.valor / (formasMes[0]?.valor || 1)) * 100)}%` }} /></span><span className="fx-valor">{reais(f.valor)}<small>{totalFormasMes ? `${Math.round((f.valor / totalFormasMes) * 100)}%` : ""}</small></span></summary>
                    <ul>{f.detalhes.map((d) => <li key={d.x}><span>{d.x.toLowerCase()}</span><span>{reais(d.y)}</span></li>)}</ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
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
          <div className="painel-topo"><div><h2>Vendedoras</h2><p>{semComissao || (!comissoesRel.length && heraVendedoras.length) ? "Vendas no mês" : "Vendas e comissão no mês"}</p></div>{totalComissao > 0 && <div className="fx-total"><strong>{reais(totalComissao)}</strong><span>de comissão a pagar</span></div>}</div>
          {comissoes.length ? (
            <ul className="fx-lista">
              {comissoes.map((c, i) => (
                <li key={c.codigo}>
                  <div className="fx-equipe fx-equipe-vd">
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}º</span>
                      <span style={{ minWidth: 0 }}><b className="fx-nome">{c.vendedora.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()).replace(/ (D[aeo]s?|E) /g, (m) => m.toLowerCase())}</b><span className="mini">{c.qtd_vendas ? `${numero(c.qtd_vendas)} vendas · ticket ${reais(n(c.ticket_medio))}` : valorMes ? `${Math.round((n(c.vendas) / valorMes) * 100)}% do mês` : ""}</span></span>
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

        {temHera && curva.length > 0 ? (
          <>
            <section className="painel c8">
              <div className="painel-topo"><div><h2>Curva ABC</h2><p>{curva.length} modelos vendidos · {curva.filter((p) => p.classe === "A").length} fazem 80% do valor</p></div></div>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>#</th><th>Produto</th><th>Classe</th><th className="num">Peças</th><th className="num">Do mês</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {curva.slice(0, 30).map((p, i) => (
                      <tr key={p.COD_PROD}>
                        <td><span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}</span></td>
                        <td><strong>{nomeBonito(p.x)}</strong><div className="mini">ref. {p.REF_PROD} · {reais(p.VLR_UNIT_MEDIO)} cada</div></td>
                        <td><span className={`etiqueta ${p.classe === "A" ? "ok" : p.classe === "B" ? "info" : "neutra"}`}>{p.classe}</span></td>
                        <td className="num"><strong>{numero(p.QTD_VENDIDA)}</strong></td>
                        <td className="num">{p.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                        <td className="num">{reais(p.VLR_TOTAL)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mini" style={{ padding: "10px 4px 0" }}>Valores pelo preço de tabela das peças, antes dos descontos da venda.</p>
            </section>
            <section className="painel c4">
              <div className="painel-topo"><div><h2>Por tipo de peça</h2><p>Subgrupos do mês</p></div></div>
              <ul className="fx-lista">
                {subgrupos.map((g) => (
                  <li key={g.x}><div className="fx-equipe"><span><b>{nomeBonito(g.x)}</b><span className="mini">{numero(g.QTD_VENDIDA)} peças</span></span><span className="fx-trilho"><i style={{ width: `${Math.max(2, (g.VLR_TOTAL / maiorSub) * 100)}%` }} /></span><span className="fx-valor">{reais(g.VLR_TOTAL)}</span></div></li>
                ))}
              </ul>
            </section>
            {clientesMes.length > 0 && (
              <section className="painel c12">
                <div className="painel-topo"><div><h2>Clientes que mais compraram</h2><p>{mesExtenso(mes)}, pelo caixa do HeraDash</p></div></div>
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead><tr><th>#</th><th>Cliente</th><th className="num">Compras</th><th className="num">Peças</th><th className="num">Valor</th></tr></thead>
                    <tbody>
                      {clientesMes.map((c, i) => (
                        <tr key={c.nome}>
                          <td><span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}</span></td>
                          <td><strong>{nomeBonito(c.nome)}</strong></td>
                          <td className="num">{numero(c.vendas)}</td>
                          <td className="num">{numero(c.pecas)}</td>
                          <td className="num">{c.aproximado ? "≈ " : ""}{reais(c.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : (
        <section className="painel c12">
          <div className="painel-topo"><div><h2>Produtos mais vendidos</h2><p>Os 20 modelos que mais saíram em {mesExtenso(mes)} (curva ABC)</p></div></div>
          {produtos.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>#</th><th>Produto</th><th>Classe</th><th className="num">Peças</th><th className="num">Do mês</th><th className="num">Venda</th></tr></thead>
                <tbody>
                  {produtos.map((p, i) => (
                    <tr key={p.codigo}>
                      <td><span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}</span></td>
                      <td><strong>{p.descricao}</strong><div className="mini">ref. {p.referencia}</div></td>
                      <td>{p.classe && <span className={`etiqueta ${p.classe === "A" ? "ok" : p.classe === "B" ? "info" : "neutra"}`}>{p.classe}</span>}</td>
                      <td className="num"><strong>{numero(p.quantidade)}</strong></td>
                      <td className="num">{n(p.percentual).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                      <td className="num">{reais(n(p.venda))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="fx-sem-grafico">Sem a curva ABC deste mês.</p>}
        </section>
        )}
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { lerSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Icone, type NomeIcone } from "@/components/icone";
import { hojeExtenso, horaSP, numero, reais } from "@/lib/formatos";
import { FILTRO_BANCOS, diasPara } from "@/lib/contas-pagar";
import { corBanco } from "@/lib/bancos";

export const metadata = { title: "Início" };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somaValores = (l: unknown) => (Array.isArray(l) ? l.reduce((t: number, x: { valor?: number }) => t + Number(x?.valor ?? 0), 0) : 0);
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 100000 ? 0 : 1 })} mil` : String(Math.round(v)));

type Sinal = { tipo: "urgente" | "atencao" | "ok"; icone: NomeIcone; titulo: string; texto: string; href: string; acao: string };

/** Linha de tendência (sparkline) com área suave. */
function Linha({ valores, cor = "var(--marca)" }: { valores: number[]; cor?: string }) {
  if (valores.length < 2) return <span className="ind-linha" />;
  const max = Math.max(...valores), min = Math.min(...valores), w = 200, h = 30;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="ind-linha" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={cor} opacity="0.12" />
      <path d={d} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Indicador({ titulo, icone, valor, linha, selo, nota, href, cor }: {
  titulo: string; icone: NomeIcone; valor: string; linha?: number[]; selo?: { texto: string; tipo: "sobe" | "desce" | "" }; nota?: string; href?: string; cor?: string;
}) {
  const corpo = (
    <>
      <div className="ind-titulo"><span className="ico"><Icone nome={icone} /></span>{titulo}</div>
      <div className="ind-valor">{valor}</div>
      {linha ? <Linha valores={linha} cor={cor} /> : null}
      <div className="ind-rodape">{selo && <span className={`selo ${selo.tipo}`}>{selo.texto}</span>}{nota}</div>
    </>
  );
  return href ? <Link className="ind" href={href}>{corpo}</Link> : <div className="ind">{corpo}</div>;
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sessao = (await lerSessao())!;
  if (!sessao.pode("produto") && !sessao.pode("estoque") && !sessao.pode("financeiro") && sessao.pode("marketing")) redirect("/marketing");
  const { aviso } = await searchParams;
  const sb = await supabaseServidor();

  const veFin = sessao.pode("financeiro");
  const lancaFin = sessao.pode("financeiro", "criar");
  const veEstoque = sessao.pode("estoque");
  const veProd = sessao.pode("producao");
  const veFotos = sessao.pode("marketing");
  const administra = sessao.pode("configuracoes", "editar");

  const agora = new Date();
  const hoje = diaSP(agora);
  const mesAtual = `${hoje.slice(0, 7)}-01`;
  const seisMeses = (() => { const d = new Date(`${mesAtual}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 5); return d.toISOString().slice(0, 10); })();
  const em7 = diaSP(new Date(agora.getTime() + 7 * 864e5));
  const vazio = { data: null, count: null } as const;

  const [mesesR, vendMesR, diasR, contasR, cobrR, saldosR, colunasR, opsR, recR, fotosR, acessoR, hojeR] = await Promise.all([
    veFin ? sb.from("fluxo_meses").select("mes, vendas").gte("mes", seisMeses).order("mes") : vazio,
    veFin ? sb.from("vendas_mensais").select("mes, valor_total").gte("mes", seisMeses).order("mes") : vazio,
    veFin ? sb.from("fluxo_dias").select("data, saldos, vendas").order("data", { ascending: false }).limit(20) : vazio,
    veFin ? sb.from("contas_pagar").select("vencimento, em_aberto").gt("em_aberto", 0).lte("vencimento", em7) : vazio,
    lancaFin ? sb.from("contas_pagar").select("vencimento, em_aberto").or(FILTRO_BANCOS).gt("em_aberto", 0).lte("vencimento", diaSP(new Date(agora.getTime() + 3 * 864e5))) : vazio,
    veEstoque ? sb.from("saldos_estoque").select("saldo") : vazio,
    veProd ? sb.from("producao_colunas").select("id, nome, cor, final").order("ordem") : vazio,
    veProd ? sb.from("producao_ops").select("coluna_id, prazo, quantidade").is("arquivado_em", null) : vazio,
    sessao.pode("producao") || sessao.pode("produto") ? sb.from("recebimentos_resumo").select("situacao") .in("situacao", ["pronto", "sem_preco"]) : vazio,
    veFotos ? sb.from("fotos_itens").select("id", { count: "exact", head: true }).in("situacao", ["com_ela", "devolvendo", "doando"]) : vazio,
    administra ? sb.from("pessoas").select("nome").not("usuario_id", "is", null).eq("acesso_ativo", false).is("arquivado_em", null).limit(3) : vazio,
    administra ? sb.from("acessos_dia").select("primeiro, ultimo, pessoas(nome)").eq("dia", hoje).order("primeiro") : vazio,
  ]);

  // Vendas por mês (fluxo financeiro; meses antigos vêm do relatório importado)
  const porMes = new Map<string, number>();
  for (const v of (vendMesR.data ?? []) as { mes: string; valor_total: number }[]) porMes.set(v.mes.slice(0, 7), Number(v.valor_total));
  for (const m of (mesesR.data ?? []) as { mes: string; vendas: unknown }[]) { const s = somaValores(m.vendas); if (s > 0) porMes.set(m.mes.slice(0, 7), s); }
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(`${seisMeses}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); const k = d.toISOString().slice(0, 7); return { k, rot: MESES[d.getUTCMonth()], valor: porMes.get(k) ?? 0 }; });
  const vendasMes = meses[5].valor, vendasAnt = meses[4].valor;
  const diaDoMes = Number(hoje.slice(8, 10));
  const diasNoMesAnt = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, 0).getDate();
  const ritmo = vendasAnt > 0 ? Math.round(((vendasMes / diaDoMes) / (vendasAnt / diasNoMesAnt) - 1) * 100) : null;

  // Saldo nos bancos (último fluxo lançado)
  const dias = ((diasR.data ?? []) as { data: string; saldos: unknown; vendas: unknown }[]).filter((d) => somaValores(d.saldos) !== 0);
  const ultimoDia = dias[0];
  const saldoAtual = ultimoDia ? somaValores(ultimoDia.saldos) : 0;
  const saldoAnt = dias[1] ? somaValores(dias[1].saldos) : null;
  const linhaSaldo = dias.slice(0, 14).reverse().map((d) => somaValores(d.saldos));
  const bancos = ultimoDia && Array.isArray(ultimoDia.saldos) ? (ultimoDia.saldos as { nome: string; valor: number }[]).filter((b) => Number(b.valor) !== 0).sort((a, b) => b.valor - a.valor) : [];

  // Contas a pagar nos próximos 7 dias
  const contas = (contasR.data ?? []) as { vencimento: string; em_aberto: number }[];
  const atrasadas = contas.filter((c) => c.vencimento < hoje);
  const totalSemana = contas.reduce((t, c) => t + Number(c.em_aberto), 0);

  // Produção
  const colunas = (colunasR.data ?? []) as { id: string; nome: string; cor: string | null; final: boolean }[];
  const ops = (opsR.data ?? []) as { coluna_id: string; prazo: string | null; quantidade: number | null }[];
  const emProducao = ops.filter((o) => !colunas.find((c) => c.id === o.coluna_id)?.final);
  const opsAtrasadas = emProducao.filter((o) => o.prazo && o.prazo < hoje).length;
  const maxEtapa = Math.max(1, ...colunas.map((c) => ops.filter((o) => o.coluna_id === c.id).length));

  const pecas = ((saldosR.data ?? []) as { saldo: number }[]).reduce((t, s) => t + s.saldo, 0);

  // Sinais: o que pede ação hoje
  const sinais: Sinal[] = [];
  const cobranca = (cobrR.data ?? []) as { vencimento: string; em_aberto: number }[];
  if (cobranca.length) {
    const atr = cobranca.filter((c) => diasPara(c.vencimento, hoje) < 0);
    const soma = cobranca.reduce((t, c) => t + Number(c.em_aberto), 0);
    sinais.push({ tipo: atr.length ? "urgente" : "atencao", icone: "banco", titulo: atr.length ? `${atr.length} ${atr.length === 1 ? "conta atrasada" : "contas atrasadas"} no Santander/Caixa` : `${cobranca.length} ${cobranca.length === 1 ? "conta vence" : "contas vencem"} até 3 dias`, texto: `${reais(soma)} em aberto`, href: "/financeiro/contas?aba=cobranca", acao: "Ver contas" });
  }
  if (lancaFin && (!ultimoDia || diasPara(ultimoDia.data, hoje) > 1)) {
    sinais.push({ tipo: "atencao", icone: "financeiro", titulo: "Fluxo financeiro sem lançar", texto: ultimoDia ? `Último lançamento em ${ultimoDia.data.slice(8, 10)}/${ultimoDia.data.slice(5, 7)}` : "Nenhum dia lançado ainda", href: "/financeiro/fluxo", acao: "Lançar" });
  }
  const recs = (recR.data ?? []) as { situacao: string }[];
  const semPreco = recs.filter((r) => r.situacao === "sem_preco").length, prontos = recs.filter((r) => r.situacao === "pronto").length;
  if (semPreco) sinais.push({ tipo: "atencao", icone: "entrada", titulo: `${semPreco} ${semPreco === 1 ? "chegada" : "chegadas"} da facção sem preço`, texto: "Precifique para liberar para a loja", href: "/producao/recebimentos", acao: "Precificar" });
  if (prontos) sinais.push({ tipo: "ok", icone: "entrada", titulo: `${prontos} ${prontos === 1 ? "chegada pronta" : "chegadas prontas"} para liberar`, texto: "Já têm preço, falta liberar as peças", href: "/producao/recebimentos", acao: "Liberar" });
  if (opsAtrasadas) sinais.push({ tipo: "urgente", icone: "quadro", titulo: `${opsAtrasadas} ${opsAtrasadas === 1 ? "OP atrasada" : "OPs atrasadas"}`, texto: "Prazo vencido no quadro de produção", href: "/producao/quadro", acao: "Ver quadro" });
  if (fotosR.count) sinais.push({ tipo: "atencao", icone: "fotos", titulo: `${fotosR.count} ${fotosR.count === 1 ? "peça" : "peças"} das fotos para resolver`, texto: "Para devolver ou com aviso de devolução/doação", href: "/marketing", acao: "Ver" });
  const pedidos = (acessoR.data ?? []) as { nome: string }[];
  if (pedidos.length) sinais.push({ tipo: "atencao", icone: "acessos", titulo: `${pedidos.map((p) => p.nome.split(" ")[0]).join(", ")} ${pedidos.length === 1 ? "pediu" : "pediram"} acesso`, texto: "Escolha o perfil e libere", href: "/configuracoes/acessos", acao: "Revisar" });

  const hora = horaSP();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = sessao.pessoa!.nome.split(" ")[0];
  const maxMes = Math.max(1, ...meses.map((m) => m.valor));

  const atalhos: { href: string; icone: NomeIcone; rotulo: string; ok: boolean }[] = [
    { href: "/financeiro/fluxo", icone: "financeiro", rotulo: "Fluxo financeiro", ok: veFin },
    { href: "/financeiro/contas", icone: "banco", rotulo: "Contas a pagar", ok: veFin },
    { href: "/producao/quadro", icone: "quadro", rotulo: "Quadro de produção", ok: veProd },
    { href: "/comercial/vendas", icone: "cifrao", rotulo: "Vendas", ok: sessao.pode("comercial", "aprovar") },
    { href: "/producao/recebimentos", icone: "entrada", rotulo: "Chegada da facção", ok: veProd },
    { href: "/estoque/saldos", icone: "saldos", rotulo: "Estoque", ok: veEstoque },
  ];

  return (
    <>
      {aviso === "sem-permissao" && <p className="aviso alerta" role="alert"><Icone nome="alerta" />Seu perfil não tem acesso àquela área. Fale com a administração se precisar.</p>}
      <div className="ini-topo">
        <div>
          <h1>{saudacao}, {primeiroNome}</h1>
          <p>{hojeExtenso(agora)}. Veja como a Coreto está hoje.</p>
        </div>
        <div className="acoes">
          {lancaFin && <Link className="botao" href="/financeiro/fluxo"><Icone nome="financeiro" />Lançar fluxo</Link>}
          {sessao.pode("producao", "criar") && <Link className="botao secundario" href="/producao/quadro"><Icone nome="quadro" />Quadro</Link>}
        </div>
      </div>

      <div className="ini-grade">
        <div className="c12 ini-inds">
          {veFin && <Indicador titulo="Vendas do mês" icone="cifrao" valor={reais(vendasMes)} linha={meses.map((m) => m.valor)} selo={ritmo != null ? { texto: `${ritmo >= 0 ? "▲" : "▼"} ${Math.abs(ritmo)}%`, tipo: ritmo >= 0 ? "sobe" : "desce" } : undefined} nota={ritmo != null ? "vs. mês passado" : "lançadas no fluxo"} href="/financeiro/fluxo" />}
          {veFin && <Indicador titulo="Saldo nos bancos" icone="banco" valor={reais(saldoAtual)} linha={linhaSaldo} selo={saldoAnt != null ? { texto: `${saldoAtual >= saldoAnt ? "▲" : "▼"} ${reais(Math.abs(saldoAtual - saldoAnt))}`, tipo: saldoAtual >= saldoAnt ? "sobe" : "desce" } : undefined} nota={ultimoDia ? `${ultimoDia.data.slice(8, 10)}/${ultimoDia.data.slice(5, 7)}` : "sem fluxo lançado"} href="/financeiro/fluxo" cor="#2f7cf6" />}
          {veFin && <Indicador titulo="A pagar em 7 dias" icone="calendario" valor={reais(totalSemana)} selo={atrasadas.length ? { texto: `${atrasadas.length} ${atrasadas.length === 1 ? "atrasada" : "atrasadas"}`, tipo: "desce" } : { texto: "em dia", tipo: "sobe" }} nota={`${contas.length} ${contas.length === 1 ? "conta" : "contas"}`} href="/financeiro/contas" />}
          {veProd ? <Indicador titulo="Em produção" icone="quadro" valor={`${numero(emProducao.length)} OPs`} selo={opsAtrasadas ? { texto: `${opsAtrasadas} atrasada${opsAtrasadas > 1 ? "s" : ""}`, tipo: "desce" } : undefined} nota={`${numero(emProducao.reduce((t, o) => t + (o.quantidade ?? 0), 0))} peças nas etapas`} href="/producao/quadro" />
            : veEstoque ? <Indicador titulo="Peças em estoque" icone="saldos" valor={numero(pecas)} nota="somando todos os locais" href="/estoque/saldos" /> : null}
        </div>

        {veFin && (
          <section className="painel c7">
            <div className="painel-topo"><div><h2>Vendas por mês</h2><p>Últimos 6 meses · o mês atual ainda está correndo</p></div><Link className="botao secundario pequeno" href="/comercial/vendas">Ver vendas</Link></div>
            <div className="barras-mes" style={{ "--n": 6 } as React.CSSProperties}>
              {meses.map((m, i) => {
                const alt = Math.round((m.valor / maxMes) * 100);
                return <div key={m.k} className={`b${i === 5 ? " atual" : ""}`} title={`${m.rot}: ${reais(m.valor)}`}><em style={{ bottom: `calc(${alt}% + 4px)` }}>{m.valor ? compacto(m.valor) : ""}</em><i style={{ height: `${alt}%` }} /></div>;
              })}
            </div>
            <div className="barras-mes-rot" style={{ "--n": 6 } as React.CSSProperties}>{meses.map((m) => <span key={m.k}>{m.rot}</span>)}</div>
          </section>
        )}

        <section className={`painel ini-sinais ${veFin ? "c5" : "c7"}`}>
          <div className="painel-topo"><div><h2>Pede atenção</h2><p>O que dá pra resolver agora</p></div>{sinais.length > 0 && <span className="etiqueta alerta">{sinais.length}</span>}</div>
          {sinais.length ? (
            <div className="sinais">
              {sinais.slice(0, 6).map((s) => (
                <div key={s.titulo} className={`sinal ${s.tipo}`}>
                  <span className="ico"><Icone nome={s.icone} /></span>
                  <div><strong>{s.titulo}</strong><span>{s.texto}</span></div>
                  <Link className="botao secundario pequeno" href={s.href}>{s.acao}</Link>
                </div>
              ))}
            </div>
          ) : <p className="sinal-vazio">Tudo em dia por aqui. Avisos de contas, facção, produção e fotos aparecem neste cartão.</p>}
        </section>

        {veProd && colunas.length > 0 && (
          <section className="painel c5">
            <div className="painel-topo"><div><h2>Produção por etapa</h2><p>OPs em cada coluna do quadro</p></div><Link className="botao secundario pequeno" href="/producao/quadro">Abrir quadro</Link></div>
            <div className="etapas">
              {colunas.map((c) => {
                const n = ops.filter((o) => o.coluna_id === c.id).length;
                return (
                  <Link key={c.id} className="etapa-linha" href="/producao/quadro">
                    <span>{c.nome}</span>
                    <span className="etapa-barra"><i style={{ width: `${(n / maxEtapa) * 100}%`, background: c.cor ?? "var(--marca)" }} /></span>
                    <b>{n}</b>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {veFin && bancos.length > 0 && (
          <section className="painel c7">
            <div className="painel-topo"><div><h2>Saldos por banco</h2><p>Do último fluxo lançado</p></div></div>
            <div className="etapas">
              {bancos.map((b) => (
                <div key={b.nome} className="etapa-linha valor">
                  <span>{b.nome}</span>
                  <span className="etapa-barra"><i style={{ width: `${Math.max(2, (Math.max(0, b.valor) / Math.max(1, bancos[0].valor)) * 100)}%`, background: corBanco(b.nome).fundo }} /></span>
                  <b>{reais(b.valor)}</b>
                </div>
              ))}
            </div>
          </section>
        )}

        {administra && (
          <section className="painel c12">
            <div className="painel-topo"><div><h2>Quem usou o sistema hoje</h2><p>Primeiro e último horário de cada pessoa</p></div><Link className="botao secundario pequeno" href="/configuracoes/acessos">Ver acessos</Link></div>
            {((hojeR.data ?? []) as unknown as { primeiro: string; ultimo: string; pessoas: { nome: string } | null }[]).length ? (
              <div className="hoje-acessos">
                {((hojeR.data ?? []) as unknown as { primeiro: string; ultimo: string; pessoas: { nome: string } | null }[]).map((x, i) => {
                  const h = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                  return <span key={i} className="hoje-acesso"><span className="avatar-mini">{(x.pessoas?.nome ?? "?").charAt(0)}</span><b>{(x.pessoas?.nome ?? "—").split(" ")[0]}</b><small>{h(x.primeiro)}{h(x.ultimo) !== h(x.primeiro) ? `–${h(x.ultimo)}` : ""}</small></span>;
                })}
              </div>
            ) : <p className="sinal-vazio">Ninguém entrou ainda hoje.</p>}
          </section>
        )}

        <section className={`painel ${veProd && veFin ? "c12" : "c5"}`}>
          <div className="painel-topo"><div><h2>Atalhos</h2></div></div>
          <div className="atalhos" style={veProd && veFin ? { gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" } : undefined}>
            {atalhos.filter((a) => a.ok).map((a) => <Link key={a.href} className="atalho" href={a.href}><span className="ico"><Icone nome={a.icone} /></span>{a.rotulo}</Link>)}
          </div>
        </section>
      </div>
    </>
  );
}

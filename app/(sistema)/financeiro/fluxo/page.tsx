import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Icone } from "@/components/icone";
import { BotoesPdf } from "@/components/fluxo/botoes-pdf";
import { JanelaLancamento } from "@/components/fluxo/lancamento";
import {
  FORMAS_PAGAMENTO, dataPorExtenso, diaDaSemana, diasDeVenda, ehFimDeSemana, inicioDoMes, lerLinhas, lerVendas,
  mesDoLancamento, mesPorExtenso, nomeDoDia, rotuloPeriodo, somar, somarDias, totaisFluxo, vendasPorDia, type DadosFluxo, type LinhaValor,
} from "@/lib/fluxo";
import { reais } from "@/lib/formatos";
import { salvarFluxo } from "../acoes";

export const metadata = { title: "Fluxo financeiro" };

type Dia = { data: string; vendas: unknown; saldos: unknown; a_receber: unknown; observacao: string | null; atualizado_em: string; quem: { nome: string } | null };
type Mes = { mes: string; vendas: unknown; vendedoras: unknown; contas_a_pagar: number; contas_pagas: number };
type DiaCurto = { data: string; vendas: unknown };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const CORES = ["#2f322d", "#00ced1", "#14b8a9", "#8fe3e4", "#f2d98a", "#c9d3d0", "#6a706b"];
const MARCADORES = ["", "ceu", "areia", "rosa", "escuro"];
const ABREV: Record<string, string> = { segunda: "seg", terça: "ter", quarta: "qua", quinta: "qui", sexta: "sex", sábado: "sáb", domingo: "dom" };
const curto = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/** Dia útil anterior/seguinte (pula sábado e domingo). */
function diaUtil(data: string, passo: 1 | -1) {
  let d = somarDias(data, passo);
  while (ehFimDeSemana(d)) d = somarDias(d, passo);
  return d;
}

function Valor({ v }: { v: number }) {
  const [inteiro, centavos] = reais(v).replace("R$", "").trim().split(",");
  return <><small>R$</small>{inteiro}{centavos !== undefined && <small style={{ verticalAlign: "baseline", marginLeft: 1 }}>,{centavos}</small>}</>;
}

function Editar({ href, rotulo }: { href: string; rotulo: string }) {
  return <Link className="fx-editar" href={href} scroll={false} aria-label={rotulo} title={rotulo}><Icone nome="lapis" /></Link>;
}

function Rosca({ linhas, total }: { linhas: LinhaValor[]; total: number }) {
  const r = 78, c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Vendas do mês por forma de pagamento">
      <circle cx="100" cy="100" r={r} fill="none" stroke="#e7ecea" strokeWidth="24" />
      {total > 0 && linhas.map((l, i) => {
        const fatia = (Math.max(0, l.valor) / total) * c;
        const el = (
          <circle key={l.nome} cx="100" cy="100" r={r} fill="none" stroke={CORES[i % CORES.length]} strokeWidth="24"
            strokeDasharray={`${Math.max(0, fatia - 2)} ${c}`} strokeDashoffset={-acumulado} transform="rotate(-90 100 100)" />
        );
        acumulado += fatia;
        return el;
      })}
      <text x="100" y="98" textAnchor="middle" className="centro-v">{curto(total)}</text>
      <text x="100" y="118" textAnchor="middle" className="centro-r">no mês</text>
    </svg>
  );
}

function Medidor({ pagas, aPagar }: { pagas: number; aPagar: number }) {
  const total = pagas + aPagar;
  const p = total ? pagas / total : 0;
  const r = 100, comp = Math.PI * r;
  return (
    <svg viewBox="0 0 260 150" role="img" aria-label={`${pct(pagas, total)}% das contas do mês pagas`}>
      <path d="M30 130 A100 100 0 0 1 230 130" fill="none" stroke="#f2d98a" strokeWidth="22" strokeLinecap="round" />
      {p > 0 && <path d="M30 130 A100 100 0 0 1 230 130" fill="none" stroke="#2f322d" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${p * comp} ${comp}`} />}
      <text x="130" y="112" textAnchor="middle" className="v">{pct(pagas, total)}%</text>
      <text x="130" y="134" textAnchor="middle" className="r">das contas pagas</text>
    </svg>
  );
}

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<{ data?: string; salvo?: string }> }) {
  const sessao = await exigir("financeiro");
  const { data: pedida, salvo } = await searchParams;
  const hoje = hojeSP();
  let data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoje ? pedida : hoje;
  if (!pedida && ehFimDeSemana(data)) data = diaUtil(data, -1); // fim de semana: abre a sexta
  const fimDeSemana = ehFimDeSemana(data);
  const periodo = diasDeVenda(data);
  const mesRef = mesDoLancamento(data);
  const inicioCal = inicioDoMes(data);
  const fimCal = somarDias(inicioDoMes(somarDias(inicioCal, 32)), -1);
  const desde = [inicioCal, somarDias(data, -30)].sort()[0];

  const supabase = await supabaseServidor();
  const [{ data: diaR }, { data: mesR }, { data: anteriorR }, { data: periodoR }, { data: vendedorasR }] = await Promise.all([
    supabase.from("fluxo_dias").select("data, vendas, saldos, a_receber, observacao, atualizado_em, quem:pessoas!atualizado_por(nome)").eq("data", data).maybeSingle(),
    supabase.from("fluxo_meses").select("mes, vendas, vendedoras, contas_a_pagar, contas_pagas").eq("mes", mesRef).maybeSingle(),
    supabase.from("fluxo_dias").select("data, vendas, saldos, a_receber").lt("data", data).order("data", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fluxo_dias").select("data, vendas").gte("data", desde).lte("data", fimCal).order("data"),
    supabase.from("pessoas").select("nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome"),
  ]);
  const dia = diaR as unknown as Dia | null;
  const mes = mesR as unknown as Mes | null;
  const anterior = anteriorR as unknown as (DiaCurto & { saldos: unknown; a_receber: unknown }) | null;
  const lancamentos = (periodoR ?? []) as DiaCurto[];

  /* ---------- dados do dia (só o que foi salvo; vai para o PDF) ---------- */
  const salvoDados: DadosFluxo | null = dia ? {
    data, diasVenda: periodo,
    vendasDia: lerVendas(dia.vendas, periodo.length),
    saldos: lerLinhas(dia.saldos), aReceber: lerLinhas(dia.a_receber), observacao: dia.observacao ?? "",
    vendasMes: lerLinhas(mes?.vendas), vendedoras: lerLinhas(mes?.vendedoras),
    contasAPagar: Number(mes?.contas_a_pagar ?? 0), contasPagas: Number(mes?.contas_pagas ?? 0),
  } : null;

  /* ---------- o que abre na janela de lançamento ---------- */
  const zerado = (l: LinhaValor[]) => l.map((x) => ({ nome: x.nome, valor: 0 }));
  const nomesVendas = anterior ? lerLinhas(anterior.vendas).map((v) => v.nome) : [];
  const formas = [...new Set([...FORMAS_PAGAMENTO, ...nomesVendas])];
  const paraJanela: DadosFluxo = salvoDados ? {
    ...salvoDados,
    vendasDia: [...salvoDados.vendasDia, ...formas.filter((f) => !salvoDados.vendasDia.some((v) => v.nome === f)).map((nome) => ({ nome, valor: 0, dias: periodo.map(() => 0) }))],
  } : {
    data, diasVenda: periodo,
    vendasDia: formas.map((nome) => ({ nome, valor: 0, dias: periodo.map(() => 0) })),
    saldos: zerado(lerLinhas(anterior?.saldos)),
    aReceber: lerLinhas(anterior?.a_receber),
    observacao: "",
    vendasMes: lerLinhas(mes?.vendas),
    vendedoras: mes ? lerLinhas(mes.vendedoras) : (vendedorasR ?? []).map((v) => ({ nome: v.apelido || v.nome, valor: 0 })),
    contasAPagar: Number(mes?.contas_a_pagar ?? 0),
    contasPagas: Number(mes?.contas_pagas ?? 0),
  };

  /* ---------- gráfico: últimos 14 dias de venda (sem domingo) ---------- */
  const porDiaDeVenda = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.data > data) continue;
    const dias = diasDeVenda(l.data);
    if (!dias.length) continue;
    vendasPorDia({ diasVenda: dias, vendasDia: lerVendas(l.vendas, dias.length) }).forEach(({ dia: d, valor }) => porDiaDeVenda.set(d, valor));
  }
  const ultimoDiaVenda = periodo[periodo.length - 1] ?? somarDias(data, -1);
  const barras: { dia: string; valor: number | null }[] = [];
  for (let d = ultimoDiaVenda; barras.length < 14; d = somarDias(d, -1)) {
    if (diaDaSemana(d) === 0) continue;
    barras.unshift({ dia: d, valor: porDiaDeVenda.has(d) ? porDiaDeVenda.get(d)! : null });
  }
  const maiorBarra = Math.max(0, ...barras.map((b) => b.valor ?? 0));
  const totalBarras = barras.reduce((t, b) => t + (b.valor ?? 0), 0);

  /* ---------- calendário do mês ---------- */
  const lancados = new Set(lancamentos.map((l) => l.data));
  const diasCal: string[] = [];
  for (let d = inicioCal; d <= fimCal; d = somarDias(d, 1)) diasCal.push(d);

  const anteriorUtil = diaUtil(data, -1);
  const seguinteUtil = diaUtil(data, 1);
  const podeLancar = sessao.pode("financeiro", dia ? "editar" : "criar") && !fimDeSemana;
  const base = `/financeiro/fluxo?data=${data}`;
  const lancar = (secao = "1") => `${base}&lancar=${secao}`;
  const t = salvoDados ? totaisFluxo(salvoDados) : null;
  const saldoAnterior = anterior ? somar(lerLinhas(anterior.saldos)) : null;
  const saldosAnteriores = new Map(lerLinhas(anterior?.saldos).map((l) => [l.nome, l.valor]));

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Fluxo financeiro</h1>
          <div className="fx-navegador">
            <Link className="fx-seta" href={`/financeiro/fluxo?data=${anteriorUtil}`} aria-label="Dia anterior"><Icone nome="esquerda" /></Link>
            <span className="dia">{dataPorExtenso(data)}</span>
            <Link className="fx-seta" href={`/financeiro/fluxo?data=${seguinteUtil}`} aria-label="Dia seguinte" aria-disabled={seguinteUtil > hoje}><Icone nome="direita" /></Link>
            {!fimDeSemana && (dia
              ? <span className="selo ok"><i />Lançado{dia.quem ? ` por ${dia.quem.nome.split(" ")[0]}` : ""} às {new Date(dia.atualizado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</span>
              : <span className="selo pendente"><i />Ainda não lançado</span>)}
          </div>
        </div>
        <div className="acoes">
          <BotoesPdf dados={salvoDados} />
          {podeLancar && <Link className="botao" href={lancar()} scroll={false}><Icone nome={dia ? "lapis" : "mais"} />{dia ? "Editar lançamento" : "Lançar dia"}</Link>}
        </div>
      </header>

      {salvo && dia && <p className="aviso ok" role="status"><Icone nome="certo" />Lançamento salvo. O PDF já sai com os valores novos.</p>}

      {fimDeSemana ? (
        <section className="painel fx-vazio">
          <span className="marcador areia"><Icone nome="calendario" tamanho={24} /></span>
          <h2>{nomeDoDia(data) === "sábado" ? "Sábado" : "Domingo"} não tem lançamento</h2>
          <p>As vendas de sexta e de sábado entram juntas no lançamento de segunda-feira.</p>
          {diaUtil(data, 1) <= hoje && <Link className="botao" href={`/financeiro/fluxo?data=${diaUtil(data, 1)}`}>Abrir segunda-feira</Link>}
        </section>
      ) : !salvoDados || !t ? (
        <section className="painel fx-vazio">
          <span className="marcador areia"><Icone nome="financeiro" tamanho={24} /></span>
          <h2>Este dia ainda não foi lançado</h2>
          <p>Lance {rotuloPeriodo(periodo).toLowerCase()}, os saldos dos bancos e o que tem a receber. Os nomes das contas e das vendedoras do último dia já vêm preenchidos.</p>
          {podeLancar && <Link className="botao" href={lancar()} scroll={false}><Icone nome="mais" />Lançar dia</Link>}
        </section>
      ) : (
        <>
          <section className="kpis fx-kpis" aria-label="Resumo">
            <div className="kpi destaque">
              <div className="kpi-topo"><span>Vendas no mês</span><span className="seta"><Icone nome="diagonal" tamanho={16} /></span></div>
              <p className="kpi-valor"><Valor v={t.vendasMes} /></p>
              <p className="kpi-nota"><b>até {ultimoDiaVenda.slice(8, 10)}/{ultimoDiaVenda.slice(5, 7)}</b>acumulado de {mesPorExtenso(mesRef).split(" ")[0]}</p>
            </div>
            <div className="kpi">
              <div className="kpi-topo"><span>{rotuloPeriodo(periodo)}</span><span className="seta"><Icone nome="calendario" tamanho={16} /></span></div>
              <p className="kpi-valor"><Valor v={t.vendasDia} /></p>
              <p className="kpi-nota">{periodo.length > 1
                ? vendasPorDia(salvoDados).map((x) => `${ABREV[nomeDoDia(x.dia)]} ${reais(x.valor)}`).join(" · ")
                : `${nomeDoDia(periodo[0])}, ${periodo[0].slice(8, 10)}/${periodo[0].slice(5, 7)}`}</p>
            </div>
            <div className="kpi">
              <div className="kpi-topo"><span>Saldo em conta</span><span className="seta"><Icone nome="banco" tamanho={16} /></span></div>
              <p className="kpi-valor"><Valor v={t.saldo} /></p>
              <p className="kpi-nota">{saldoAnterior === null ? "somando todas as contas" : (
                <><span className={t.saldo >= saldoAnterior ? "sobe" : "desce"}>{t.saldo >= saldoAnterior ? "▲" : "▼"} {reais(Math.abs(t.saldo - saldoAnterior))}</span> desde o último lançamento</>
              )}</p>
            </div>
            <div className="kpi">
              <div className="kpi-topo"><span>Saldo após as contas</span><span className="seta"><Icone nome="cifrao" tamanho={16} /></span></div>
              <p className="kpi-valor"><Valor v={t.sobra} /></p>
              <p className="kpi-nota">saldo em conta − contas a pagar</p>
            </div>
          </section>

          <div className="fx-grade">
            <section className="painel c7">
              <div className="painel-topo">
                <div>
                  <h2>Vendas dia a dia</h2>
                  <div className="legenda"><span><i style={{ background: "var(--verde-900)" }} />Melhor dia</span><span><i style={{ background: "var(--marca)" }} />Este lançamento</span><span><i style={{ background: "#8fe3e4" }} />Outros dias</span></div>
                </div>
                <div className="fx-total"><strong>{reais(totalBarras)}</strong><span>últimos 14 dias de venda</span></div>
              </div>
              {maiorBarra > 0 ? (
                <>
                  <div className="fx-barras">
                    {barras.map((b) => {
                      const atual = periodo.includes(b.dia);
                      const maior = b.valor === maiorBarra && b.valor > 0;
                      const cls = b.valor === null ? "vazia" : maior ? "maior" : atual ? "atual" : "";
                      return (
                        <div key={b.dia} className={`fx-barra ${cls}`} title={`${nomeDoDia(b.dia)} ${b.dia.slice(8, 10)}/${b.dia.slice(5, 7)}: ${b.valor === null ? "sem lançamento" : reais(b.valor)}`}>
                          {b.valor !== null && <i style={{ height: `${Math.max(4, (b.valor / maiorBarra) * 100)}%` }} />}
                          {(atual || maior) && b.valor !== null && <span className="balao" style={{ bottom: `${Math.max(4, (b.valor / maiorBarra) * 100)}%` }}>{curto(b.valor)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="fx-eixo">{barras.map((b) => <span key={b.dia}><small>{ABREV[nomeDoDia(b.dia)]}</small>{b.dia.slice(8, 10)}</span>)}</div>
                </>
              ) : <p className="fx-sem-grafico">Ainda não há vendas lançadas nos últimos dias.</p>}
            </section>

            <section className="painel c5">
              <div className="painel-topo">
                <div><h2>Formas de pagamento</h2><p>Acumulado do mês</p></div>
                {podeLancar && <Editar href={lancar("b-vendas")} rotulo="Editar vendas" />}
              </div>
              {salvoDados.vendasMes.length ? (
                <div className="fx-rosca">
                  <Rosca linhas={salvoDados.vendasMes} total={t.vendasMes} />
                  <div className="fx-formas">
                    {salvoDados.vendasMes.map((l, i) => (
                      <div className="fx-forma" key={l.nome}>
                        <i style={{ background: CORES[i % CORES.length] }} />
                        <span>{l.nome}<small>{pct(l.valor, t.vendasMes)}% do mês</small></span>
                        <b>{reais(l.valor)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="fx-sem-grafico">O acumulado do mês não foi informado.</p>}
            </section>

            <section className="painel c4">
              <div className="painel-topo">
                <div><h2>Saldo nos bancos</h2><p>{anterior ? "Comparado com o último lançamento" : "Saldo de cada conta"}</p></div>
                {podeLancar && <Editar href={lancar("b-bancos")} rotulo="Editar saldos" />}
              </div>
              <ul className="fx-lista">
                {salvoDados.saldos.map((l, i) => {
                  const antes = saldosAnteriores.get(l.nome);
                  const dif = antes === undefined ? null : l.valor - antes;
                  return (
                    <li key={l.nome}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span className={`marcador ${MARCADORES[i % MARCADORES.length]}`}>{iniciais(l.nome)}</span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</b></span>
                      <span className="fx-valor">{reais(l.valor)}
                        {dif !== null && <small className={dif > 0 ? "sobe" : dif < 0 ? "desce" : "igual"}>{dif > 0 ? "+" : dif < 0 ? "−" : ""}{dif === 0 ? "sem mudança" : reais(Math.abs(dif))}</small>}
                      </span>
                    </li>
                  );
                })}
                {!salvoDados.saldos.length && <li>Nenhuma conta informada.</li>}
              </ul>
              <div className="fx-rodape"><span>Total</span><span>{reais(t.saldo)}</span></div>
            </section>

            <section className="painel c4">
              <div className="painel-topo">
                <div><h2>Contas do mês</h2><p style={{ textTransform: "capitalize" }}>{mesPorExtenso(mesRef)}</p></div>
                {podeLancar && <Editar href={lancar("b-contas-mes")} rotulo="Editar contas do mês" />}
              </div>
              <div className="fx-medidor"><Medidor pagas={t.contasPagas} aPagar={t.contasAPagar} /></div>
              <div className="fx-duas">
                <div><span><i style={{ background: "var(--verde-900)" }} />Pagas</span><b>{reais(t.contasPagas)}</b></div>
                <div><span><i style={{ background: "#f2d98a" }} />A pagar</span><b>{reais(t.contasAPagar)}</b></div>
              </div>
            </section>

            <section className="painel c4">
              <div className="painel-topo">
                <div><h2>A receber</h2><p>Valores que ainda vão entrar</p></div>
                {podeLancar && <Editar href={lancar("b-receber")} rotulo="Editar a receber" />}
              </div>
              <ul className="fx-lista">
                {salvoDados.aReceber.map((l, i) => (
                  <li key={l.nome + i}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span className={`marcador ${MARCADORES[(i + 1) % MARCADORES.length]}`}><Icone nome="entrada" /></span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</b></span>
                    <span className="fx-valor">{reais(l.valor)}</span>
                  </li>
                ))}
                {!salvoDados.aReceber.length && <li>Nada a receber informado.</li>}
              </ul>
              <div className="fx-rodape"><span>Total</span><span>{reais(t.aReceber)}</span></div>
            </section>

            <section className="painel c12">
              <div className="painel-topo">
                <div><h2>Equipe no mês</h2><p>Vendas de cada vendedora até {nomeDoDia(ultimoDiaVenda)}</p></div>
                {podeLancar && <Editar href={lancar("b-equipe")} rotulo="Editar equipe" />}
              </div>
              <ul className="fx-lista">
                {[...salvoDados.vendedoras].sort((a, b) => b.valor - a.valor).map((l, i, todas) => (
                  <li key={l.nome}>
                    <div className="fx-equipe">
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span className={`marcador ${i === 0 ? "escuro" : ""}`}>{i + 1}º</span><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</b></span>
                      <span className={`fx-trilho ${i === 0 ? "primeira" : ""}`}><i style={{ width: `${Math.max(2, (l.valor / Math.max(1, todas[0].valor)) * 100)}%` }} /></span>
                      <span className="fx-valor">{reais(l.valor)}<small style={{ color: "var(--suave)" }}>{pct(l.valor, t.vendedoras)}% da equipe</small></span>
                    </div>
                  </li>
                ))}
                {!salvoDados.vendedoras.length && <li>Nenhuma vendedora informada.</li>}
              </ul>
            </section>

          </div>
        </>
      )}

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2 style={{ textTransform: "capitalize" }}>{mesPorExtenso(data)}</h2><p>Verde: dia lançado. Laranja: dia útil sem lançamento. Sábado e domingo não têm lançamento.</p></div></div>
        <div className="fx-dias">
          {diasCal.map((d) => {
            const fds = ehFimDeSemana(d);
            const futuro = d > hoje;
            const cls = ["fx-dia", d === data ? "atual" : "", fds ? "fds" : "", futuro ? "futuro" : "", !fds && !futuro ? (lancados.has(d) ? "lancado" : "faltou") : ""].join(" ");
            const miolo = <><small>{ABREV[nomeDoDia(d)]}</small><b>{Number(d.slice(8, 10))}</b><i /></>;
            return fds || futuro
              ? <span key={d} className={cls} aria-hidden={futuro}>{miolo}</span>
              : <Link key={d} className={cls} href={`/financeiro/fluxo?data=${d}`} aria-label={`${dataPorExtenso(d)}${lancados.has(d) ? ", lançado" : ", sem lançamento"}`}>{miolo}</Link>;
          })}
        </div>
      </section>

      {podeLancar && (
        <Suspense>
          <JanelaLancamento key={data + (dia?.atualizado_em ?? "")} inicial={paraJanela} novo={!dia} salvar={salvarFluxo} />
        </Suspense>
      )}
    </>
  );
}

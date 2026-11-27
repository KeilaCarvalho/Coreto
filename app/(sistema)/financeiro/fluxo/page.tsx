import { VendasEFormas } from "@/components/fluxo/vendas-formas";
import { corBanco } from "@/lib/bancos";
import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Icone } from "@/components/icone";
import { BotoesPdf } from "@/components/fluxo/botoes-pdf";
import { JanelaLancamento, type HeraFluxo } from "@/components/fluxo/lancamento";
import { agruparFormas, somarPares, type DiaHera } from "@/lib/hera";
import {
  FORMAS_PAGAMENTO, dataPorExtenso, diaDaSemana, diasDeVenda, inicioDoMes, lerLinhas, lerVendas,
  mesDoLancamento, mesPorExtenso, nomeDoDia, rotuloPeriodo, semLancamento, somar, somarDias, totaisFluxo, vendasAoVivo, vendasPorDia, type DadosFluxo, type LinhaValor,
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

/** Dia anterior/seguinte com lançamento (pula domingo; antes da virada, também o sábado). */
function diaUtil(data: string, passo: 1 | -1) {
  let d = somarDias(data, passo);
  while (semLancamento(d)) d = somarDias(d, passo);
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
  if (!pedida && semLancamento(data)) data = diaUtil(data, -1); // dia sem lançamento: abre o anterior
  const fimDeSemana = semLancamento(data);
  const aoVivo = vendasAoVivo(data);
  const periodo = diasDeVenda(data);
  const mesRef = mesDoLancamento(data);        // vendas e equipe: mês do último dia de venda
  const mesContasRef = inicioDoMes(data);       // contas: mês do dia do lançamento
  const inicioCal = inicioDoMes(data);
  const fimCal = somarDias(inicioDoMes(somarDias(inicioCal, 32)), -1);
  const desde = [inicioCal, somarDias(data, -30)].sort()[0];

  const supabase = await supabaseServidor();
  const [{ data: diaR }, { data: mesR }, { data: anteriorR }, { data: periodoR }, { data: vendedorasR }, { data: configR }, { data: contasR }, { data: heraR }] = await Promise.all([
    supabase.from("fluxo_dias").select("data, vendas, saldos, a_receber, observacao, atualizado_em, quem:pessoas!atualizado_por(nome)").eq("data", data).maybeSingle(),
    supabase.from("fluxo_meses").select("mes, vendas, vendedoras, contas_a_pagar, contas_pagas").eq("mes", mesRef).maybeSingle(),
    supabase.from("fluxo_dias").select("data, vendas, saldos, a_receber").lt("data", data).neq("saldos", "[]").order("data", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fluxo_dias").select("data, vendas, saldos").gte("data", desde).lte("data", fimCal).order("data"),
    supabase.from("pessoas").select("nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome"),
    supabase.from("fluxo_config").select("contas_padrao, formas_padrao").maybeSingle(),
    supabase.from("fluxo_meses").select("contas_a_pagar, contas_pagas").eq("mes", mesContasRef).maybeSingle(),
    supabase.from("hera_dias").select("data, loja, faturamento, caixa, vendedoras, atualizado_em").gte("data", mesRef).lte("data", periodo[periodo.length - 1] ?? data),
  ]);
  // HeraDash: vendas de cada dia do período e o acumulado do mês até o último dia de venda.
  const heraDias = (heraR ?? []) as DiaHera[];
  const heraFluxo: HeraFluxo | null = periodo.length && periodo.every((d) => heraDias.some((h) => h.data === d)) ? {
    dias: periodo.map((d) => agruparFormas(somarPares(heraDias.filter((h) => h.data === d).map((h) => h.caixa))).map((f) => ({ nome: f.nome, valor: f.valor }))),
    mes: agruparFormas(somarPares(heraDias.map((h) => h.caixa))).map((f) => ({ nome: f.nome, valor: f.valor })),
    vendedoras: somarPares(heraDias.map((h) => h.vendedoras)).map((v) => ({ nome: v.x, valor: Math.round(v.y * 100) / 100 })),
    atualizado: heraDias.map((h) => h.atualizado_em).sort().at(-1) ?? null,
  } : null;
  const contasMes = contasR as { contas_a_pagar: number; contas_pagas: number } | null;
  const brutoPadrao: unknown = (configR as { contas_padrao?: unknown } | null)?.contas_padrao;
  const contasPadrao: string[] = [];
  if (Array.isArray(brutoPadrao)) for (const n of brutoPadrao) if (typeof n === "string" && n.trim()) contasPadrao.push(n);
  const dia = diaR as unknown as Dia | null;
  const mes = mesR as unknown as Mes | null;
  const anterior = anteriorR as unknown as (DiaCurto & { saldos: unknown; a_receber: unknown }) | null;
  const lancamentos = (periodoR ?? []) as (DiaCurto & { saldos: unknown })[];
  // Com as vendas ao vivo, o dia só está "lançado" quando os bancos foram preenchidos.
  const completo = !!dia && lerLinhas(dia.saldos).length > 0;

  /* ---------- dados do dia (só o que foi salvo; vai para o PDF) ---------- */
  const salvoDados: DadosFluxo | null = dia ? {
    data, diasVenda: periodo,
    vendasDia: lerVendas(dia.vendas, periodo.length),
    saldos: lerLinhas(dia.saldos), aReceber: lerLinhas(dia.a_receber), observacao: dia.observacao ?? "",
    vendasMes: lerLinhas(mes?.vendas), vendedoras: lerLinhas(mes?.vendedoras),
    contasAPagar: Number(contasMes?.contas_a_pagar ?? 0), contasPagas: Number(contasMes?.contas_pagas ?? 0),
  } : null;

  /* ---------- o que abre na janela de lançamento ---------- */
  const zerado = (l: LinhaValor[]) => l.map((x) => ({ nome: x.nome, valor: 0 }));
  // Contas de banco: as guardadas como padrão sempre aparecem, mesmo com saldo zerado.
  const comPadrao = (l: LinhaValor[]): LinhaValor[] => [
    ...contasPadrao.map((nome): LinhaValor => l.find((x) => x.nome === nome) ?? { nome, valor: 0 }),
    ...l.filter((x) => !contasPadrao.includes(x.nome)),
  ];
  const nomesVendas = anterior ? lerLinhas(anterior.vendas).map((v) => v.nome) : [];
  // Formas de pagamento: as que ficaram no último lançamento (guardadas ao salvar); sem isso, a lista padrão.
  const brutoFormas: unknown = (configR as { formas_padrao?: unknown } | null)?.formas_padrao;
  const formasGuardadas = Array.isArray(brutoFormas) ? brutoFormas.filter((n): n is string => typeof n === "string" && !!n.trim()) : [];
  // Com a lista guardada, só ela vale (nome antigo de um dia anterior não volta a aparecer).
  const formas = formasGuardadas.length ? [...new Set(formasGuardadas)] : [...new Set([...FORMAS_PAGAMENTO, ...nomesVendas])];
  // Sempre na mesma sequência guardada (a do último lançamento salvo).
  const posicao = (nome: string) => { const i = formas.indexOf(nome); return i < 0 ? 999 : i; };
  const ordemFormas = <T extends { nome: string }>(l: T[]) => [...l].sort((x, y) => posicao(x.nome) - posicao(y.nome));
  const paraJanela: DadosFluxo = salvoDados ? {
    ...salvoDados,
    // Dia só com as vendas do robô: bancos e a receber partem do último dia lançado.
    saldos: comPadrao(salvoDados.saldos.length ? salvoDados.saldos : zerado(lerLinhas(anterior?.saldos))),
    aReceber: salvoDados.aReceber.length || completo ? salvoDados.aReceber : lerLinhas(anterior?.a_receber),
    vendasDia: ordemFormas([...salvoDados.vendasDia, ...formas.filter((f) => !salvoDados.vendasDia.some((v) => v.nome === f)).map((nome) => ({ nome, valor: 0, dias: periodo.map(() => 0) }))]),
  } : {
    data, diasVenda: periodo,
    vendasDia: formas.map((nome) => ({ nome, valor: 0, dias: periodo.map(() => 0) })),
    saldos: comPadrao(zerado(lerLinhas(anterior?.saldos))),
    aReceber: lerLinhas(anterior?.a_receber),
    observacao: "",
    vendasMes: lerLinhas(mes?.vendas),
    vendedoras: mes ? lerLinhas(mes.vendedoras) : (vendedorasR ?? []).map((v) => ({ nome: v.apelido || v.nome, valor: 0 })),
    contasAPagar: Number(contasMes?.contas_a_pagar ?? 0),
    contasPagas: Number(contasMes?.contas_pagas ?? 0),
  };

  /* ---------- última vez que o robô puxou as vendas do HeraDash ---------- */
  const { data: sincR } = await supabase.from("hera_sincronizacoes").select("fim").eq("ok", true).order("inicio", { ascending: false }).limit(1).maybeSingle();
  const sincTexto = (() => {
    const fim = (sincR as { fim: string | null } | null)?.fim;
    if (!fim) return null;
    const dia = new Date(fim).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const hh = new Date(fim).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return `Atualizado ${dia === hojeSP ? "hoje" : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`} às ${hh}`;
  })();

  /* ---------- gráfico: últimos 14 dias de venda (sem domingo) ---------- */
  const porDiaDeVenda = new Map<string, number>();
  const formasPorDia: Record<string, LinhaValor[]> = {};
  for (const l of lancamentos) {
    if (l.data > data) continue;
    const dias = diasDeVenda(l.data);
    if (!dias.length) continue;
    const linhas = lerVendas(l.vendas, dias.length);
    vendasPorDia({ diasVenda: dias, vendasDia: linhas }).forEach(({ dia: d, valor }) => porDiaDeVenda.set(d, valor));
    dias.forEach((d, k) => { formasPorDia[d] = linhas.map((x) => ({ nome: x.nome, valor: Number(x.dias[k]) || 0 })).filter((x) => x.valor).sort((a, b) => b.valor - a.valor); });
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
  const lancados = new Set(lancamentos.filter((l) => lerLinhas(l.saldos).length > 0).map((l) => l.data));
  const soVendas = new Set(lancamentos.filter((l) => !lancados.has(l.data) && lerLinhas(l.vendas).length > 0).map((l) => l.data));
  const diasCal: string[] = [];
  for (let d = inicioCal; d <= fimCal; d = somarDias(d, 1)) diasCal.push(d);

  const anteriorUtil = diaUtil(data, -1);
  const seguinteUtil = diaUtil(data, 1);
  const podeLancar = sessao.pode("financeiro", dia ? "editar" : "criar") && !fimDeSemana;
  const base = `/financeiro/fluxo?data=${data}`;
  const lancar = (secao = "1") => `${base}&lancar=${secao}`;
  const t = salvoDados ? totaisFluxo(salvoDados) : null;
  const saldoAnterior = anterior ? somar(lerLinhas(anterior.saldos)) : null;

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Fluxo financeiro</h1>
          <div className="fx-navegador">
            <Link className="fx-seta" href={`/financeiro/fluxo?data=${anteriorUtil}`} aria-label="Dia anterior"><Icone nome="esquerda" /></Link>
            <span className="dia">{dataPorExtenso(data)}</span>
            <Link className="fx-seta" href={`/financeiro/fluxo?data=${seguinteUtil}`} aria-label="Dia seguinte" aria-disabled={seguinteUtil > hoje}><Icone nome="direita" /></Link>
            {!fimDeSemana && (dia && !completo
              ? <span className="selo pendente"><i />Vendas ao vivo · faltam os bancos</span>
              : dia
              ? <span className="selo ok"><i />Lançado{dia.quem ? ` por ${dia.quem.nome.split(" ")[0]}` : ""} às {new Date(dia.atualizado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</span>
              : <span className="selo pendente"><i />Ainda não lançado</span>)}
          </div>
        </div>
        <div className="acoes">
          <Link className="botao leve" href="/financeiro/fluxo/fechamento"><Icone nome="calendario" />Fechar mês</Link>
          <BotoesPdf dados={salvoDados} enviar={false} />
          {podeLancar && <Link className="botao" href={lancar()} scroll={false}><Icone nome={completo ? "lapis" : "mais"} />{completo ? "Editar lançamento" : dia ? "Lançar bancos" : "Lançar dia"}</Link>}
        </div>
      </header>

      {salvo && dia && <p className="aviso ok" role="status"><Icone nome="certo" />Lançamento salvo. O PDF já sai com os valores novos.</p>}

      {fimDeSemana ? (
        <section className="painel fx-vazio">
          <span className="marcador areia"><Icone nome="calendario" tamanho={24} /></span>
          <h2>{nomeDoDia(data) === "sábado" ? "Sábado" : "Domingo"} não tem lançamento</h2>
          <p>{aoVivo ? "A loja não abre no domingo." : "As vendas de sexta e de sábado entram juntas no lançamento de segunda-feira."}</p>
          {diaUtil(data, 1) <= hoje && <Link className="botao" href={`/financeiro/fluxo?data=${diaUtil(data, 1)}`}>Abrir segunda-feira</Link>}
        </section>
      ) : !salvoDados || !t ? (
        <section className="painel fx-vazio">
          <span className="marcador areia"><Icone nome="financeiro" tamanho={24} /></span>
          <h2>Este dia ainda não foi lançado</h2>
          <p>{aoVivo ? "As vendas do dia entram sozinhas pelo HeraDash assim que passam no caixa. Lance os saldos dos bancos e o que tem a receber." : `Lance ${rotuloPeriodo(periodo).toLowerCase()}, os saldos dos bancos e o que tem a receber. Os nomes das contas e das vendedoras do último dia já vêm preenchidos.`}</p>
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
              <p className="kpi-valor">{completo ? <Valor v={t.saldo} /> : "—"}</p>
              <p className="kpi-nota">{!completo ? "falta lançar os bancos" : saldoAnterior === null ? "somando todas as contas" : (
                <><span className={t.saldo >= saldoAnterior ? "sobe" : "desce"}>{t.saldo >= saldoAnterior ? "▲" : "▼"} {reais(Math.abs(t.saldo - saldoAnterior))}</span> desde o último lançamento</>
              )}</p>
            </div>
            <div className="kpi">
              <div className="kpi-topo"><span>Saldo após as contas</span><span className="seta"><Icone nome="cifrao" tamanho={16} /></span></div>
              <p className="kpi-valor">{completo ? <Valor v={t.sobra} /> : "—"}</p>
              <p className="kpi-nota">{completo ? "saldo em conta − contas a pagar" : "sai quando os bancos forem lançados"}</p>
            </div>
          </section>

          <div className="fx-grade">
            <VendasEFormas
              total={totalBarras}
              totalTexto={reais(totalBarras)}
              temBarras={maiorBarra > 0}
              inicial={[...barras].reverse().find((b) => periodo.includes(b.dia) && b.valor !== null)?.dia}
              barras={barras.map((b) => {
                const atual = periodo.includes(b.dia);
                const maior = b.valor === maiorBarra && (b.valor ?? 0) > 0;
                return {
                  dia: b.dia, valor: b.valor,
                  classe: b.valor === null ? "vazia" : maior ? "maior" : atual ? "atual" : "",
                  rotulo: ABREV[nomeDoDia(b.dia)], sub: b.dia.slice(8, 10),
                  titulo: `${nomeDoDia(b.dia).charAt(0).toUpperCase()}${nomeDoDia(b.dia).slice(1)}, ${b.dia.slice(8, 10)}/${b.dia.slice(5, 7)}`,
                };
              })}
              mes={salvoDados.vendasMes}
              totalMes={t.vendasMes}
              formasPorDia={formasPorDia}
              legenda={<div className="legenda"><span><i style={{ background: "var(--verde-900)" }} />Melhor dia</span><span><i style={{ background: "var(--marca)" }} />Este lançamento</span><span><i style={{ background: "#8fe3e4" }} />Outros dias</span></div>}
              editar={podeLancar ? <Editar href={lancar("b-vendas")} rotulo="Editar vendas" /> : undefined}
              atualizado={sincTexto}
            />

            <section className="painel c4">
              <div className="painel-topo">
                <div><h2>Saldo nos bancos</h2><p>Saldo de cada conta</p></div>
                {podeLancar && <Editar href={lancar("b-bancos")} rotulo="Editar saldos" />}
              </div>
              <ul className="fx-lista">
                {salvoDados.saldos.map((l) => {
                  const cor = corBanco(l.nome);
                  return (
                    <li key={l.nome}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span className="marcador banco" style={{ background: cor.fundo, color: cor.texto }}>{iniciais(l.nome)}</span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</b></span>
                      <span className="fx-valor">{reais(l.valor)}</span>
                    </li>
                  );
                })}
                {!salvoDados.saldos.length && <li>Nenhuma conta informada.</li>}
              </ul>
              <div className="fx-rodape"><span>Total</span><span>{reais(t.saldo)}</span></div>
            </section>

            <section className="painel c4">
              <div className="painel-topo">
                <div><h2>Contas do mês</h2><p><span>{mesPorExtenso(mesContasRef).charAt(0).toUpperCase() + mesPorExtenso(mesContasRef).slice(1)}</span> · <Link href="/financeiro/contas">vem do Conta Azul</Link></p></div>
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
        <div className="painel-topo"><div><h2>{mesPorExtenso(data).charAt(0).toUpperCase() + mesPorExtenso(data).slice(1)}</h2><p>Verde: dia lançado. Azul: vendas do HeraDash, faltam os bancos. Laranja: sem lançamento.</p></div></div>
        <div className="fx-dias">
          {diasCal.map((d) => {
            const fds = semLancamento(d);
            const futuro = d > hoje;
            const cls = ["fx-dia", d === data ? "atual" : "", fds ? "fds" : "", futuro ? "futuro" : "", !fds && !futuro ? (lancados.has(d) ? "lancado" : soVendas.has(d) ? "parcial" : "faltou") : ""].join(" ");
            const miolo = <><small>{ABREV[nomeDoDia(d)]}</small><b>{Number(d.slice(8, 10))}</b><i /></>;
            return fds || futuro
              ? <span key={d} className={cls} aria-hidden={futuro}>{miolo}</span>
              : <Link key={d} className={cls} href={`/financeiro/fluxo?data=${d}`} aria-label={`${dataPorExtenso(d)}${lancados.has(d) ? ", lançado" : soVendas.has(d) ? ", só vendas" : ", sem lançamento"}`}>{miolo}</Link>;
          })}
        </div>
      </section>

      {podeLancar && (
        <Suspense>
          <JanelaLancamento hera={heraFluxo} contasPadrao={contasPadrao} key={data + (dia?.atualizado_em ?? "")} inicial={paraJanela} novo={!dia} salvar={salvarFluxo} />
        </Suspense>
      )}
    </>
  );
}

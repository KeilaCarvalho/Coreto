import Link from "next/link";
import { Kpi } from "@/components/painel";
import { semanaDoMes, type ContaPagar } from "@/lib/contas-pagar";
import { dataCurta, reais } from "@/lib/formatos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANAS = ["1 a 7", "8 a 14", "15 a 21", "22 a 28", "29 a 31"];
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10000 ? 0 : 1 })}k` : String(Math.round(v)));
const mil = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : reais(v));

/** Análise de todas as contas (todos os bancos, meses passados e futuros). */
export function AnaliseContas({ contas, mes, hoje }: { contas: ContaPagar[]; mes: string; hoje: string }) {
  const [a, m] = mes.split("-").map(Number);
  const doMes = contas.filter((c) => c.vencimento.slice(0, 7) === mes.slice(0, 7));
  // Média: meses fechados antes do mês atual (os futuros ainda não estão completos).
  const anteriores = contas.filter((c) => c.vencimento < mes && c.vencimento < `${hoje.slice(0, 7)}-01`);
  const mesesAnt = new Set(anteriores.map((c) => c.vencimento.slice(0, 7))).size;
  const soma = (l: ContaPagar[], k: "valor" | "em_aberto" | "valor_pago" = "valor") => l.reduce((t, c) => t + Number(c[k]), 0);

  const semanas = SEMANAS.map((rotulo, i) => {
    const l = doMes.filter((c) => semanaDoMes(c.vencimento) === i);
    const media = mesesAnt ? soma(anteriores.filter((c) => semanaDoMes(c.vencimento) === i)) / mesesAnt : null;
    return { rotulo, total: soma(l), pago: soma(l, "valor_pago"), aberto: soma(l, "em_aberto"), media };
  });
  const maxSem = Math.max(1, ...semanas.map((s) => Math.max(s.total, s.media ?? 0)));
  const maior = semanas.reduce((x, s) => (s.total > x.total ? s : x), semanas[0]);
  const semanaHoje = hoje.slice(0, 7) === mes.slice(0, 7) ? semanaDoMes(hoje) : -1;

  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const primeiro = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const porDia = Array.from({ length: diasNoMes }, (_, i) => soma(doMes.filter((c) => Number(c.vencimento.slice(8, 10)) === i + 1)));
  const maxDia = Math.max(1, ...porDia);

  const categorias = [...doMes.reduce((mapa, c) => mapa.set(c.categoria ?? "Sem categoria", (mapa.get(c.categoria ?? "Sem categoria") ?? 0) + Number(c.valor)), new Map<string, number>())]
    .sort((x, y) => y[1] - x[1]);
  const maxCat = Math.max(1, ...categorias.map((c) => c[1]));

  const meses = [...contas.reduce((mapa, c) => {
    const k = c.vencimento.slice(0, 7);
    const v = mapa.get(k) ?? { pago: 0, aberto: 0 };
    v.pago += Number(c.valor_pago); v.aberto += Number(c.em_aberto);
    return mapa.set(k, v);
  }, new Map<string, { pago: number; aberto: number }>())].sort((x, y) => x[0].localeCompare(y[0]));
  const maxMes = Math.max(1, ...meses.map(([, v]) => v.pago + v.aberto));
  const futuro = contas.filter((c) => c.vencimento >= new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10));
  const anterior = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
  const seguinte = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);

  return (
    <>
      <div className="cp-mes">
        <Link className="botao leve pequeno" href={`?aba=analise&mes=${anterior}`} aria-label="Mês anterior">‹</Link>
        <strong>{MESES[m - 1]} {a}</strong>
        <Link className="botao leve pequeno" href={`?aba=analise&mes=${seguinte}`} aria-label="Próximo mês">›</Link>
      </div>

      <div className="kpis fx-kpis fx-fechamento">
        <Kpi destaque titulo="Total do mês" valor={reais(soma(doMes))} nota={`${doMes.length} contas · pagas + a pagar`} />
        <Kpi titulo="Já saiu (pago)" valor={reais(soma(doMes, "valor_pago"))} nota={`${doMes.filter((c) => Number(c.em_aberto) === 0).length} contas quitadas`} />
        <Kpi titulo="Ainda a pagar" valor={reais(soma(doMes, "em_aberto"))} nota={`${doMes.filter((c) => Number(c.em_aberto) > 0).length} contas`} />
        <Kpi titulo="Meses seguintes" valor={reais(soma(futuro, "em_aberto"))} nota={`${futuro.length} contas já lançadas`} />
      </div>

      <div className="painel-inicio">
        <section className="painel col-7">
          <div className="painel-topo">
            <div><h2>Contas por semana do mês</h2><p>{doMes.length ? `A semana mais pesada é a de ${maior.rotulo}.` : "Nenhuma conta neste mês."}{mesesAnt ? ` A marca mostra a média de ${mesesAnt} ${mesesAnt === 1 ? "mês anterior" : "meses anteriores"}.` : ""}</p></div>
            <div className="legenda"><span><i style={{ background: "var(--marca)" }} />Pago</span><span><i style={{ background: "#bcd9ef" }} />Em aberto</span></div>
          </div>
          <div className="cp-semanas">
            {semanas.map((s, i) => (
              <div key={s.rotulo} className={`cp-sem${i === semanaHoje ? " atual" : ""}`}>
                <span className="cp-sem-valor">{s.total ? mil(s.total) : "—"}</span>
                <div className="cp-sem-trilho">
                  {s.media != null && s.media > 0 && <em style={{ bottom: `${(s.media / maxSem) * 100}%` }} title={`Média: ${reais(s.media)}`} />}
                  <i className="aberto" style={{ height: `${(s.aberto / maxSem) * 100}%` }} />
                  <i className="pago" style={{ height: `${(s.pago / maxSem) * 100}%` }} />
                </div>
                <span className="cp-sem-rotulo">dia {s.rotulo}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="painel col-5">
          <div className="painel-topo"><div><h2>Calendário de vencimentos</h2><p>Quanto mais escuro, mais sai no dia.</p></div></div>
          <div className="cp-cal">
            {DIAS.map((d) => <span key={d} className="cp-cal-dia">{d}</span>)}
            {Array.from({ length: primeiro }, (_, i) => <span key={`v${i}`} />)}
            {porDia.map((v, i) => {
              const dia = `${mes.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
              const nivel = v ? Math.min(4, Math.ceil((v / maxDia) * 4)) : 0;
              return (
                <span key={dia} className={`cp-cal-cel n${nivel}${dia === hoje ? " hoje" : ""}`} title={v ? `${dataCurta(dia)}: ${reais(v)}` : undefined}>
                  <b>{i + 1}</b>{v > 0 && <small>{curto(v)}</small>}
                </span>
              );
            })}
          </div>
        </section>

        <section className="painel col-5">
          <div className="painel-topo"><div><h2>Por categoria</h2><p>Total do mês, todos os bancos.</p></div></div>
          {categorias.length ? (
            <ul className="cp-cats">
              {categorias.map(([nome, v]) => (
                <li key={nome}><span>{nome}</span><b>{reais(v)}</b><i style={{ width: `${(v / maxCat) * 100}%` }} /></li>
              ))}
            </ul>
          ) : <p className="painel-corpo mini">Nenhuma conta neste mês.</p>}
        </section>

        <section className="painel col-7">
          <div className="painel-topo"><div><h2>Contas mês a mês</h2><p>Pelo vencimento: a parte cheia já foi paga, a clara ainda vai sair. Clique no mês para ver os detalhes.</p></div></div>
          {meses.length ? (
            <div className="cp-meses">
              {meses.map(([k, v]) => {
                const [ka, km] = k.split("-").map(Number);
                return (
                  <Link key={k} href={`?aba=analise&mes=${k}-01`} className={`cp-mes-barra${k === mes.slice(0, 7) ? " atual" : ""}${k > hoje.slice(0, 7) ? " futuro" : ""}`} title={`${MESES[km - 1]} ${ka}: ${reais(v.pago + v.aberto)}`}>
                    <span className="cp-sem-valor">{curto(v.pago + v.aberto)}</span>
                    <span className="cp-sem-trilho">
                      <i className="aberto" style={{ height: `${(v.aberto / maxMes) * 100}%` }} />
                      <i className="pago" style={{ height: `${(v.pago / maxMes) * 100}%` }} />
                    </span>
                    <span className="cp-sem-rotulo">{MESES[km - 1].slice(0, 3)}/{String(ka).slice(2)}</span>
                  </Link>
                );
              })}
            </div>
          ) : <p className="painel-corpo mini">Nenhuma conta importada.</p>}
        </section>
      </div>
    </>
  );
}

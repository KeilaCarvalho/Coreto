import Link from "next/link";
import { Kpi } from "@/components/painel";
import { bancoCobrado, faltaNota, semanaDoMes, type ContaPagar } from "@/lib/contas-pagar";
import { dataCurta, reais } from "@/lib/formatos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANAS = ["1 a 7", "8 a 14", "15 a 21", "22 a 28", "29 a 31"];
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10000 ? 0 : 1 })}k` : String(Math.round(v)));
const mil = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : reais(v));

/** Análise das saídas do mês: semanas do mês, calendário, categorias e notas que faltam pedir. */
export function AnaliseContas({ contas, mes, hoje }: { contas: ContaPagar[]; mes: string; hoje: string }) {
  const [a, m] = mes.split("-").map(Number);
  const doMes = contas.filter((c) => c.vencimento.slice(0, 7) === mes.slice(0, 7));
  const anteriores = contas.filter((c) => c.vencimento < mes);
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

  const semNota = contas.filter((c) => c.vencimento <= `${mes.slice(0, 7)}-31` && faltaNota(c)).sort((x, y) => x.vencimento.localeCompare(y.vencimento));
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
        <Kpi destaque titulo="Saídas do mês" valor={reais(soma(doMes))} nota={`${doMes.length} contas · todos os bancos`} />
        <Kpi titulo="Já pago" valor={reais(soma(doMes, "valor_pago"))} nota={`${doMes.filter((c) => Number(c.em_aberto) === 0).length} contas quitadas`} />
        <Kpi titulo="Em aberto" valor={reais(soma(doMes, "em_aberto"))} nota={`${doMes.filter((c) => Number(c.em_aberto) > 0).length} contas`} />
        <Kpi titulo="Falta nota fiscal" valor={String(semNota.length)} nota={semNota.length ? `${reais(soma(semNota))} sem nota` : "nada para pedir"} />
      </div>

      <div className="painel-inicio">
        <section className="painel col-7">
          <div className="painel-topo">
            <div><h2>Saídas por semana do mês</h2><p>{doMes.length ? `A semana mais pesada é a de ${maior.rotulo}.` : "Nenhuma conta neste mês."}{mesesAnt ? ` A marca mostra a média de ${mesesAnt} ${mesesAnt === 1 ? "mês anterior" : "meses anteriores"}.` : ""}</p></div>
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
          <div className="painel-topo"><div><h2>Falta pedir nota fiscal</h2><p>Contas sem nota no Conta Azul. Facção, folha, impostos e tarifas ficam de fora.</p></div>{semNota.length > 0 && <span className="etiqueta alerta">{semNota.length}</span>}</div>
          {semNota.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Categoria</th><th>Banco</th><th className="num">Valor</th><th>Situação</th></tr></thead>
                <tbody>
                  {semNota.slice(0, 40).map((c) => (
                    <tr key={c.id}>
                      <td data-rotulo="Vencimento">{dataCurta(c.vencimento)}</td>
                      <td data-rotulo="Fornecedor"><b>{c.fornecedor || "—"}</b><div className="mini">{c.descricao}</div></td>
                      <td data-rotulo="Categoria" className="mini">{c.categoria ?? "—"}</td>
                      <td data-rotulo="Banco" className="mini">{bancoCobrado(c.conta) ?? c.conta ?? "—"}</td>
                      <td data-rotulo="Valor" className="num">{reais(Number(c.valor))}</td>
                      <td data-rotulo="Situação"><span className={`etiqueta ${Number(c.em_aberto) > 0 ? "neutra" : "ok"}`}>{Number(c.em_aberto) > 0 ? "Em aberto" : "Paga"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="painel-corpo mini">Todas as contas de fornecedor têm nota.</p>}
        </section>
      </div>
    </>
  );
}

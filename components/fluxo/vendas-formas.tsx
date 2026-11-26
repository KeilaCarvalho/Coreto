"use client";

import { useState } from "react";
import { BarrasDias, type BarraDia } from "@/components/barras-dias";

type Linha = { nome: string; valor: number };
const CORES = ["#2f322d", "#00ced1", "#14b8a9", "#8fe3e4", "#f2d98a", "#c9d3d0", "#6a706b"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const curto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

function Rosca({ linhas, total, rotulo, cores }: { linhas: Linha[]; total: number; rotulo: string; cores: Map<string, string> }) {
  const r = 78, c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={`Vendas ${rotulo} por forma de pagamento`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="#e7ecea" strokeWidth="24" />
      {total > 0 && linhas.map((l) => {
        const fatia = (Math.max(0, l.valor) / total) * c;
        const el = <circle key={l.nome} cx="100" cy="100" r={r} fill="none" stroke={cores.get(l.nome)} strokeWidth="24"
          strokeDasharray={`${Math.max(0, fatia - 2)} ${c}`} strokeDashoffset={-acumulado} transform="rotate(-90 100 100)" />;
        acumulado += fatia;
        return el;
      })}
      <text x="100" y="98" textAnchor="middle" className="centro-v">{curto(total)}</text>
      <text x="100" y="118" textAnchor="middle" className="centro-r">{rotulo}</text>
    </svg>
  );
}

/**
 * "Vendas dia a dia" + "Formas de pagamento" lado a lado: ao clicar numa coluna,
 * o quadro de formas passa a mostrar aquele dia; "Ver o mês" volta para o acumulado.
 */
export function VendasEFormas({ barras, inicial, total, totalTexto, temBarras, mes, totalMes, formasPorDia, legenda, editar, atualizado }: {
  barras: BarraDia[]; inicial?: string; total: number; totalTexto: string; temBarras: boolean;
  mes: Linha[]; totalMes: number; formasPorDia: Record<string, Linha[]>; legenda: React.ReactNode; editar?: React.ReactNode; atualizado?: string | null;
}) {
  const [dia, setDia] = useState<string | null>(null);
  // Cor fixa por forma (a mesma no mês e nos dias).
  const nomes = [...new Set([...mes.map((l) => l.nome), ...Object.values(formasPorDia).flat().map((l) => l.nome)])];
  const cores = new Map(nomes.map((n, i) => [n, CORES[i % CORES.length]]));
  const barra = dia ? barras.find((b) => b.dia === dia) : null;
  const linhas = dia ? (formasPorDia[dia] ?? []).filter((l) => l.valor) : mes;
  const totalVer = dia ? linhas.reduce((t, l) => t + l.valor, 0) : totalMes;
  return (
    <>
      <section className="painel c7">
        <div className="painel-topo">
          <div><h2>Vendas dia a dia</h2>{legenda}</div>
          <div className="fx-total"><strong>{totalTexto}</strong><span>últimos 14 dias de venda</span></div>
        </div>
        {temBarras ? <BarrasDias total={total} inicial={inicial} barras={barras} aoEscolher={(d) => setDia(d)} atualizado={atualizado} />
          : <p className="fx-sem-grafico">Ainda não há vendas lançadas nos últimos dias.</p>}
      </section>

      <section className={`painel c5 fx-formas-painel${dia ? " do-dia" : ""}`}>
        <div className="painel-topo">
          <div><h2>Formas de pagamento</h2><p>{dia ? barra?.titulo ?? dia : "Acumulado do mês · toque num dia ao lado"}</p></div>
          {dia ? <button type="button" className="botao secundario pequeno" onClick={() => setDia(null)}>Ver o mês</button> : editar}
        </div>
        {linhas.length ? (
          <div className="fx-rosca">
            <Rosca linhas={linhas} total={totalVer} rotulo={dia ? "no dia" : "no mês"} cores={cores} />
            <div className="fx-formas">
              {linhas.map((l) => (
                <div className="fx-forma" key={l.nome}>
                  <i style={{ background: cores.get(l.nome) }} />
                  <span>{l.nome}<small>{pct(l.valor, totalVer)}% {dia ? "do dia" : "do mês"}</small></span>
                  <b>{reais(l.valor)}</b>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="fx-sem-grafico">{dia ? "Sem vendas lançadas neste dia." : "O acumulado do mês não foi informado."}</p>}
      </section>
    </>
  );
}

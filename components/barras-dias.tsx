"use client";

import { useState } from "react";

export type BarraDia = { dia: string; valor: number | null; classe: string; rotulo: string; sub: string; titulo: string };

const curto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Barras de vendas por dia. Toque (ou passe o mouse) numa barra para ver o total do dia
 * na faixa de cima; no computador cada barra também mostra o valor curto em cima.
 */
export function BarrasDias({ barras, inicial, total, aoEscolher, atualizado }: { barras: BarraDia[]; inicial?: string; total: number; aoEscolher?: (dia: string) => void; atualizado?: string | null }) {
  const maior = Math.max(0, ...barras.map((b) => b.valor ?? 0));
  const padrao = inicial ?? [...barras].reverse().find((b) => b.valor !== null)?.dia ?? barras[0]?.dia;
  const [sel, setSel] = useState(padrao);
  const atual = barras.find((b) => b.dia === sel);
  return (
    <div className="bd">
      <div className="bd-leitura" aria-live="polite">
        {atual ? (
          <>
            <span className="bd-dia">{atual.titulo}</span>
            <strong>{atual.valor === null ? "sem lançamento" : reais(atual.valor)}</strong>
            {atual.valor !== null && total > 0 && <span className="bd-pct">{Math.round((atual.valor / total) * 100)}% do período</span>}
          </>
        ) : null}
        {atualizado ? <span className="bd-hora"><i />{atualizado}</span> : <span className="bd-dica">Toque numa barra</span>}
      </div>
      <div className="fx-barras bd-barras" role="listbox" aria-label="Vendas por dia">
        {barras.map((b) => {
          const alt = b.valor === null ? 0 : Math.max(4, (b.valor / (maior || 1)) * 100);
          return (
            <button
              key={b.dia}
              type="button"
              role="option"
              aria-selected={b.dia === sel}
              aria-label={`${b.titulo}: ${b.valor === null ? "sem lançamento" : reais(b.valor)}`}
              className={`fx-barra ${b.classe}${b.dia === sel ? " sel" : ""}`}
              onClick={() => { setSel(b.dia); aoEscolher?.(b.dia); }}
              onMouseEnter={() => setSel(b.dia)}
            >
              {b.valor !== null && <i style={{ height: `${alt}%` }} />}
              {b.valor !== null && b.valor > 0 && <span className="bd-valor" style={{ bottom: `${alt}%` }}>{curto(b.valor)}</span>}
            </button>
          );
        })}
      </div>
      <div className="fx-eixo">{barras.map((b) => <span key={b.dia} className={b.dia === sel ? "sel" : ""}><small>{b.rotulo}</small>{b.sub}</span>)}</div>
    </div>
  );
}

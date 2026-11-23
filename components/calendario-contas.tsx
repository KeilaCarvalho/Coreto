"use client";

import { useState } from "react";

export type DiaConta = { dia: string; total: number; aberto: number; contas: { fornecedor: string; valor: number; aberto: number }[] };

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10000 ? 0 : 1 })}k` : String(Math.round(v)));

/** Calendário de vencimentos: toque num dia para ver o total e as contas daquele dia. */
export function CalendarioContas({ dias, primeiro, hoje }: { dias: DiaConta[]; primeiro: number; hoje: string }) {
  const max = Math.max(1, ...dias.map((d) => d.total));
  const padrao = dias.find((d) => d.dia === hoje && d.total > 0)?.dia
    ?? dias.find((d) => d.dia >= hoje && d.total > 0)?.dia
    ?? [...dias].sort((x, y) => y.total - x.total)[0]?.dia;
  const [sel, setSel] = useState(padrao);
  const atual = dias.find((d) => d.dia === sel);
  const [ano, mes, dia] = (sel ?? "").split("-").map(Number);
  const semana = sel ? SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()] : "";

  return (
    <>
      <div className="cp-cal">
        {DIAS.map((d) => <span key={d} className="cp-cal-dia">{d}</span>)}
        {Array.from({ length: primeiro }, (_, i) => <span key={`v${i}`} />)}
        {dias.map((d, i) => {
          const nivel = d.total ? Math.min(4, Math.ceil((d.total / max) * 4)) : 0;
          return (
            <button key={d.dia} type="button" aria-pressed={d.dia === sel} aria-label={`Dia ${i + 1}: ${d.total ? reais(d.total) : "nada vence"}`}
              className={`cp-cal-cel n${nivel}${d.dia === hoje ? " hoje" : ""}${d.dia === sel ? " sel" : ""}`}
              onClick={() => setSel(d.dia)} onMouseEnter={() => setSel(d.dia)}>
              <b>{i + 1}</b>{d.total > 0 && <small>{curto(d.total)}</small>}
            </button>
          );
        })}
      </div>
      {atual && (
        <div className="cp-cal-leitura" aria-live="polite">
          <div className="cp-cal-leitura-topo">
            <span>{semana}, {String(dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}</span>
            <strong>{atual.total ? reais(atual.total) : "Nada vence"}</strong>
            {atual.total > 0 && (atual.aberto > 0
              ? <em className={sel! < hoje ? "atraso" : ""}>{sel! < hoje ? "atrasado " : "a pagar "}{reais(atual.aberto)}</em>
              : <em className="pago">tudo pago</em>)}
          </div>
          {atual.contas.length > 0 && (
            <ul>
              {atual.contas.slice(0, 6).map((c, i) => (
                <li key={i}><span>{c.fornecedor}</span><b>{reais(c.valor)}</b>{c.aberto <= 0 && <small>pago</small>}</li>
              ))}
              {atual.contas.length > 6 && <li className="mais">e mais {atual.contas.length - 6} {atual.contas.length - 6 === 1 ? "conta" : "contas"}</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

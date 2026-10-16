"use client";

import { useState } from "react";

export type LinhaGrade = { corId: string; nome: string; hex: string | null };
/** Célula da grade: a variante daquela cor × tamanho e, na liberação, o máximo disponível. */
export type CelulaGrade = { varianteId: string; maximo?: number; inicial?: number };

/**
 * Grade de digitação cor × tamanho. Cada campo vai no formulário como "q:<variante_id>".
 * Com "maximo", a grade serve para liberar parte de um lote (cada célula limitada ao que está aguardando).
 */
export function GradeQuantidades({ linhas, tamanhos, celulas, comBotoes = false }: {
  linhas: LinhaGrade[]; tamanhos: string[]; celulas: Record<string, CelulaGrade>; comBotoes?: boolean;
}) {
  const chave = (cor: string, tam: string) => `${cor}|${tam}`;
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(celulas).map(([k, c]) => [k, c.inicial ? String(c.inicial) : ""])));
  const qtd = (k: string) => Math.max(0, Math.floor(Number(valores[k] || 0)) || 0);
  const totalLinha = (cor: string) => tamanhos.reduce((t, tam) => t + qtd(chave(cor, tam)), 0);
  const totalColuna = (tam: string) => linhas.reduce((t, l) => t + qtd(chave(l.corId, tam)), 0);
  const total = linhas.reduce((t, l) => t + totalLinha(l.corId), 0);
  const preencher = (modo: "tudo" | "nada") =>
    setValores(Object.fromEntries(Object.entries(celulas).map(([k, c]) => [k, modo === "tudo" && c.maximo ? String(c.maximo) : ""])));

  return (
    <div className="grade-digitacao">
      {comBotoes && (
        <div className="grade-botoes">
          <button type="button" className="botao leve pequeno" onClick={() => preencher("tudo")}>Tudo que está aguardando</button>
          <button type="button" className="botao leve pequeno" onClick={() => preencher("nada")}>Limpar</button>
        </div>
      )}
      <div className="tabela-rolagem">
        <table className="matriz digitavel">
          <thead><tr><th scope="col" style={{ textAlign: "left" }}>Cor</th>{tamanhos.map((t) => <th scope="col" key={t}>{t}</th>)}<th scope="col">Total</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.corId}>
                <th scope="row"><i className="amostra" style={{ background: l.hex ?? "#fff", marginRight: 8 }} />{l.nome}</th>
                {tamanhos.map((tam) => {
                  const k = chave(l.corId, tam);
                  const c = celulas[k];
                  if (!c || c.maximo === 0) return <td key={tam} className="inativa">—</td>;
                  return (
                    <td key={tam}>
                      <input
                        name={`q:${c.varianteId}`} inputMode="numeric" type="number" min={0} max={c.maximo} step={1}
                        value={valores[k] ?? ""} placeholder="0" aria-label={`${l.nome} ${tam}`}
                        onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                      />
                      {c.maximo != null && <span className="codigo">de {c.maximo}</span>}
                    </td>
                  );
                })}
                <td className="total-linha">{totalLinha(l.corId)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row" style={{ textAlign: "left" }}>Total</th>{tamanhos.map((t) => <td key={t}>{totalColuna(t)}</td>)}<td className="total-geral">{total}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

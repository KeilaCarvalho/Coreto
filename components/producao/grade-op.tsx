"use client";

export type LinhaGradeOp = { cor: string; q: Record<string, number> };

export const totalLinhaOp = (l: LinhaGradeOp, tamanhos: string[]) => tamanhos.reduce((t, tam) => t + (Number(l.q[tam]) || 0), 0);
export const totalGradeOp = (g: LinhaGradeOp[] | null | undefined, tamanhos: string[]) => (g ?? []).reduce((t, l) => t + totalLinhaOp(l, tamanhos), 0);

const TAMANHOS_EXTRA = ["PP", "P", "M", "G", "GG", "U", "34", "36", "38", "40", "42", "44", "46"];

/** Grade cor × tamanho da ficha de corte (igual ao papel do cortador), com totais por linha e coluna. */
export function GradeOp({ linhas, tamanhos, aoMudar, aoMudarTamanhos, somenteLer = false, referencia }: {
  linhas: LinhaGradeOp[]; tamanhos: string[];
  aoMudar?: (l: LinhaGradeOp[]) => void; aoMudarTamanhos?: (t: string[]) => void;
  somenteLer?: boolean; referencia?: LinhaGradeOp[] | null;
}) {
  const mudar = (i: number, campo: "cor" | string, valor: string) => {
    const nova = linhas.map((l, j) => {
      if (j !== i) return l;
      if (campo === "cor") return { ...l, cor: valor };
      const n = valor.replace(/\D/g, "");
      const q = { ...l.q };
      if (n) q[campo] = Number(n); else delete q[campo];
      return { ...l, q };
    });
    aoMudar?.(nova);
  };
  const total = totalGradeOp(linhas, tamanhos);
  const ref = (cor: string, tam: string) => referencia?.find((l) => l.cor.trim().toLowerCase() === cor.trim().toLowerCase())?.q[tam];
  const faltando = TAMANHOS_EXTRA.filter((t) => !tamanhos.includes(t));

  return (
    <div className="gop">
      <div className="tabela-rolagem">
        <table className="gop-tabela">
          <thead>
            <tr>
              <th className="gop-cor">Cor</th>
              {tamanhos.map((t) => <th key={t}>{t}</th>)}
              <th>Total</th>
              {!somenteLer && <th aria-label="Tirar" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td className="gop-cor">
                  {somenteLer ? <b>{l.cor}</b> : <input value={l.cor} onChange={(e) => mudar(i, "cor", e.target.value)} placeholder="Ex.: Branco" aria-label={`Cor da linha ${i + 1}`} />}
                </td>
                {tamanhos.map((t) => {
                  const r = ref(l.cor, t);
                  return (
                    <td key={t}>
                      {somenteLer ? <span>{l.q[t] || "—"}</span> : (
                        <input inputMode="numeric" value={l.q[t] ?? ""} onChange={(e) => mudar(i, t, e.target.value)} aria-label={`${l.cor || "Cor"} ${t}`}
                          className={r != null && (l.q[t] ?? 0) !== r ? "difere" : ""} />
                      )}
                      {r != null && !somenteLer && <small className="gop-ref">corte {r}</small>}
                    </td>
                  );
                })}
                <td className="gop-total">{totalLinhaOp(l, tamanhos) || "—"}</td>
                {!somenteLer && <td><button type="button" className="gop-tirar" onClick={() => aoMudar?.(linhas.filter((_, j) => j !== i))} aria-label="Tirar cor">×</button></td>}
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={tamanhos.length + 3} className="gop-vazio">Nenhuma cor ainda.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <th className="gop-cor">Total</th>
              {tamanhos.map((t) => <th key={t}>{linhas.reduce((s, l) => s + (Number(l.q[t]) || 0), 0) || "—"}</th>)}
              <th className="gop-total">{total} pç</th>
              {!somenteLer && <th />}
            </tr>
          </tfoot>
        </table>
      </div>
      {!somenteLer && (
        <div className="gop-acoes">
          <button type="button" className="botao leve pequeno" onClick={() => aoMudar?.([...linhas, { cor: "", q: {} }])}>+ Cor</button>
          {aoMudarTamanhos && faltando.length > 0 && (
            <select className="gop-tam" value="" onChange={(e) => { if (e.target.value) aoMudarTamanhos([...tamanhos, e.target.value].sort((a, b) => TAMANHOS_EXTRA.indexOf(a) - TAMANHOS_EXTRA.indexOf(b))); }} aria-label="Adicionar tamanho">
              <option value="">+ Tamanho</option>
              {faltando.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {aoMudarTamanhos && tamanhos.length > 1 && (
            <select className="gop-tam" value="" onChange={(e) => { if (e.target.value) aoMudarTamanhos(tamanhos.filter((t) => t !== e.target.value)); }} aria-label="Tirar tamanho">
              <option value="">− Tamanho</option>
              {tamanhos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

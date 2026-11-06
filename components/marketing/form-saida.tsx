"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CancelarJanela } from "@/components/janela-lateral";
import { registrarSaida } from "@/app/(sistema)/marketing/acoes";

export type VarianteFoto = { id: string; produto: string; referencia: string; cor: string; hex: string | null; tamanho: string; disponivel: Record<string, number> };
type Local = { id: string; nome: string };

/** Saída para fotos: escolhe de onde sai, o modelo e quantas de cada cor/tamanho. */
export function FormSaidaFotos({ variantes, locais }: { variantes: VarianteFoto[]; locais: Local[] }) {
  const [origem, setOrigem] = useState(locais[0]?.id ?? "");
  const [modelo, setModelo] = useState("");
  const [busca, setBusca] = useState("");
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [para, setPara] = useState("");
  const [obs, setObs] = useState("");

  const modelos = useMemo(() => {
    const m = new Map<string, { referencia: string; produto: string; total: number }>();
    for (const v of variantes) {
      const d = v.disponivel[origem] ?? 0;
      if (!d) continue;
      const k = `${v.referencia} ${v.produto}`;
      const x = m.get(k) ?? { referencia: v.referencia, produto: v.produto, total: 0 };
      x.total += d; m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => a[1].referencia.localeCompare(b[1].referencia));
  }, [variantes, origem]);
  const filtrados = modelos.filter(([k]) => !busca.trim() || k.toLowerCase().includes(busca.trim().toLowerCase()));
  const doModelo = variantes.filter((v) => `${v.referencia} ${v.produto}` === modelo && (v.disponivel[origem] ?? 0) > 0);
  const itens = Object.entries(qtd).filter(([, q]) => q > 0).map(([variante_id, quantidade]) => ({ variante_id, quantidade }));
  const total = itens.reduce((t, i) => t + i.quantidade, 0);
  const escolhidas = variantes.filter((v) => (qtd[v.id] ?? 0) > 0);
  const pacote = JSON.stringify({ origem, para, observacao: obs, itens });
  const mudar = (id: string, n: number, max: number) => setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(max, n)) }));

  return (
    <FormAcao acao={registrarSaida}>
      <input type="hidden" name="dados" value={pacote} />
      <div className="bloco-janela">
        <div className="campos duas">
          <div className="campo">
            <label htmlFor="mf-origem">Sai de</label>
            <select id="mf-origem" value={origem} onChange={(e) => { setOrigem(e.target.value); setQtd({}); setModelo(""); }}>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mf-para">Para quê / com quem</label>
            <input id="mf-para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="Ex.: fotos do site, influencer Ana" required />
          </div>
        </div>
      </div>

      <div className="bloco-janela">
        <h3>Peças</h3>
        {!modelo ? (
          <>
            <input className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo ou referência" aria-label="Buscar modelo" style={{ width: "100%", marginBottom: 10 }} />
            <div className="mf-modelos">
              {filtrados.map(([k, m]) => (
                <button type="button" key={k} className="mf-modelo" onClick={() => setModelo(k)}>
                  <b>{m.referencia}</b><span>{m.produto}</span><small>{m.total} disp.</small>
                </button>
              ))}
              {!filtrados.length && <p className="mini">Nenhum modelo com peças nesse local.</p>}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="botao leve pequeno" onClick={() => setModelo("")}>‹ Outro modelo</button>
            <p style={{ margin: "10px 0 6px", fontWeight: 700 }}>{modelo}</p>
            <div className="mf-variantes">
              {doModelo.map((v) => {
                const max = v.disponivel[origem] ?? 0;
                const n = qtd[v.id] ?? 0;
                return (
                  <div key={v.id} className={`mf-var${n ? " escolhida" : ""}`}>
                    <span className="amostra" style={{ background: v.hex ?? "#ccc" }} />
                    <span className="mf-var-nome">{v.cor} · <b>{v.tamanho}</b><small>{max} disp.</small></span>
                    <span className="mf-passo">
                      <button type="button" onClick={() => mudar(v.id, n - 1, max)} aria-label={`Menos ${v.cor} ${v.tamanho}`} disabled={!n}>−</button>
                      <b>{n}</b>
                      <button type="button" onClick={() => mudar(v.id, n + 1, max)} aria-label={`Mais ${v.cor} ${v.tamanho}`} disabled={n >= max}>+</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {escolhidas.length > 0 && (
          <div className="mf-resumo">
            <b>{total} {total === 1 ? "peça" : "peças"} escolhida{total === 1 ? "" : "s"}</b>
            <ul>{escolhidas.map((v) => <li key={v.id}>{qtd[v.id]}× {v.referencia} {v.produto} · {v.cor} {v.tamanho}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="bloco-janela">
        <div className="campo"><label htmlFor="mf-obs">Anotação (opcional)</label><textarea id="mf-obs" rows={2} value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: volta sexta" /></div>
      </div>
      <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Registrando…">{total ? `Registrar ${total} ${total === 1 ? "peça" : "peças"}` : "Registrar saída"}</BotaoEnviar></div>
    </FormAcao>
  );
}

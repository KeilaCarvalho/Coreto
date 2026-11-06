"use client";

import { useMemo, useState } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CancelarJanela } from "@/components/janela-lateral";
import { registrarSaida } from "@/app/(sistema)/marketing/acoes";

export type VarianteFoto = { id: string; produto: string; referencia: string; cor: string; hex: string | null; tamanho: string; disponivel: number };

/** Saída para fotos (sempre da Loja): evento, data e as peças. */
export function FormSaidaFotos({ variantes, hoje }: { variantes: VarianteFoto[]; hoje: string }) {
  const [evento, setEvento] = useState("");
  const [data, setData] = useState(hoje);
  const [modelo, setModelo] = useState("");
  const [busca, setBusca] = useState("");
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [obs, setObs] = useState("");

  const modelos = useMemo(() => {
    const m = new Map<string, { referencia: string; produto: string; total: number }>();
    for (const v of variantes) {
      const d = v.disponivel;
      if (!d) continue;
      const k = `${v.referencia} ${v.produto}`;
      const x = m.get(k) ?? { referencia: v.referencia, produto: v.produto, total: 0 };
      x.total += d; m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => a[1].referencia.localeCompare(b[1].referencia));
  }, [variantes]);
  const filtrados = modelos.filter(([k]) => !busca.trim() || k.toLowerCase().includes(busca.trim().toLowerCase()));
  const doModelo = variantes.filter((v) => `${v.referencia} ${v.produto}` === modelo && v.disponivel > 0);
  const itens = Object.entries(qtd).filter(([, q]) => q > 0).map(([variante_id, quantidade]) => ({ variante_id, quantidade }));
  const total = itens.reduce((t, i) => t + i.quantidade, 0);
  const escolhidas = variantes.filter((v) => (qtd[v.id] ?? 0) > 0);
  const pacote = JSON.stringify({ evento, data, observacao: obs, itens });
  const mudar = (id: string, n: number, max: number) => setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(max, n)) }));

  return (
    <FormAcao acao={registrarSaida}>
      <input type="hidden" name="dados" value={pacote} />
      <div className="bloco-janela">
        <div className="campos duas">
          <div className="campo">
            <label htmlFor="mf-evento">Evento / sessão de fotos</label>
            <input id="mf-evento" value={evento} onChange={(e) => setEvento(e.target.value)} placeholder="Ex.: Fotos coleção verão" required />
          </div>
          <div className="campo">
            <label htmlFor="mf-data">Data da sessão</label>
            <input id="mf-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>
        </div>
        <p className="mini" style={{ marginTop: 8 }}>As peças saem da Loja.</p>
      </div>

      <div className="bloco-janela">
        <h3>Peças</h3>
        {!modelo ? (
          <>
            <input className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo ou referência" aria-label="Buscar modelo" style={{ width: "100%", marginBottom: 10 }} />
            <div className="mf-modelos">
              {filtrados.map(([k, m]) => (
                <button type="button" key={k} className="mf-modelo" onClick={() => setModelo(k)}>
                  <b>{m.referencia}</b><span>{m.produto}</span><small>{m.total} na loja</small>
                </button>
              ))}
              {!filtrados.length && <p className="mini">Nenhum modelo com peças na loja.</p>}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="botao leve pequeno" onClick={() => setModelo("")}>‹ Outro modelo</button>
            <p style={{ margin: "10px 0 6px", fontWeight: 700 }}>{modelo}</p>
            <div className="mf-variantes">
              {doModelo.map((v) => {
                const max = v.disponivel;
                const n = qtd[v.id] ?? 0;
                return (
                  <div key={v.id} className={`mf-var${n ? " escolhida" : ""}`}>
                    <span className="amostra" style={{ background: v.hex ?? "#ccc" }} />
                    <span className="mf-var-nome">{v.cor} · <b>{v.tamanho}</b><small>{max} na loja</small></span>
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

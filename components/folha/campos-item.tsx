"use client";

import { useState } from "react";
import { TIPOS_ITEM } from "@/lib/folha";

/** Campos do lançamento do mês: tipo, se soma ou desconta, descrição e valor. */
export function CamposItem({ parteInicial }: { parteInicial: "comissao" | "vt" }) {
  const [tipo, setTipo] = useState("retirada");
  const t = TIPOS_ITEM.find((x) => x.valor === tipo)!;
  const [sinal, setSinal] = useState<"soma" | "desconta">("desconta");
  const efetivo = t.sinal === 1 ? "soma" : t.sinal === -1 ? "desconta" : sinal;
  return (
    <>
      <input type="hidden" name="sinal" value={efetivo} />
      <div className="campos duas">
        <div className="campo">
          <label htmlFor="it-tipo">Tipo</label>
          <select id="it-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_ITEM.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="it-parte">Entra em</label>
          <select id="it-parte" name="parte" defaultValue={parteInicial}>
            <option value="comissao">Comissão</option>
            <option value="vt">VT e ajuda de custo</option>
          </select>
        </div>
      </div>
      {t.sinal === 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          <button type="button" className={`chip${sinal === "soma" ? " marcada" : ""}`} onClick={() => setSinal("soma")}>Soma no recibo</button>
          <button type="button" className={`chip${sinal === "desconta" ? " marcada" : ""}`} onClick={() => setSinal("desconta")}>Desconta do recibo</button>
        </div>
      )}
      <div className="campos duas" style={{ marginTop: 12 }}>
        <div className="campo"><label htmlFor="it-desc">Descrição</label><input id="it-desc" name="descricao" maxLength={200} placeholder="Ex.: vestido Monalisa preto M" /></div>
        <div className="campo">
          <label htmlFor="it-valor">Valor</label>
          <input id="it-valor" name="valor" inputMode="decimal" placeholder="0,00" required />
          <span className="ajuda">{efetivo === "soma" ? "Vai somar no recibo." : "Vai descontar do recibo."}</span>
        </div>
      </div>
    </>
  );
}

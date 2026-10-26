"use client";

import { useState } from "react";
import { ETAPAS } from "@/lib/clientes";

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const RETORNOS = [
  { rotulo: "Amanhã", dias: 1 }, { rotulo: "3 dias", dias: 3 }, { rotulo: "1 semana", dias: 7 },
  { rotulo: "15 dias", dias: 15 }, { rotulo: "1 mês", dias: 30 }, { rotulo: "Não precisa", dias: 0 },
];
// Depois da venda ou sem retorno, o normal é não marcar retorno; nas outras etapas, uma semana.
const retornoPadrao = (etapa: string) => (["venda_realizada", "sem_retorno"].includes(etapa) ? 0 : 7);

/** Campos do registro de contato: etapa e retorno em botões, para a vendedora registrar rápido. */
export function CamposContato({ etapaAtual, hoje }: { etapaAtual: string; hoje: string }) {
  const inicial = etapaAtual === "nao_contatada" ? "primeiro_contato" : etapaAtual === "primeiro_contato" ? "segundo_contato" : etapaAtual;
  const [etapa, setEtapa] = useState(inicial);
  const [dias, setDias] = useState(retornoPadrao(inicial));
  const [data, setData] = useState(hoje);
  const retorno = dias ? somarDias(data, dias) : "";

  return (
    <>
      <input type="hidden" name="etapa" value={etapa} />
      <input type="hidden" name="proximo_contato" value={retorno} />
      <div className="bloco-janela">
        <h3>Como está agora</h3>
        <p>A etapa da cliente depois deste contato.</p>
        <div className="chips">
          {ETAPAS.filter((e) => e.valor !== "nao_contatada").map((e) => (
            <button key={e.valor} type="button" className={`chip ${etapa === e.valor ? "marcada" : ""}`} aria-pressed={etapa === e.valor}
              onClick={() => { setEtapa(e.valor); setDias(retornoPadrao(e.valor)); }}>{e.rotulo}</button>
          ))}
        </div>
      </div>
      <div className="bloco-janela">
        <div className="campo">
          <label htmlFor="nota">O que aconteceu</label>
          <textarea id="nota" name="nota" required rows={3} placeholder="Ex.: mandei fotos da coleção nova; pediu para retornar semana que vem" />
        </div>
        <div className="campo" style={{ marginTop: 12, maxWidth: 220 }}>
          <label htmlFor="contatado_em">Dia do contato</label>
          <input id="contatado_em" name="contatado_em" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value || hoje)} required />
        </div>
      </div>
      <div className="bloco-janela">
        <h3>Chamar de novo</h3>
        <p>{retorno ? `Vai aparecer em “Retornos de hoje” no dia ${retorno.split("-").reverse().join("/")}.` : "Sem lembrete de retorno."}</p>
        <div className="chips">
          {RETORNOS.map((r) => (
            <button key={r.rotulo} type="button" className={`chip ${dias === r.dias ? "marcada" : ""}`} aria-pressed={dias === r.dias} onClick={() => setDias(r.dias)}>{r.rotulo}</button>
          ))}
        </div>
      </div>
    </>
  );
}

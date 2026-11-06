"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CancelarJanela } from "@/components/janela-lateral";
import { registrarSaida } from "@/app/(sistema)/marketing/acoes";

type Linha = { peca: string; cor: string; tamanho: string; quantidade: string };
const vazia = (peca = "", cor = ""): Linha => ({ peca, cor, tamanho: "", quantidade: "1" });
const TAMANHOS = ["PP", "P", "M", "G", "GG", "U"];

/** Saída para fotos: evento, data e as peças digitadas (nome, cor, tamanho). */
export function FormSaidaFotos({ hoje }: { hoje: string }) {
  const [evento, setEvento] = useState("");
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([vazia()]);
  const mudar = (i: number, m: Partial<Linha>) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const itens = linhas.filter((l) => l.peca.trim()).map((l) => ({ peca: l.peca.trim(), cor: l.cor.trim(), tamanho: l.tamanho.trim(), quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)) }));
  const total = itens.reduce((t, i) => t + i.quantidade, 0);
  const pacote = JSON.stringify({ evento, data, observacao: obs, itens });

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
      </div>

      <div className="bloco-janela">
        <h3>Peças</h3>
        <div className="mf-linhas">
          {linhas.map((l, i) => (
            <div className="mf-linha" key={i}>
              <input className="entrada mf-l-peca" value={l.peca} onChange={(e) => mudar(i, { peca: e.target.value })} placeholder="Nome da peça" aria-label="Nome da peça" />
              <input className="entrada" value={l.cor} onChange={(e) => mudar(i, { cor: e.target.value })} placeholder="Cor" aria-label="Cor" />
              <input className="entrada" value={l.tamanho} onChange={(e) => mudar(i, { tamanho: e.target.value.toUpperCase() })} placeholder="Tam." aria-label="Tamanho" list="mf-tamanhos" />
              <input className="entrada" value={l.quantidade} onChange={(e) => mudar(i, { quantidade: e.target.value })} inputMode="numeric" aria-label="Quantidade" />
              <div className="mf-l-acoes">
                <button type="button" className="botao leve pequeno" onClick={() => setLinhas([...linhas.slice(0, i + 1), vazia(l.peca, l.cor), ...linhas.slice(i + 1)])} title="Mesma peça, outro tamanho">+ tamanho</button>
                {linhas.length > 1 && <button type="button" className="fx-tirar" aria-label="Tirar peça" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}><Icone nome="fechar" tamanho={16} /></button>}
              </div>
            </div>
          ))}
        </div>
        <datalist id="mf-tamanhos">{TAMANHOS.map((t) => <option key={t} value={t} />)}</datalist>
        <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => setLinhas([...linhas, vazia()])}><Icone nome="mais" />Outra peça</button>
      </div>

      <div className="bloco-janela">
        <div className="campo"><label htmlFor="mf-obs">Anotação (opcional)</label><textarea id="mf-obs" rows={2} value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: volta sexta" /></div>
      </div>
      <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Registrando…">{total ? `Registrar ${total} ${total === 1 ? "peça" : "peças"}` : "Registrar saída"}</BotaoEnviar></div>
    </FormAcao>
  );
}

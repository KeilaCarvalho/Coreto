"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CancelarJanela } from "@/components/janela-lateral";
import { registrarSaida } from "@/app/(sistema)/marketing/acoes";

type Linha = { cor: string; tamanho: string; quantidade: string };
type Modelo = { nome: string; linhas: Linha[] };
const linhaVazia = (cor = ""): Linha => ({ cor, tamanho: "", quantidade: "1" });
const modeloVazio = (): Modelo => ({ nome: "", linhas: [linhaVazia()] });
const TAMANHOS = ["PP", "P", "M", "G", "GG", "U"];

/** Saída para fotos: evento, data e as peças (nome do modelo uma vez; embaixo cor, tamanho e quantidade). */
export function FormSaidaFotos({ hoje }: { hoje: string }) {
  const [evento, setEvento] = useState("");
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState("");
  const [modelos, setModelos] = useState<Modelo[]>([modeloVazio()]);
  const mudarModelo = (m: number, nome: string) => setModelos(modelos.map((x, j) => (j === m ? { ...x, nome } : x)));
  const mudarLinha = (m: number, l: number, d: Partial<Linha>) =>
    setModelos(modelos.map((x, j) => (j === m ? { ...x, linhas: x.linhas.map((y, k) => (k === l ? { ...y, ...d } : y)) } : x)));
  const novaLinha = (m: number) => setModelos(modelos.map((x, j) => (j === m ? { ...x, linhas: [...x.linhas, linhaVazia(x.linhas[x.linhas.length - 1]?.cor ?? "")] } : x)));
  const tirarLinha = (m: number, l: number) => setModelos(modelos.map((x, j) => (j === m ? { ...x, linhas: x.linhas.filter((_, k) => k !== l) } : x)).filter((x) => x.linhas.length));
  const itens = modelos.filter((x) => x.nome.trim()).flatMap((x) => x.linhas.map((l) => ({
    peca: x.nome.trim(), cor: l.cor.trim(), tamanho: l.tamanho.trim(), quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)),
  })));
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
        <div className="mf-modelos-form">
          {modelos.map((x, m) => (
            <div className="mf-grupo" key={m}>
              <div className="mf-grupo-topo">
                <input className="entrada mf-g-nome" value={x.nome} onChange={(e) => mudarModelo(m, e.target.value)} placeholder="Nome da peça (ex.: Vestido Ruth)" aria-label="Nome da peça" />
                {modelos.length > 1 && <button type="button" className="fx-tirar" aria-label="Tirar peça" onClick={() => setModelos(modelos.filter((_, j) => j !== m))}><Icone nome="fechar" tamanho={16} /></button>}
              </div>
              <div className="mf-g-cab" aria-hidden="true"><span>Cor</span><span>Tam.</span><span>Qtd.</span><span /></div>
              {x.linhas.map((l, k) => (
                <div className="mf-g-linha" key={k}>
                  <input className="entrada" value={l.cor} onChange={(e) => mudarLinha(m, k, { cor: e.target.value })} placeholder="Cor" aria-label="Cor" />
                  <input className="entrada" value={l.tamanho} onChange={(e) => mudarLinha(m, k, { tamanho: e.target.value.toUpperCase() })} placeholder="P" aria-label="Tamanho" list="mf-tamanhos" />
                  <input className="entrada" value={l.quantidade} onChange={(e) => mudarLinha(m, k, { quantidade: e.target.value })} inputMode="numeric" aria-label="Quantidade" />
                  <button type="button" className="fx-tirar" aria-label="Tirar linha" onClick={() => tirarLinha(m, k)} disabled={x.linhas.length === 1 && modelos.length === 1}><Icone nome="fechar" tamanho={14} /></button>
                </div>
              ))}
              <button type="button" className="botao-link mf-g-mais" onClick={() => novaLinha(m)}><Icone nome="mais" tamanho={16} />Cor ou tamanho</button>
            </div>
          ))}
        </div>
        <datalist id="mf-tamanhos">{TAMANHOS.map((t) => <option key={t} value={t} />)}</datalist>
        <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => setModelos([...modelos, modeloVazio()])}><Icone nome="mais" />Outra peça</button>
      </div>

      <div className="bloco-janela">
        <div className="campo"><label htmlFor="mf-obs">Anotação (opcional)</label><textarea id="mf-obs" rows={2} value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: volta sexta" /></div>
      </div>
      <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Registrando…">{total ? `Registrar ${total} ${total === 1 ? "peça" : "peças"}` : "Registrar saída"}</BotaoEnviar></div>
    </FormAcao>
  );
}

"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { num } from "@/components/ficha-custo";

export type InsumoSalvo = { nome: string; tipo: "tecido" | "aviamento" | "outro"; unidade: string; ultimo_preco: number | null; ultimo_preco_em: string | null };
type Linha = { nome: string; tipo: InsumoSalvo["tipo"]; unidade: string; quantidade: string; valor: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const nova = (): Linha => ({ nome: "", tipo: "tecido", unidade: "m", quantidade: "", valor: "" });

/** Campos da nota de compra: cabeçalho e itens. Vai para o servidor em JSON no campo "nota". */
export function CamposNota({ insumos, hoje }: { insumos: InsumoSalvo[]; hoje: string }) {
  const [numero, setNumero] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([nova()]);
  const achar = (nome: string) => insumos.find((i) => i.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  const mudar = (k: number, campo: keyof Linha, valor: string) => setLinhas((ls) => ls.map((l, j) => {
    if (j !== k) return l;
    const nl = { ...l, [campo]: valor };
    if (campo === "nome") {
      const s = achar(valor);
      if (s) { nl.tipo = s.tipo; nl.unidade = s.unidade; }
    }
    if (campo === "tipo" && !achar(l.nome)) nl.unidade = valor === "tecido" ? "m" : "un";
    return nl;
  }));
  const total = linhas.reduce((t, l) => t + num(l.quantidade) * num(l.valor), 0);
  const pacote = JSON.stringify({
    numero, fornecedor, data, observacao,
    itens: linhas.filter((l) => l.nome.trim()).map((l) => ({ nome: l.nome.trim(), tipo: l.tipo, unidade: l.unidade.trim(), quantidade: num(l.quantidade), valor_unitario: num(l.valor) })),
  });

  return (
    <>
      <input type="hidden" name="nota" value={pacote} />
      <datalist id="insumos-salvos">{insumos.map((i) => <option key={i.nome} value={i.nome} />)}</datalist>

      <div className="bloco-janela">
        <h3>Dados da nota</h3>
        <p>Confira na nota fiscal.</p>
        <div className="campos duas">
          <div className="campo"><label htmlFor="fornecedor">Fornecedor</label><input id="fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex.: Tecidos Goiás" required /></div>
          <div className="campo"><label htmlFor="numero">Número da nota</label><input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Opcional" /></div>
          <div className="campo"><label htmlFor="data">Data da nota</label><input id="data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="obs">Observação</label><input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" /></div>
        </div>
      </div>

      <div className="bloco-janela">
        <h3>Itens da nota</h3>
        <p>Comece a digitar: o que já foi comprado antes aparece na lista, com o último preço pago.</p>
        <div className="nota-linha cab"><span>Item</span><span>Tipo</span><span>Qtd.</span><span>Unid.</span><span>Valor unit. (R$)</span><span>Total</span><i /></div>
        {linhas.map((l, k) => {
          const salvo = achar(l.nome);
          return (
            <div key={k} className="nota-item">
              <div className="nota-linha">
                <input className="fx-in" list="insumos-salvos" value={l.nome} onChange={(e) => mudar(k, "nome", e.target.value)} placeholder="Ex.: Tule preto, zíper invisível 40cm" aria-label="Item" />
                <select className="fx-in" value={l.tipo} onChange={(e) => mudar(k, "tipo", e.target.value)} aria-label="Tipo">
                  <option value="tecido">Tecido</option><option value="aviamento">Aviamento</option><option value="outro">Outro</option>
                </select>
                <input className="fx-in valor" inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(k, "quantidade", e.target.value)} placeholder="0" aria-label="Quantidade" />
                <input className="fx-in" value={l.unidade} onChange={(e) => mudar(k, "unidade", e.target.value)} aria-label="Unidade" />
                <input className="fx-in valor" inputMode="decimal" value={l.valor} onChange={(e) => mudar(k, "valor", e.target.value)} placeholder="0,00" aria-label="Valor unitário" />
                <b className="ficha-total">{brl(num(l.quantidade) * num(l.valor))}</b>
                <button type="button" className="fx-tirar" onClick={() => setLinhas((ls) => ls.length > 1 ? ls.filter((_, j) => j !== k) : [nova()])} aria-label="Tirar item"><Icone nome="fechar" tamanho={16} /></button>
              </div>
              {salvo?.ultimo_preco != null && (
                <small className="nota-dica">Última compra: {brl(Number(salvo.ultimo_preco))} por {salvo.unidade} em {dataBR(salvo.ultimo_preco_em)}
                  {num(l.valor) > 0 && Number(salvo.ultimo_preco) > 0 && num(l.valor) !== Number(salvo.ultimo_preco) && (
                    <b className={num(l.valor) > Number(salvo.ultimo_preco) ? "desce" : "sobe"}> · {num(l.valor) > Number(salvo.ultimo_preco) ? "subiu" : "caiu"} {Math.abs(Math.round((num(l.valor) / Number(salvo.ultimo_preco) - 1) * 100))}%</b>
                  )}
                </small>
              )}
            </div>
          );
        })}
        <button type="button" className="botao leve pequeno" style={{ marginTop: 6 }} onClick={() => setLinhas((ls) => [...ls, nova()])}><Icone nome="mais" />Adicionar item</button>
        <div className="fx-subtotal"><span>Total da nota</span><span>{brl(total)}</span></div>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";

export type ItemFicha = { tipo: "material" | "mao_de_obra" | "outro"; descricao: string; quantidade: string; unidade: string; valor_unitario: string };
export type Taxas = { simples: string; cartao: string; comissao: string; despesas_fixas: string; lucro_desejado: string };

const ROTULO_TAXA: [keyof Taxas, string, string][] = [
  ["simples", "Simples Nacional", "Alíquota do DAS sobre a venda"],
  ["cartao", "Taxa do cartão", "Média da maquininha"],
  ["comissao", "Comissão", "Da vendedora"],
  ["despesas_fixas", "Despesas fixas", "Aluguel, salários, contas ÷ faturamento"],
  ["lucro_desejado", "Lucro desejado", "O que sobra limpo"],
];

/** "22,50" ou "22.5" → 22.5; vazio → 0. */
export function num(texto: string) {
  const t = String(texto ?? "").replace(/R\$|\s|%/g, "");
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const novoItem = (tipo: ItemFicha["tipo"] = "material"): ItemFicha => ({ tipo, descricao: "", quantidade: "1", unidade: tipo === "material" ? "m" : "un", valor_unitario: "" });

/** Ficha de custo com cálculo do preço na hora. Os itens vão para o servidor em JSON no campo "itens". */
export function FichaCusto({ itensIniciais, taxasIniciais, precoAtual }: { itensIniciais: ItemFicha[]; taxasIniciais: Taxas; precoAtual: number | null }) {
  const [itens, setItens] = useState<ItemFicha[]>(itensIniciais.length ? itensIniciais : [novoItem("material"), novoItem("mao_de_obra")]);
  const [taxas, setTaxas] = useState<Taxas>(taxasIniciais);
  const [preco, setPreco] = useState(precoAtual != null ? precoAtual.toFixed(2).replace(".", ",") : "");

  const mudar = (i: number, campo: keyof ItemFicha, valor: string) => setItens((lista) => lista.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)));
  const custoDe = (tipo: ItemFicha["tipo"]) => itens.filter((i) => i.tipo === tipo).reduce((t, i) => t + num(i.quantidade) * num(i.valor_unitario), 0);
  const custo = itens.reduce((t, i) => t + num(i.quantidade) * num(i.valor_unitario), 0);
  const somaTaxas = num(taxas.simples) + num(taxas.cartao) + num(taxas.comissao) + num(taxas.despesas_fixas);
  const soma = somaTaxas + num(taxas.lucro_desejado);
  const sugerido = soma < 100 && custo > 0 ? custo / (1 - soma / 100) : null;
  const precoNum = num(preco);
  const margem = precoNum > 0 ? ((precoNum * (1 - somaTaxas / 100) - custo) / precoNum) * 100 : null;
  const markup = precoNum > 0 && custo > 0 ? precoNum / custo : null;
  const validos = itens.filter((i) => i.descricao.trim() && num(i.valor_unitario) >= 0 && num(i.quantidade) > 0)
    .map((i) => ({ tipo: i.tipo, descricao: i.descricao.trim(), quantidade: num(i.quantidade), unidade: i.unidade.trim(), valor_unitario: num(i.valor_unitario) }));

  return (
    <>
      <input type="hidden" name="itens" value={JSON.stringify(validos)} />
      <div className="tabela-rolagem">
        <table className="tabela ficha">
          <thead><tr><th>Tipo</th><th>Descrição</th><th className="num">Qtd.</th><th>Unid.</th><th className="num">Valor unit. (R$)</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={i}>
                <td>
                  <select className="entrada" value={it.tipo} onChange={(e) => mudar(i, "tipo", e.target.value)} aria-label="Tipo de custo">
                    <option value="material">Material</option><option value="mao_de_obra">Mão de obra</option><option value="outro">Outro</option>
                  </select>
                </td>
                <td><input className="entrada" value={it.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} placeholder={it.tipo === "material" ? "Viscose, botão, etiqueta…" : it.tipo === "mao_de_obra" ? "Facção, corte, bordado…" : "Embalagem, frete…"} aria-label="Descrição" /></td>
                <td className="num"><input className="entrada curta" inputMode="decimal" value={it.quantidade} onChange={(e) => mudar(i, "quantidade", e.target.value)} aria-label="Quantidade" /></td>
                <td><input className="entrada mini-campo" value={it.unidade} onChange={(e) => mudar(i, "unidade", e.target.value)} aria-label="Unidade" /></td>
                <td className="num"><input className="entrada curta" inputMode="decimal" value={it.valor_unitario} onChange={(e) => mudar(i, "valor_unitario", e.target.value)} placeholder="0,00" aria-label="Valor unitário" /></td>
                <td className="num"><strong>{brl(num(it.quantidade) * num(it.valor_unitario))}</strong></td>
                <td><button type="button" className="icone-botao" onClick={() => setItens((l) => l.filter((_, j) => j !== i))} aria-label="Remover item"><Icone nome="fechar" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>Custo da peça</td><td className="num">{brl(custo)}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="filtros" style={{ padding: "12px 0 4px" }}>
        <button type="button" className="botao leve pequeno" onClick={() => setItens((l) => [...l, novoItem("material")])}><Icone nome="mais" />Material</button>
        <button type="button" className="botao leve pequeno" onClick={() => setItens((l) => [...l, novoItem("mao_de_obra")])}><Icone nome="mais" />Mão de obra</button>
        <button type="button" className="botao leve pequeno" onClick={() => setItens((l) => [...l, novoItem("outro")])}><Icone nome="mais" />Outro custo</button>
      </div>

      <h3 className="subtitulo">Percentuais sobre o preço</h3>
      <div className="campos cinco">
        {ROTULO_TAXA.map(([chave, rotulo, ajuda]) => (
          <div className="campo" key={chave}>
            <label htmlFor={chave}>{rotulo} (%)</label>
            <input id={chave} name={chave} inputMode="decimal" value={taxas[chave]} onChange={(e) => setTaxas((t) => ({ ...t, [chave]: e.target.value }))} />
            <span className="ajuda">{ajuda}</span>
          </div>
        ))}
      </div>
      {soma >= 100 && <p className="aviso erro" role="alert"><Icone nome="alerta" />A soma dos percentuais ({pct(soma)}) precisa ficar abaixo de 100%.</p>}

      <div className="calculo">
        <div><span>Material</span><strong>{brl(custoDe("material"))}</strong></div>
        <div><span>Mão de obra</span><strong>{brl(custoDe("mao_de_obra"))}</strong></div>
        <div><span>Outros</span><strong>{brl(custoDe("outro"))}</strong></div>
        <div><span>Custo total</span><strong>{brl(custo)}</strong></div>
        <div className="destaque"><span>Preço sugerido</span><strong>{sugerido != null ? brl(sugerido) : "—"}</strong><small>custo ÷ (1 − {pct(soma)})</small></div>
      </div>

      <div className="campos tres" style={{ marginTop: 18, alignItems: "end" }}>
        <div className="campo">
          <label htmlFor="preco">Preço de venda (R$)</label>
          <input id="preco" name="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={sugerido != null ? sugerido.toFixed(2).replace(".", ",") : "0,00"} />
          <span className="ajuda">O preço que vai na etiqueta e no caixa.{sugerido != null && !preco && <> <button type="button" className="botao-link" onClick={() => setPreco(sugerido.toFixed(2).replace(".", ","))}>Usar o sugerido</button></>}</span>
        </div>
        <div className={`resultado ${margem != null && margem < num(taxas.lucro_desejado) ? (margem < 0 ? "ruim" : "atencao") : "bom"}`}>
          <span>Lucro real com esse preço</span>
          <strong>{margem != null ? pct(Math.round(margem * 100) / 100) : "—"}</strong>
          <small>{margem != null ? `${brl(precoNum * (1 - somaTaxas / 100) - custo)} por peça` : "informe o preço"}</small>
        </div>
        <div className="resultado neutro">
          <span>Markup</span>
          <strong>{markup != null ? `${markup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×` : "—"}</strong>
          <small>preço ÷ custo</small>
        </div>
      </div>
    </>
  );
}

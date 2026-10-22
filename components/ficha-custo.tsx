"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import type { InsumoSalvo } from "@/components/insumos/lancar-nota";

export type ItemFicha = { tipo: "material" | "mao_de_obra" | "outro"; descricao: string; quantidade: string; unidade: string; valor_unitario: string };
export type Taxas = { simples: string; cartao: string; comissao: string; despesas_fixas: string; lucro_desejado: string };

const ROTULO_TAXA: [keyof Taxas, string, string][] = [
  ["simples", "Simples Nacional", "Imposto (DAS) sobre a venda"],
  ["cartao", "Taxa do cartão", "Média da maquininha"],
  ["comissao", "Comissão", "Da vendedora"],
  ["despesas_fixas", "Despesas fixas", "Aluguel, salários, contas"],
  ["lucro_desejado", "Lucro desejado", "O que sobra limpo"],
];

const GRUPOS: { tipo: ItemFicha["tipo"]; titulo: string; ajuda: string; exemplo: string; unidade: string }[] = [
  { tipo: "material", titulo: "Tecido e aviamentos", ajuda: "Quantidade da ficha da facção, preço pela nota fiscal", exemplo: "Viscose, botão, zíper, etiqueta…", unidade: "m" },
  { tipo: "mao_de_obra", titulo: "Mão de obra", ajuda: "Facção, corte, bordado, acabamento", exemplo: "Facção, corte…", unidade: "un" },
  { tipo: "outro", titulo: "Outros custos", ajuda: "Embalagem, frete, tag", exemplo: "Embalagem, frete…", unidade: "un" },
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
const novoItem = (tipo: ItemFicha["tipo"]): ItemFicha => ({ tipo, descricao: "", quantidade: "1", unidade: GRUPOS.find((g) => g.tipo === tipo)!.unidade, valor_unitario: "" });

/**
 * Precificação de um modelo em três passos: custo da peça (ficha da facção + notas fiscais),
 * impostos/taxas/lucro, e o preço de venda. Os itens vão para o servidor em JSON no campo "itens".
 */
export function FichaCusto({ itensIniciais, taxasIniciais, precoAtual, insumos = [], temPadrao = false, veioDoPadrao = false }: { itensIniciais: ItemFicha[]; taxasIniciais: Taxas; precoAtual: number | null; insumos?: InsumoSalvo[]; temPadrao?: boolean; veioDoPadrao?: boolean }) {
  const [itens, setItens] = useState<ItemFicha[]>(itensIniciais.length ? itensIniciais : [novoItem("material"), novoItem("mao_de_obra")]);
  const [taxas, setTaxas] = useState<Taxas>(taxasIniciais);
  const [preco, setPreco] = useState(precoAtual != null ? precoAtual.toFixed(2).replace(".", ",") : "");

  const achar = (nome: string) => insumos.find((s) => s.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  const mudar = (i: number, campo: keyof ItemFicha, valor: string) => setItens((lista) => lista.map((it, j) => {
    if (j !== i) return it;
    const novo = { ...it, [campo]: valor };
    // Item que já veio numa nota: traz a unidade e o último preço pago.
    const s = campo === "descricao" ? achar(valor) : undefined;
    if (s) {
      novo.unidade = s.unidade;
      if (s.ultimo_preco != null) novo.valor_unitario = String(Number(s.ultimo_preco)).replace(".", ",");
      if (it.tipo === "mao_de_obra") novo.tipo = "material";
    }
    return novo;
  }));
  const totalItem = (i: ItemFicha) => num(i.quantidade) * num(i.valor_unitario);
  const custoDe = (tipo: ItemFicha["tipo"]) => itens.filter((i) => i.tipo === tipo).reduce((t, i) => t + totalItem(i), 0);
  const custo = itens.reduce((t, i) => t + totalItem(i), 0);
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
      <datalist id="insumos-ficha">{insumos.map((s) => <option key={s.nome} value={s.nome} />)}</datalist>

      <div className="bloco-janela" id="b-custo">
        <h3>1. Custo da peça</h3>
        <p>O que foi gasto em uma peça, pela ficha que a facção mandou. {insumos.length ? "Digite o nome do tecido ou aviamento: o último preço das notas lançadas vem sozinho." : "Lançando as notas em “Notas e insumos”, o preço de cada item passa a vir sozinho."}</p>
        {GRUPOS.map((g) => {
          const linhas = itens.map((it, i) => ({ it, i })).filter(({ it }) => it.tipo === g.tipo);
          return (
            <div className="ficha-grupo" key={g.tipo}>
              <div className="ficha-grupo-topo"><b>{g.titulo}</b><span>{g.ajuda}</span></div>
              {linhas.length > 0 && (
                <div className="ficha-linha cab"><span>Descrição</span><span>Qtd.</span><span>Unid.</span><span>Valor (R$)</span><span>Total</span><i /></div>
              )}
              {linhas.map(({ it, i }) => {
                const s = achar(it.descricao);
                return (
                <div key={i}>
                <div className="ficha-linha">
                  <input className="fx-in" list={g.tipo === "mao_de_obra" ? undefined : "insumos-ficha"} value={it.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} placeholder={g.exemplo} aria-label="Descrição" />
                  <input className="fx-in valor" inputMode="decimal" value={it.quantidade} onChange={(e) => mudar(i, "quantidade", e.target.value)} aria-label="Quantidade" />
                  <input className="fx-in" value={it.unidade} onChange={(e) => mudar(i, "unidade", e.target.value)} aria-label="Unidade" />
                  <input className="fx-in valor" inputMode="decimal" value={it.valor_unitario} onChange={(e) => mudar(i, "valor_unitario", e.target.value)} placeholder="0,00" aria-label="Valor unitário" />
                  <b className="ficha-total">{brl(totalItem(it))}</b>
                  <button type="button" className="fx-tirar" onClick={() => setItens((l) => l.filter((_, j) => j !== i))} aria-label="Tirar item"><Icone nome="fechar" tamanho={16} /></button>
                </div>
                {s?.ultimo_preco != null && (
                  <small className="nota-dica">Última nota: {brl(Number(s.ultimo_preco))} por {s.unidade}{s.ultimo_preco_em ? ` em ${s.ultimo_preco_em.split("-").reverse().join("/")}` : ""}
                    {num(it.valor_unitario) !== Number(s.ultimo_preco) && <> · <button type="button" className="botao-link" onClick={() => mudar(i, "valor_unitario", String(Number(s.ultimo_preco)).replace(".", ","))}>usar esse preço</button></>}
                  </small>
                )}
                </div>
                );
              })}
              <div className="ficha-grupo-pe">
                <button type="button" className="botao leve pequeno" onClick={() => setItens((l) => [...l, novoItem(g.tipo)])}><Icone nome="mais" />Adicionar</button>
                <span>{brl(custoDe(g.tipo))}</span>
              </div>
            </div>
          );
        })}
        <div className="fx-subtotal"><span>Custo de uma peça</span><span>{brl(custo)}</span></div>
        {veioDoPadrao && <p className="nota-dica" style={{ marginTop: 10 }}>Mão de obra e outros custos vieram do seu padrão. Mude o que for diferente neste modelo.</p>}
        <label className="guardar-padrao">
          <input type="checkbox" name="salvar_padrao" value="1" defaultChecked={!temPadrao} />
          <span><b>{temPadrao ? "Atualizar o padrão" : "Guardar como padrão"}</b> com a mão de obra e os outros custos desta ficha. Eles vão vir preenchidos em toda precificação nova (dá para mudar em cada uma).</span>
        </label>
      </div>

      <div className="bloco-janela" id="b-percentuais">
        <h3>2. Impostos, taxas e lucro</h3>
        <p>Porcentagens que saem do preço de venda. Já vêm com os seus percentuais padrão.</p>
        <div className="ficha-taxas">
          {ROTULO_TAXA.map(([chave, rotulo, ajuda]) => (
            <label key={chave}>
              <span>{rotulo}</span>
              <div className="ficha-pct"><input className="fx-in valor" name={chave} inputMode="decimal" value={taxas[chave]} onChange={(e) => setTaxas((t) => ({ ...t, [chave]: e.target.value }))} /><i>%</i></div>
              <small>{ajuda}</small>
            </label>
          ))}
        </div>
        {soma >= 100
          ? <p className="aviso erro" role="alert" style={{ marginTop: 12 }}><Icone nome="alerta" />A soma ({pct(soma)}) precisa ficar abaixo de 100%.</p>
          : <div className="fx-subtotal"><span>Total que sai do preço</span><span>{pct(soma)}</span></div>}
      </div>

      <div className="bloco-janela" id="b-preco">
        <h3>3. Preço de venda</h3>
        <p>O preço sugerido paga o custo da peça, os impostos e as taxas, e ainda deixa o lucro que você quer. Você decide o preço final.</p>
        <div className="ficha-sugestao">
          <div><span>Custo da peça</span><b>{brl(custo)}</b></div>
          <div><span>Impostos, taxas e lucro</span><b>{pct(soma)}</b><small>do preço de venda</small></div>
          <div className="destaque"><span>Preço sugerido</span><b>{sugerido != null ? brl(sugerido) : "—"}</b><small>com {pct(num(taxas.lucro_desejado))} de lucro</small></div>
        </div>
        <div className="ficha-preco">
          <label>
            <span>Preço de venda (R$)</span>
            <input className="fx-in valor grande" name="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={sugerido != null ? sugerido.toFixed(2).replace(".", ",") : "0,00"} />
            {sugerido != null && <button type="button" className="botao-link" onClick={() => setPreco(sugerido.toFixed(2).replace(".", ","))}>Usar o sugerido ({brl(sugerido)})</button>}
          </label>
          <div className={`resultado ${margem != null && margem < num(taxas.lucro_desejado) ? (margem < 0 ? "ruim" : "atencao") : "bom"}`}>
            <span>Sobra limpa por peça vendida</span>
            <strong>{margem != null ? brl(precoNum * (1 - somaTaxas / 100) - custo) : "—"}</strong>
            <small>{margem != null ? `${pct(Math.round(margem * 10) / 10)} do preço · é o seu lucro de verdade` : "informe o preço"}</small>
          </div>
        </div>
        {precoNum > 0 && (
          <div className="conta-preco">
            <b>A conta de uma peça vendida por {brl(precoNum)}</b>
            <ul>
              <li><span>Preço de venda</span><span>{brl(precoNum)}</span></li>
              {ROTULO_TAXA.filter(([k]) => k !== "lucro_desejado" && num(taxas[k]) > 0).map(([k, rotulo]) => (
                <li key={k} className="menos"><span>− {rotulo} ({pct(num(taxas[k]))})</span><span>{brl(precoNum * num(taxas[k]) / 100)}</span></li>
              ))}
              <li className="menos"><span>− Custo da peça</span><span>{brl(custo)}</span></li>
              <li className="sobra"><span>= Sobra limpa (lucro)</span><span>{brl(precoNum * (1 - somaTaxas / 100) - custo)}</span></li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

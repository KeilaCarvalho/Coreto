"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CancelarJanela } from "@/components/janela-lateral";
import { liquidoDaPeca, proximoDia7, totalRetirada } from "@/lib/retiradas";
import { registrarRetirada } from "@/app/(sistema)/pessoas/retiradas/acoes";

type Pessoa = { id: string; nome: string; desconto: number };
type Peca = { descricao: string; preco: string; modo: string; outro: string; custo: string };
type Abat = { descricao: string; valor: string };

const num = (t: string) => {
  const s = String(t ?? "").replace(/R\$|\s/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pecaVazia = (modo: string): Peca => ({ descricao: "", preco: "", modo, outro: "", custo: "" });

/** Nova retirada: peças com desconto (30%, 50%, preço de custo…), abatimentos e parcelas no dia 7. */
export function FormRetirada({ pessoas, hoje }: { pessoas: Pessoa[]; hoje: string }) {
  const [pessoa, setPessoa] = useState("");
  const padrao = (id: string) => String(Math.round((pessoas.find((p) => p.id === id)?.desconto ?? 0.3) * 100));
  const [data, setData] = useState(hoje);
  const [pecas, setPecas] = useState<Peca[]>([pecaVazia("30")]);
  const [abats, setAbats] = useState<Abat[]>([]);
  const [extra, setExtra] = useState("0");
  const [combinado, setCombinado] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [venc, setVenc] = useState(proximoDia7(hoje));
  const [obs, setObs] = useState("");

  const desconto = (p: Peca) => (p.modo === "custo" ? null : (p.modo === "outro" ? num(p.outro) : Number(p.modo)) / 100);
  const itens = pecas.filter((p) => p.descricao.trim() || num(p.preco)).map((p) => {
    const d = desconto(p);
    return { descricao: p.descricao.trim(), preco: num(p.preco), desconto: d, liquido: liquidoDaPeca(num(p.preco), d, num(p.custo)) };
  });
  const abatimentos = abats.filter((a) => a.descricao.trim() || num(a.valor)).map((a) => ({ descricao: a.descricao.trim(), valor: num(a.valor) }));
  const conta = totalRetirada({ itens, abatimentos, desconto_extra: num(extra) / 100, total_combinado: combinado.trim() ? num(combinado) : null });
  const n = Math.max(0, Math.floor(num(parcelas)));
  const pacote = JSON.stringify({
    pessoa_id: pessoa, data, itens, abatimentos, desconto_extra: num(extra) / 100, total_combinado: combinado.trim() ? num(combinado) : null,
    observacao: obs, parcelas: n, primeiro_vencimento: n > 0 ? venc : null,
  });
  const mudar = (i: number, m: Partial<Peca>) => setPecas(pecas.map((p, j) => (j === i ? { ...p, ...m } : p)));

  return (
    <FormAcao acao={registrarRetirada}>
      <input type="hidden" name="dados" value={pacote} />
      <div className="bloco-janela">
        <div className="campos duas">
          <div className="campo">
            <label htmlFor="rt-pessoa">Quem retirou</label>
            <select id="rt-pessoa" value={pessoa} required onChange={(e) => { setPessoa(e.target.value); const d = padrao(e.target.value); setPecas(pecas.map((p) => (p.modo === "custo" ? p : { ...p, modo: ["30", "50"].includes(d) ? d : "outro", outro: d }))); }}>
              <option value="" disabled>Escolha</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="campo"><label htmlFor="rt-data">Dia da retirada</label><input id="rt-data" type="date" value={data} max={hoje} onChange={(e) => { setData(e.target.value); setVenc(proximoDia7(e.target.value || hoje)); }} required /></div>
        </div>
      </div>

      <div className="bloco-janela">
        <h3>Peças</h3>
        <p>Preço de venda e o desconto da colaboradora. Cinto costuma sair a preço de custo.</p>
        <div className="rt-pecas">
          {pecas.map((p, i) => (
            <div className="rt-peca" key={i}>
              <input className="fx-in" value={p.descricao} placeholder="Peça, cor e tamanho" aria-label="Peça" onChange={(e) => mudar(i, { descricao: e.target.value })} />
              <input className="fx-in valor" value={p.preco} inputMode="decimal" placeholder="Preço" aria-label="Preço de venda" onChange={(e) => mudar(i, { preco: e.target.value })} />
              <select className="fx-in" value={p.modo} aria-label="Desconto" onChange={(e) => mudar(i, { modo: e.target.value })}>
                <option value="30">30%</option><option value="50">50%</option><option value="0">Sem desconto</option>
                <option value="outro">Outro %</option><option value="custo">Preço de custo</option>
              </select>
              {p.modo === "outro" && <input className="fx-in valor" value={p.outro} inputMode="decimal" placeholder="%" aria-label="Desconto %" onChange={(e) => mudar(i, { outro: e.target.value })} />}
              {p.modo === "custo" && <input className="fx-in valor" value={p.custo} inputMode="decimal" placeholder="Custo" aria-label="Preço de custo" onChange={(e) => mudar(i, { custo: e.target.value })} />}
              <span className="rt-liquido">{brl(liquidoDaPeca(num(p.preco), desconto(p), num(p.custo)))}</span>
              <button type="button" className="fx-tirar" aria-label="Tirar peça" onClick={() => setPecas(pecas.filter((_, j) => j !== i))}><Icone nome="fechar" tamanho={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => setPecas([...pecas, pecaVazia(pessoa ? (["30", "50"].includes(padrao(pessoa)) ? padrao(pessoa) : "outro") : "30")])}><Icone nome="mais" />Adicionar peça</button>
        <div className="fx-subtotal"><span>Peças com desconto</span><span>{brl(conta.pecas)}</span></div>
      </div>

      <div className="bloco-janela">
        <h3>Abatimentos</h3>
        <p>Prêmio, bonificação de aniversário, presente… Sai do total.</p>
        {abats.map((a, i) => (
          <div className="rt-abat" key={i}>
            <input className="fx-in" value={a.descricao} placeholder="Ex.: prêmio semanal" aria-label="Abatimento" onChange={(e) => setAbats(abats.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
            <input className="fx-in valor" value={a.valor} inputMode="decimal" placeholder="0,00" aria-label="Valor do abatimento" onChange={(e) => setAbats(abats.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            <button type="button" className="fx-tirar" aria-label="Tirar abatimento" onClick={() => setAbats(abats.filter((_, j) => j !== i))}><Icone nome="fechar" tamanho={16} /></button>
          </div>
        ))}
        <button type="button" className="botao leve pequeno" style={{ marginTop: 8 }} onClick={() => setAbats([...abats, { descricao: "", valor: "" }])}><Icone nome="mais" />Adicionar abatimento</button>
        <div className="campos duas" style={{ marginTop: 12 }}>
          <div className="campo"><label htmlFor="rt-extra">Desconto extra no total (%)</label><input id="rt-extra" value={extra} inputMode="decimal" onChange={(e) => setExtra(e.target.value)} /><span className="ajuda">Ex.: 50 quando bate a meta.</span></div>
          <div className="campo"><label htmlFor="rt-comb">Valor combinado</label><input id="rt-comb" value={combinado} inputMode="decimal" placeholder={brl(conta.calculado)} onChange={(e) => setCombinado(e.target.value)} /><span className="ajuda">Só se o acerto foi diferente da conta.</span></div>
        </div>
        <div className="fx-subtotal" style={{ background: "var(--tinta)", color: "#fff" }}><span>Total a pagar</span><span>{brl(conta.total)}</span></div>
      </div>

      <div className="bloco-janela">
        <h3>Parcelas</h3>
        <div className="campos duas">
          <div className="campo"><label htmlFor="rt-n">Quantas vezes</label><input id="rt-n" value={parcelas} inputMode="numeric" onChange={(e) => setParcelas(e.target.value)} /><span className="ajuda">{n > 0 ? `${n}x de ${brl(Math.floor((conta.total / n) * 100) / 100)}` : "0 = definir depois"}</span></div>
          {n > 0 && <div className="campo"><label htmlFor="rt-venc">Primeira parcela vence</label><input id="rt-venc" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /><span className="ajuda">As outras no mesmo dia dos meses seguintes.</span></div>}
        </div>
        <div className="campo" style={{ marginTop: 12 }}><label htmlFor="rt-obs">Anotações</label><textarea id="rt-obs" rows={2} value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} /></div>
      </div>
      <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Registrando…">Registrar retirada</BotaoEnviar></div>
    </FormAcao>
  );
}

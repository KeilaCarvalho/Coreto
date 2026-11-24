"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { conferirOp } from "@/app/(sistema)/producao/acoes";
import type { LinhaGradeOp } from "@/components/producao/grade-op";

type CorProduto = { id: string; nome: string; hex: string | null };
type Variante = { id: string; cor_id: string; tamanho: string };

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Conferência: o que a produção disse que ia entregar × o que chegou. A diferença vira pendência. */
export function ConferirOp({ op, produto, hoje }: {
  op: { id: string; numero: number | null; titulo: string; faccao: string | null; tamanhos: string[]; entrega: LinhaGradeOp[] };
  produto: { id: string; nome: string; cores: CorProduto[]; variantes: Variante[] };
  hoje: string;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [segurar, setSegurar] = useState(false);
  const [mapa, setMapa] = useState<string[]>(() =>
    op.entrega.map((l) => produto.cores.find((c) => normal(c.nome) === normal(l.cor))?.id
      ?? produto.cores.find((c) => normal(c.nome).startsWith(normal(l.cor)) || normal(l.cor).startsWith(normal(c.nome)))?.id ?? ""));
  const [chegou, setChegou] = useState<Record<string, string>>(() =>
    Object.fromEntries(op.entrega.flatMap((l, i) => op.tamanhos.filter((t) => l.q[t]).map((t) => [`${i}|${t}`, String(l.q[t])]))));

  const qtd = (i: number, t: string) => Math.max(0, Math.floor(Number(chegou[`${i}|${t}`] || 0)) || 0);
  const esperado = op.entrega.reduce((s, l) => s + op.tamanhos.reduce((x, t) => x + (Number(l.q[t]) || 0), 0), 0);
  const total = op.entrega.reduce((s, _, i) => s + op.tamanhos.reduce((x, t) => x + qtd(i, t), 0), 0);

  const calculo = useMemo(() => {
    const itens: { variante_id: string; quantidade: number }[] = [];
    const faltas: { cor: string; tamanho: string; quantidade: number; variante_id: string | null }[] = [];
    const problemas: string[] = [];
    op.entrega.forEach((l, i) => {
      for (const t of op.tamanhos) {
        const veio = qtd(i, t), disse = Number(l.q[t]) || 0;
        const variante = produto.variantes.find((v) => v.cor_id === mapa[i] && v.tamanho === t);
        if (veio > 0) {
          if (!mapa[i]) problemas.push(`Escolha a cor do catálogo para "${l.cor}".`);
          else if (!variante) problemas.push(`O modelo não tem o tamanho ${t} na cor ${produto.cores.find((c) => c.id === mapa[i])?.nome ?? l.cor}. Edite o modelo no catálogo.`);
          else itens.push({ variante_id: variante.id, quantidade: veio });
        }
        if (disse > veio) faltas.push({ cor: l.cor, tamanho: t, quantidade: disse - veio, variante_id: variante?.id ?? null });
      }
    });
    return { itens, faltas, problemas: [...new Set(problemas)] };
  }, [op, produto, mapa, chegou]); // eslint-disable-line react-hooks/exhaustive-deps

  const faltou = calculo.faltas.reduce((t, f) => t + f.quantidade, 0);

  function enviar() {
    setErro(null);
    if (calculo.problemas.length) { setErro(calculo.problemas[0]); return; }
    iniciar(async () => {
      const r = await conferirOp({ op: op.id, produto: produto.id, data, observacao, segurar: faltou > 0 && segurar, itens: calculo.itens, faltas: calculo.faltas });
      if (!r.ok) { setErro(r.erro); return; }
      router.push(`/producao/recebimentos/${r.id}?registrado=1`);
    });
  }

  return (
    <div className="conf">
      <section className="painel">
        <div className="painel-topo"><div><h2>Conferência · {produto.nome}</h2><p>Em cada tamanho já vem o que a produção disse que ia entregar. Troque pelo que chegou de verdade.</p></div></div>
        <div className="tabela-rolagem conf-rolagem">
          <table className="conf-tabela">
            <thead>
              <tr><th className="conf-cor">Cor</th>{op.tamanhos.map((t) => <th key={t}>{t}</th>)}<th>Chegou</th></tr>
            </thead>
            <tbody>
              {op.entrega.map((l, i) => {
                const doCatalogo = produto.cores.find((c) => c.id === mapa[i]);
                return (
                  <tr key={i}>
                    <td className="conf-cor">
                      <b><i className="amostra" style={{ background: doCatalogo?.hex ?? "#fff" }} />{l.cor}</b>
                      {(!doCatalogo || normal(doCatalogo.nome) !== normal(l.cor)) && (
                        <select value={mapa[i]} onChange={(e) => setMapa((m) => m.map((x, j) => (j === i ? e.target.value : x)))} className={mapa[i] ? "" : "falta-cor"} aria-label={`Cor do catálogo para ${l.cor}`}>
                          <option value="">Qual cor do catálogo?</option>
                          {produto.cores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      )}
                    </td>
                    {op.tamanhos.map((t) => {
                      const disse = Number(l.q[t]) || 0;
                      const veio = qtd(i, t);
                      return (
                        <td key={t} className={veio < disse ? "menos" : veio > disse ? "mais" : ""}>
                          <input inputMode="numeric" value={chegou[`${i}|${t}`] ?? ""} placeholder="0" aria-label={`${l.cor} ${t}: chegou`}
                            onChange={(e) => setChegou((c) => ({ ...c, [`${i}|${t}`]: e.target.value.replace(/\D/g, "") }))} />
                          <small>disse {disse}</small>
                        </td>
                      );
                    })}
                    <td className="conf-total">{op.tamanhos.reduce((x, t) => x + qtd(i, t), 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="conf-resumo">
          <span>Disse que ia entregar <b>{esperado}</b></span>
          <span>Chegou <b>{total}</b></span>
          <span className={faltou ? "faltou" : "ok"}>{faltou ? <>Faltou <b>{faltou}</b></> : "Veio tudo certo"}</span>
        </div>
      </section>

      {faltou > 0 && (
        <section className="painel">
          <div className="painel-topo"><div><h2>Ficam pendentes</h2><p>Aparecem em Pendências da facção para você e para a produção.</p></div></div>
          <ul className="conf-faltas">
            {calculo.faltas.map((f, i) => <li key={i}><span>{f.cor}</span><b>{f.tamanho}</b><em>{f.quantidade} {f.quantidade === 1 ? "peça" : "peças"}</em></li>)}
          </ul>
          <div className="escolha-liberar conf-decisao" role="radiogroup" aria-label="O que fazer com o lote">
            <button type="button" role="radio" aria-checked={!segurar} className={!segurar ? "marcada" : ""} onClick={() => setSegurar(false)}><b>Seguir com o que veio</b>As {total} peças seguem para precificar e liberar. O que faltou fica pendente.</button>
            <button type="button" role="radio" aria-checked={segurar} className={segurar ? "marcada" : ""} onClick={() => setSegurar(true)}><b>Segurar o lote</b>Nada deste lote vai para a loja até a pendência ser resolvida.</button>
          </div>
        </section>
      )}

      <section className="painel">
        <div className="painel-corpo campos duas" style={{ paddingTop: 18 }}>
          <div className="campo"><label htmlFor="conf-data">Data da chegada</label><input id="conf-data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} /></div>
          <div className="campo"><label htmlFor="conf-obs">Observação</label><input id="conf-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" /></div>
        </div>
      </section>

      {(erro || calculo.problemas.length > 0) && <p className="aviso erro" role="alert"><Icone nome="alerta" />{erro ?? calculo.problemas[0]}</p>}
      <div className="conf-rodape">
        <button type="button" className="botao secundario" onClick={() => router.back()}>Voltar</button>
        <button type="button" className="botao" disabled={enviando || !total} onClick={enviar}>{enviando ? "Registrando…" : `Registrar chegada de ${total} peças`}</button>
      </div>
    </div>
  );
}

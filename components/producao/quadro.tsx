"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { arquivarOp, moverOp, salvarOp } from "@/app/(sistema)/producao/quadro/acoes";

export type Coluna = { id: string; nome: string; ordem: number; cor: string | null; final: boolean };
export type Op = {
  id: string; numero: number | null; titulo: string; tecido: string | null; faccao: string | null; quantidade: number | null;
  prazo: string | null; etiqueta: string | null; observacao: string | null; coluna_id: string; ordem: number; movido_em: string; criado_em: string;
};

const ETIQUETAS: { id: string; nome: string; cor: string }[] = [
  { id: "amarelo", nome: "Amarelo", cor: "#f5b400" },
  { id: "verde", nome: "Verde", cor: "#22a06b" },
  { id: "vermelho", nome: "Vermelho", cor: "#e2483d" },
  { id: "azul", nome: "Azul", cor: "#2f7cf6" },
  { id: "roxo", nome: "Roxo", cor: "#8f5cf7" },
  { id: "rosa", nome: "Rosa", cor: "#e956a8" },
];
const corEtiqueta = (id: string | null) => ETIQUETAS.find((e) => e.id === id)?.cor;
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function haQuanto(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}
const nomeOp = (o: Pick<Op, "numero" | "titulo">) => (o.numero != null ? `OP ${o.numero} · ${o.titulo}` : o.titulo);

type Rascunho = Omit<Op, "id" | "ordem" | "movido_em" | "criado_em"> & { id?: string };

export function Quadro({ colunas, ops: inicial, podeCriar, podeEditar, podeArquivar }: {
  colunas: Coluna[]; ops: Op[]; podeCriar: boolean; podeEditar: boolean; podeArquivar: boolean;
}) {
  const [ops, setOps] = useState(inicial);
  useEffect(() => setOps(inicial), [inicial]);
  const [busca, setBusca] = useState("");
  const [colunaCel, setColunaCel] = useState(colunas[0]?.id ?? "");
  const [aberto, setAberto] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 2600); return () => window.clearTimeout(t); }, [aviso]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ coluna: string; antes: string | null } | null>(null);
  const [, iniciar] = useTransition();

  const termo = busca.trim().toLowerCase();
  const porColuna = useMemo(() => {
    const m = new Map<string, Op[]>(colunas.map((c) => [c.id, []]));
    for (const o of [...ops].sort((a, b) => a.ordem - b.ordem)) {
      if (termo && !`${o.numero ?? ""} ${o.titulo} ${o.tecido ?? ""} ${o.faccao ?? ""}`.toLowerCase().includes(termo)) continue;
      m.get(o.coluna_id)?.push(o);
    }
    return m;
  }, [ops, colunas, termo]);
  const proximoNumero = Math.max(0, ...ops.map((o) => o.numero ?? 0)) + 1;

  function mover(id: string, coluna: string, antes: string | null) {
    const lista = ops.filter((o) => o.coluna_id === coluna && o.id !== id).sort((a, b) => a.ordem - b.ordem);
    const i = antes ? lista.findIndex((o) => o.id === antes) : lista.length;
    const anterior = i > 0 ? lista[i - 1].ordem : (lista[0]?.ordem ?? 1000) - 1000;
    const seguinte = i >= 0 && i < lista.length ? lista[i].ordem : anterior + 2000;
    const ordem = (anterior + seguinte) / 2;
    const atual = ops.find((o) => o.id === id);
    if (!atual || (atual.coluna_id === coluna && atual.ordem === ordem)) return;
    const antesDeMover = ops;
    setOps((l) => l.map((o) => (o.id === id ? { ...o, coluna_id: coluna, ordem, movido_em: o.coluna_id !== coluna ? new Date().toISOString() : o.movido_em } : o)));
    iniciar(async () => {
      const r = await moverOp(id, coluna, ordem);
      if (!r.ok) { setOps(antesDeMover); setErro(r.erro); }
    });
  }

  // Arrastar com o mouse (ou caneta): o cartão segue o ponteiro e mostra onde vai cair.
  const soltouAgora = useRef(false);
  const fantasma = useRef<HTMLElement | null>(null);
  function comecar(e: React.PointerEvent<HTMLElement>, o: Op) {
    if (!podeEditar || e.button !== 0 || e.pointerType === "touch") return;
    const origem = e.currentTarget;
    const x0 = e.clientX, y0 = e.clientY;
    const caixa = origem.getBoundingClientRect();
    let ativo = false;
    let destino: { coluna: string; antes: string | null } | null = null;
    const rolagem = origem.closest(".qd-colunas") as HTMLElement | null;
    let rolar = 0;
    const timer = window.setInterval(() => { if (rolar && rolagem) rolagem.scrollLeft += rolar; }, 16);
    const mexe = (ev: PointerEvent) => {
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ativo = true;
        setArrastando(o.id);
        const f = origem.cloneNode(true) as HTMLElement;
        f.classList.add("qd-fantasma");
        f.style.width = `${caixa.width}px`;
        document.body.appendChild(f);
        fantasma.current = f;
        document.body.classList.add("qd-arrastando");
      }
      const f = fantasma.current!;
      f.style.transform = `translate(${ev.clientX - (x0 - caixa.left)}px, ${ev.clientY - (y0 - caixa.top)}px) rotate(2deg)`;
      if (rolagem) { const r = rolagem.getBoundingClientRect(); rolar = ev.clientX > r.right - 60 ? 14 : ev.clientX < r.left + 60 ? -14 : 0; }
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const col = el?.closest<HTMLElement>("[data-coluna]");
      if (!col) { destino = null; setAlvo(null); return; }
      const cartoes = [...col.querySelectorAll<HTMLElement>("[data-op]")].filter((c) => c.dataset.op !== o.id);
      const depois = cartoes.find((c) => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      destino = { coluna: col.dataset.coluna!, antes: depois?.dataset.op ?? null };
      setAlvo(destino);
    };
    const fim = () => {
      window.removeEventListener("pointermove", mexe);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.clearInterval(timer);
      fantasma.current?.remove(); fantasma.current = null;
      document.body.classList.remove("qd-arrastando");
      if (ativo) {
        soltouAgora.current = true;
        window.setTimeout(() => { soltouAgora.current = false; }, 50);
        if (destino) mover(o.id, destino.coluna, destino.antes);
      }
      setArrastando(null); setAlvo(null);
    };
    window.addEventListener("pointermove", mexe);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  }

  function novo(coluna: string) {
    setAberto({ numero: proximoNumero, titulo: "", tecido: null, faccao: null, quantidade: null, prazo: null, etiqueta: null, observacao: null, coluna_id: coluna });
  }

  const colunaAtualCel = colunas.find((c) => c.id === colunaCel) ?? colunas[0];

  return (
    <div className="qd">
      <header className="qd-topo">
        <div>
          <h1>Quadro de produção</h1>
          <p>{ops.length} {ops.length === 1 ? "ordem" : "ordens"} de produção<span className="so-pc"> · arraste os cartões entre as etapas</span><span className="so-cel"> · toque no cartão para mover</span></p>
        </div>
        <div className="qd-acoes">
          <label className="qd-busca"><Icone nome="busca" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OP, modelo, tecido…" aria-label="Buscar" /></label>
          {podeCriar && <button type="button" className="botao" onClick={() => novo(colunas[0].id)}><Icone nome="mais" />Nova OP</button>}
        </div>
      </header>

      {erro && <p className="aviso erro" role="alert" onClick={() => setErro(null)}><Icone nome="alerta" />{erro}</p>}

      {/* Celular: uma etapa por vez, escolhida nas abas */}
      <nav className="qd-abas" aria-label="Etapas">
        {colunas.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === colunaAtualCel?.id} onClick={() => setColunaCel(c.id)}>
            <i style={{ background: c.cor ?? "var(--marca)" }} />{c.nome}<b>{porColuna.get(c.id)?.length ?? 0}</b>
          </button>
        ))}
      </nav>

      <div className="qd-colunas">
        {colunas.map((c) => {
          const lista = porColuna.get(c.id) ?? [];
          return (
            <section
              key={c.id}
              className={`qd-coluna${c.id === colunaAtualCel?.id ? " atual" : ""}${alvo?.coluna === c.id && arrastando ? " alvo" : ""}`}
              data-coluna={c.id}
            >
              <div className="qd-coluna-topo">
                <span><i style={{ background: c.cor ?? "var(--marca)" }} />{c.nome}</span>
                <b>{lista.length}</b>
              </div>
              <div className="qd-lista">
                {lista.map((o) => {
                  const atrasada = o.prazo && !c.final && o.prazo < hojeISO();
                  return (
                    <article
                      key={o.id}
                      className={`qd-cartao${arrastando === o.id ? " arrastando" : ""}${alvo?.antes === o.id ? " antes" : ""}`}
                      data-op={o.id}
                      data-arrasta={podeEditar ? "1" : undefined}
                      onPointerDown={(e) => comecar(e, o)}
                      onClick={() => { if (!soltouAgora.current) setAberto({ ...o }); }}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setAberto({ ...o }); }}
                    >
                      {o.etiqueta && <span className="qd-etiqueta" style={{ background: corEtiqueta(o.etiqueta) }} />}
                      <div className="qd-cartao-num">{o.numero != null ? `OP ${o.numero}` : "Sem número"}<span>{haQuanto(o.movido_em)}</span></div>
                      <h3>{o.titulo}</h3>
                      <div className="qd-cartao-info">
                        {o.tecido && <span className="qd-chip">{o.tecido}</span>}
                        {o.quantidade != null && <span className="qd-chip">{o.quantidade} pç</span>}
                        {o.faccao && <span className="qd-chip leve"><Icone nome="faccao" tamanho={12} />{o.faccao}</span>}
                        {o.prazo && <span className={`qd-chip${atrasada ? " atraso" : " leve"}`}><Icone nome="calendario" tamanho={12} />{dataCurta(o.prazo)}</span>}
                        {o.observacao && <span className="qd-chip leve" title="Tem observação"><Icone nome="ficha" tamanho={12} /></span>}
                      </div>
                    </article>
                  );
                })}
                {alvo?.coluna === c.id && alvo.antes === null && arrastando && <div className="qd-marca-fim" />}
                {!lista.length && !arrastando && <p className="qd-vazio">{termo ? "Nada encontrado aqui" : "Nenhuma OP nesta etapa"}</p>}
              </div>
              {podeCriar && <button type="button" className="qd-adicionar" onClick={() => novo(c.id)}><Icone nome="mais" />Adicionar OP</button>}
            </section>
          );
        })}
      </div>

      {aviso && <div className="qd-aviso" role="status"><Icone nome="certo" />{aviso}</div>}

      {aberto && (
        <JanelaOp
          rascunho={aberto}
          colunas={colunas}
          podeEditar={aberto.id ? podeEditar : podeCriar}
          podeMover={podeEditar && !!aberto.id}
          podeArquivar={podeArquivar && !!aberto.id}
          fechar={() => setAberto(null)}
          aoSalvar={(op, pedido) => {
            const antes = ops;
            setOps((l) => (l.some((x) => x.id === op.id) ? l.map((x) => (x.id === op.id ? { ...x, ...op } : x)) : [...l, op]));
            setAviso(antes.some((x) => x.id === op.id) ? "OP salva" : "OP criada");
            pedido.then((res) => {
              if (!res.ok) { setOps(antes); setErro(res.erro); return; }
              if (res.id && res.id !== op.id) setOps((l) => l.map((x) => (x.id === op.id ? { ...x, id: res.id! } : x)));
            });
          }}
          aoMover={(id, coluna) => { mover(id, coluna, null); setAberto(null); setAviso(`Movida para ${colunas.find((c) => c.id === coluna)?.nome ?? coluna}`); }}
          aoArquivar={(id) => setOps((l) => l.filter((x) => x.id !== id))}
        />
      )}
    </div>
  );
}

function JanelaOp({ rascunho, colunas, podeEditar, podeMover, podeArquivar, fechar, aoSalvar, aoMover, aoArquivar }: {
  rascunho: Rascunho; colunas: Coluna[]; podeEditar: boolean; podeMover: boolean; podeArquivar: boolean;
  fechar: () => void; aoSalvar: (op: Op, pedido: ReturnType<typeof salvarOp>) => void; aoMover: (id: string, coluna: string) => void; aoArquivar: (id: string) => void;
}) {
  const [r, setR] = useState(rascunho);
  const [erro, setErro] = useState<string | null>(null);
  const salvando = false;
  const [confirmar, setConfirmar] = useState(false);
  const primeiro = useRef<HTMLInputElement>(null);
  const novo = !r.id;
  const coluna = colunas.find((c) => c.id === r.coluna_id);

  useEffect(() => {
    if (novo) primeiro.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muda = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));
  const texto = (v: string) => (v.trim() ? v : null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEditar) return fechar();
    if (!r.titulo.trim()) { setErro("Escreva o modelo."); return; }
    // Fecha na hora e mostra o cartão; o servidor confirma por trás (se der erro, aparece o aviso).
    const agora = new Date().toISOString();
    const temp = r.id ?? `novo-${Date.now()}`;
    aoSalvar({ ...(r as Op), id: temp, ordem: (r as Op).ordem ?? Number.MAX_SAFE_INTEGER, movido_em: (r as Op).movido_em ?? agora, criado_em: (r as Op).criado_em ?? agora }, salvarOp(r));
    fechar();
  }

  return (
    <div className="fx-janela-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <form className="fx-janela qd-janela" role="dialog" aria-modal="true" aria-label={novo ? "Nova OP" : nomeOp(r)} onSubmit={salvar}>
        <div className="fx-janela-topo">
          <div>
            <h2>{novo ? "Nova ordem de produção" : nomeOp(r)}</h2>
            <p><i className="qd-ponto" style={{ background: coluna?.cor ?? "var(--marca)" }} />{coluna?.nome}</p>
          </div>
          <button type="button" className="icone-botao" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        <div className="fx-janela-corpo janela-generica">
          {erro && <p className="aviso erro" role="alert"><Icone nome="alerta" />{erro}</p>}

          {podeMover && (
            <div className="qd-mover">
              <span>Mover para</span>
              <div>
                {colunas.map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === r.coluna_id} disabled={c.id === r.coluna_id}
                    onClick={() => { aoMover(r.id!, c.id); muda("coluna_id", c.id); }}>
                    <i style={{ background: c.cor ?? "var(--marca)" }} />{c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <fieldset disabled={!podeEditar} className="qd-campos">
            <div className="campos duas">
              <div className="campo"><label htmlFor="op-num">Nº da OP</label><input id="op-num" inputMode="numeric" value={r.numero ?? ""} onChange={(e) => muda("numero", e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null)} /></div>
              <div className="campo"><label htmlFor="op-qtd">Quantidade</label><input id="op-qtd" inputMode="numeric" value={r.quantidade ?? ""} placeholder="Peças" onChange={(e) => muda("quantidade", e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null)} /></div>
            </div>
            <div className="campo"><label htmlFor="op-titulo">Modelo</label><input id="op-titulo" ref={primeiro} value={r.titulo} onChange={(e) => muda("titulo", e.target.value)} placeholder="Ex.: Vestido Mabelle" required /></div>
            <div className="campos duas">
              <div className="campo"><label htmlFor="op-tecido">Tecido</label><input id="op-tecido" value={r.tecido ?? ""} onChange={(e) => muda("tecido", texto(e.target.value))} placeholder="Ex.: Linho" /></div>
              <div className="campo"><label htmlFor="op-faccao">Facção</label><input id="op-faccao" value={r.faccao ?? ""} onChange={(e) => muda("faccao", texto(e.target.value))} placeholder="Opcional" /></div>
            </div>
            <div className="campos duas">
              <div className="campo"><label htmlFor="op-prazo">Prazo</label><input id="op-prazo" type="date" value={r.prazo ?? ""} onChange={(e) => muda("prazo", e.target.value || null)} /></div>
              <div className="campo">
                <span className="rotulo-campo">Etiqueta</span>
                <div className="qd-cores" role="radiogroup" aria-label="Etiqueta">
                  <button type="button" role="radio" aria-checked={!r.etiqueta} className="sem" onClick={() => muda("etiqueta", null)} title="Sem etiqueta"><Icone nome="fechar" tamanho={12} /></button>
                  {ETIQUETAS.map((e) => <button key={e.id} type="button" role="radio" aria-checked={r.etiqueta === e.id} title={e.nome} style={{ background: e.cor }} onClick={() => muda("etiqueta", e.id)} />)}
                </div>
              </div>
            </div>
            <div className="campo"><label htmlFor="op-obs">Observação</label><textarea id="op-obs" rows={4} value={r.observacao ?? ""} onChange={(e) => muda("observacao", texto(e.target.value))} placeholder="Detalhes, pendências, o que falta…" /></div>
          </fieldset>

          <div className="qd-rodape">
            {podeArquivar && (confirmar
              ? <span className="qd-confirma">Tirar do quadro? <button type="button" className="botao perigo pequeno" onClick={async () => { const res = await arquivarOp(r.id!); if (!res.ok) { setErro(res.erro); return; } aoArquivar(r.id!); fechar(); }}>Arquivar</button><button type="button" className="botao leve pequeno" onClick={() => setConfirmar(false)}>Não</button></span>
              : <button type="button" className="botao leve pequeno" onClick={() => setConfirmar(true)}>Arquivar OP</button>)}
            <span style={{ flex: 1 }} />
            <button type="button" className="botao secundario" onClick={fechar}>{podeEditar ? "Cancelar" : "Fechar"}</button>
            {podeEditar && <button type="submit" className="botao" disabled={salvando}>{salvando ? "Salvando…" : novo ? "Criar OP" : "Salvar"}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { AREAS, ATALHOS, DIAS_SEMANA, PRIORIDADES, STATUS, type Tarefa } from "@/lib/tarefas";

type Inicial = Partial<Tarefa>;

function lerRepete(r: string | null | undefined) {
  if (!r) return { modo: "dias_uteis", dia: "1" };
  const [modo, dia] = r.split(":");
  return { modo, dia: dia ?? (modo === "mensal" ? "5" : "1") };
}

/** Campos da janela de tarefa: o que fazer, área, prioridade, quando, se repete, passos e anotações. */
export function CamposTarefa({ inicial, hoje }: { inicial: Inicial; hoje: string }) {
  const [prioridade, setPrioridade] = useState(inicial.prioridade ?? "normal");
  const [tipo, setTipo] = useState(inicial.repete ? "rotina" : "uma");
  const [rep, setRep] = useState(lerRepete(inicial.repete));
  const [status, setStatus] = useState(inicial.status ?? "a_fazer");
  const [passos, setPassos] = useState(inicial.checklist ?? []);
  const [novoPasso, setNovoPasso] = useState("");
  const repete = rep.modo === "semanal" || rep.modo === "mensal" ? `${rep.modo}:${rep.dia}` : rep.modo;
  const passosLimpos = passos.filter((p) => p.texto.trim());

  const addPasso = () => {
    const t = novoPasso.trim();
    if (!t) return;
    setPassos([...passos, { texto: t, feito: false }]);
    setNovoPasso("");
  };

  return (
    <>
      <input type="hidden" name="prioridade" value={prioridade} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="repete" value={tipo === "rotina" ? repete : ""} />
      <input type="hidden" name="checklist" value={JSON.stringify(passosLimpos)} />

      <div className="bloco-janela">
        <div className="campo">
          <label htmlFor="tf-titulo">O que precisa ser feito</label>
          <input id="tf-titulo" name="titulo" defaultValue={inicial.titulo ?? ""} required maxLength={200} autoFocus={!inicial.id}
            placeholder="Ex.: mandar o fluxo para a Deborah" />
        </div>
        <div className="campos duas" style={{ marginTop: 14 }}>
          <div className="campo">
            <label htmlFor="tf-area">Área</label>
            <select id="tf-area" name="area" defaultValue={inicial.area ?? "geral"}>
              {AREAS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tf-status">Coluna</label>
            <select id="tf-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.filter((s) => tipo === "uma" || s.valor !== "feito").map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
          </div>
        </div>
        {status === "esperando" && (
          <div className="campo" style={{ marginTop: 14 }}>
            <label htmlFor="tf-quem">Esperando quem?</label>
            <input id="tf-quem" name="esperando_quem" defaultValue={inicial.esperando_quem ?? ""} maxLength={120} placeholder="Ex.: a facção, a contabilidade, a Deborah" />
          </div>
        )}
        <div className="campo" style={{ marginTop: 14 }}>
          <span className="rotulo">Prioridade</span>
          <div className="chips" style={{ marginTop: 0 }}>
            {PRIORIDADES.map((p) => (
              <button key={p.valor} type="button" className={`chip${prioridade === p.valor ? " marcada" : ""}`} aria-pressed={prioridade === p.valor} onClick={() => setPrioridade(p.valor)}>{p.rotulo}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="bloco-janela">
        <h3>Quando</h3>
        <div className="escolha-liberar" role="radiogroup" aria-label="Tipo de tarefa">
          <button type="button" role="radio" aria-checked={tipo === "uma"} className={tipo === "uma" ? "marcada" : ""} onClick={() => setTipo("uma")}><b>Uma vez só</b>Some do dia depois de feita.</button>
          <button type="button" role="radio" aria-checked={tipo === "rotina"} className={tipo === "rotina" ? "marcada" : ""} onClick={() => { setTipo("rotina"); if (status === "feito" || status === "ideia") setStatus("a_fazer"); }}><b>Rotina, se repete</b>Depois de feita, volta sozinha na próxima data.</button>
        </div>
        <div className="campos duas">
          <div className="campo">
            <label htmlFor="tf-data">{tipo === "rotina" ? "Próxima vez" : "Dia"}</label>
            <input id="tf-data" name="data" type="date" defaultValue={inicial.data ?? (tipo === "rotina" || !inicial.id ? hoje : "")} required={tipo === "rotina"} />
            {tipo === "uma" && <span className="ajuda">Deixe em branco se não tem dia certo.</span>}
          </div>
          {tipo === "rotina" && (
            <div className="campo">
              <label htmlFor="tf-repete">Repete</label>
              <select id="tf-repete" value={rep.modo} onChange={(e) => setRep({ modo: e.target.value, dia: e.target.value === "mensal" ? "5" : "1" })}>
                <option value="dias_uteis">Todo dia útil (seg a sex)</option>
                <option value="diaria">Todo dia</option>
                <option value="semanal">Toda semana</option>
                <option value="mensal">Todo mês</option>
              </select>
              {rep.modo === "semanal" && (
                <select aria-label="Dia da semana" value={rep.dia} onChange={(e) => setRep({ ...rep, dia: e.target.value })} style={{ marginTop: 8 }}>
                  {DIAS_SEMANA.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                </select>
              )}
              {rep.modo === "mensal" && (
                <select aria-label="Dia do mês" value={rep.dia} onChange={(e) => setRep({ ...rep, dia: e.target.value })} style={{ marginTop: 8 }}>
                  {Array.from({ length: 31 }, (_, i) => <option key={i} value={String(i + 1)}>dia {i + 1}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bloco-janela">
        <h3>Passos</h3>
        <p>Opcional. Você marca cada passo no próprio cartão.</p>
        <ul className="tf-editar-passos">
          {passos.map((p, i) => (
            <li key={i}>
              <input type="checkbox" checked={p.feito} aria-label="Feito" onChange={(e) => setPassos(passos.map((x, j) => (j === i ? { ...x, feito: e.target.checked } : x)))} />
              <input className="fx-in" value={p.texto} aria-label={`Passo ${i + 1}`} onChange={(e) => setPassos(passos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
              <button type="button" className="fx-tirar" aria-label="Tirar passo" onClick={() => setPassos(passos.filter((_, j) => j !== i))}><Icone nome="fechar" tamanho={16} /></button>
            </li>
          ))}
        </ul>
        <div className="tf-novo-passo">
          <input className="fx-in" value={novoPasso} placeholder="Novo passo e Enter" aria-label="Novo passo" onChange={(e) => setNovoPasso(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPasso(); } }} />
          <button type="button" className="botao leve pequeno" onClick={addPasso}><Icone nome="mais" />Adicionar</button>
        </div>
      </div>

      <div className="bloco-janela">
        <div className="campo">
          <label htmlFor="tf-atalho">Abrir qual tela do sistema</label>
          <select id="tf-atalho" name="atalho" defaultValue={inicial.atalho ?? ""}>
            <option value="">Nenhuma</option>
            {ATALHOS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
          </select>
          <span className="ajuda">Aparece um botão no cartão que leva direto para a tela.</span>
        </div>
        <div className="campo" style={{ marginTop: 14 }}>
          <label htmlFor="tf-notas">Anotações</label>
          <textarea id="tf-notas" name="notas" rows={4} maxLength={4000} defaultValue={inicial.notas ?? ""} placeholder="Detalhes, contatos, valores…" />
        </div>
      </div>
    </>
  );
}

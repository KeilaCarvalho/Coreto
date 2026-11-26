"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { atalho, diaCurto, type Tarefa } from "@/lib/tarefas";
import { excluirTarefaRapido, marcarPasso } from "@/app/(sistema)/tarefas/acoes";
import { BotaoFeito, useLinkTarefa } from "./cartao";

/** Linha simples de tarefa (tela Hoje): bolinha, título e só o que importa. */
export function LinhaTarefa({ t, hoje, quando }: { t: Tarefa; hoje: string; quando?: string }) {
  const link = useLinkTarefa();
  const at = atalho(t.atalho);
  const passos = t.checklist ?? [];
  const [lista, setLista] = useState(passos);
  const [abrir, setAbrir] = useState(false);
  const [, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [sumiu, setSumiu] = useState(false);
  const [excluindo, excluir] = useTransition();
  const feitos = lista.filter((p) => p.feito).length;
  const atrasada = !t.repete && t.status !== "feito" && t.data && t.data < hoje;
  const detalhes = [
    quando,
    atrasada ? `desde ${diaCurto(t.data!)}` : null,
    t.status === "esperando" ? `esperando ${t.esperando_quem || "alguém"}` : null,
  ].filter(Boolean);
  if (sumiu) return null;
  return (
    <li className={`tl-linha${t.status === "feito" ? " feita" : ""}${confirmar ? " confirmando" : ""}`} onMouseLeave={() => setConfirmar(false)}>
      <BotaoFeito tarefa={t} grande />
      <div className="tl-miolo">
        <Link className="tl-titulo" href={link(t.id)} scroll={false}>
          {t.prioridade === "alta" && t.status !== "feito" && <i className="tl-urgente" title="Prioridade alta" />}
          {t.titulo}
        </Link>
        {(detalhes.length > 0 || passos.length > 0 || t.repete) && (
          <div className="tl-meta">
            {t.repete && <span title="Rotina: volta sozinha"><Icone nome="relogio" tamanho={12} />rotina</span>}
            {detalhes.map((d) => <span key={d} className={d!.startsWith("desde") ? "atrasada" : undefined}>{d}</span>)}
            {passos.length > 0 && <button type="button" onClick={() => setAbrir((v) => !v)} aria-expanded={abrir}><Icone nome="cadastros" tamanho={12} />{feitos}/{passos.length} passos</button>}
          </div>
        )}
        {abrir && (
          <ul className="tl-passos">
            {lista.map((p, i) => (
              <li key={i}><label>
                <input type="checkbox" checked={p.feito} onChange={(e) => {
                  const feito = e.target.checked;
                  setLista(lista.map((x, j) => (j === i ? { ...x, feito } : x)));
                  iniciar(async () => { await marcarPasso(t.id, i, feito); });
                }} />
                <span>{p.texto}</span>
              </label></li>
            ))}
          </ul>
        )}
      </div>
      {at && t.status !== "feito" && !confirmar && <Link className="tl-abrir" href={at.valor} title={`Abrir ${at.rotulo}`}>{at.rotulo}<Icone nome="diagonal" tamanho={13} /></Link>}
      {confirmar ? (
        <span className="tl-confirma">
          <button type="button" className="tl-sim" disabled={excluindo} onClick={() => excluir(async () => {
            setSumiu(true);
            const r = await excluirTarefaRapido(t.id);
            if (r?.erro) { setSumiu(false); setConfirmar(false); }
          })}>{t.repete ? "Excluir rotina" : "Excluir"}</button>
          <button type="button" className="tl-nao" onClick={() => setConfirmar(false)}>Não</button>
        </span>
      ) : (
        <button type="button" className="tl-lixo" onClick={() => setConfirmar(true)} aria-label={`Excluir: ${t.titulo}`} title="Excluir"><Icone nome="lixeira" tamanho={16} /></button>
      )}
    </li>
  );
}

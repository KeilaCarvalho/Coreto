"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { STATUS, type Tarefa } from "@/lib/tarefas";
import { moverTarefa } from "@/app/(sistema)/tarefas/acoes";
import { CartaoTarefa } from "@/components/tarefas/cartao";

const ORDEM_PRIORIDADE: Record<string, number> = { alta: 0, normal: 1, baixa: 2 };

/** Quadro Kanban: arraste o cartão entre as colunas (no celular, use "Mover para"). */
export function Kanban({ tarefas, hoje, novaBase }: { tarefas: Tarefa[]; hoje: string; novaBase: string }) {
  const [lista, setLista] = useState(tarefas);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  useEffect(() => setLista(tarefas), [tarefas]);

  const mover = (id: string, novo: string) => {
    const t = lista.find((x) => x.id === id);
    if (!t || t.status === novo) return;
    setLista(lista.map((x) => (x.id === id ? { ...x, status: novo } : x)));
    iniciar(async () => {
      const r = await moverTarefa(id, novo);
      if (r?.erro) { setErro(r.erro); setLista(tarefas); }
    });
  };

  return (
    <>
      {erro && <p className="aviso erro" role="alert"><Icone nome="alerta" />{erro}</p>}
      <div className="tf-kanban">
        {STATUS.map((s) => {
          const coluna = lista
            .filter((t) => t.status === s.valor)
            .sort((a, b) => (ORDEM_PRIORIDADE[a.prioridade] ?? 1) - (ORDEM_PRIORIDADE[b.prioridade] ?? 1) || (a.data ?? "9").localeCompare(b.data ?? "9") || a.ordem - b.ordem);
          return (
            <section key={s.valor} className={`tf-coluna col-${s.valor}${sobre === s.valor ? " sobre" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setSobre(s.valor); }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => { e.preventDefault(); setSobre(null); const id = e.dataTransfer.getData("text/plain"); if (id) mover(id, s.valor); }}>
              <header>
                <h3>{s.rotulo}</h3>
                <span className="contador">{coluna.length}</span>
                {s.valor !== "feito" && <Link className="tf-mais" href={`${novaBase}&status=${s.valor}`} scroll={false} aria-label={`Nova tarefa em ${s.rotulo}`}><Icone nome="mais" tamanho={16} /></Link>}
              </header>
              <div className="tf-coluna-corpo">
                {coluna.map((t) => (
                  <div key={t.id} draggable className={`tf-arrastavel${arrastando === t.id ? " arrastando" : ""}`}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setArrastando(t.id); }}
                    onDragEnd={() => setArrastando(null)}>
                    <CartaoTarefa t={t} hoje={hoje} semFeito={s.valor === "ideia"} extra={
                      <select className="tf-mover" value={t.status} aria-label="Mover para" onChange={(e) => mover(t.id, e.target.value)}>
                        {STATUS.map((o) => <option key={o.valor} value={o.valor}>{o.valor === t.status ? "Mover para…" : o.rotulo}</option>)}
                      </select>
                    } />
                  </div>
                ))}
                {!coluna.length && <p className="tf-vazia">{s.valor === "feito" ? "O que você terminar aparece aqui." : "Arraste um cartão para cá."}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icone } from "@/components/icone";
import { area, atalho, dataAmigavel, descreverRepete, type Tarefa } from "@/lib/tarefas";
import { concluirTarefa, desfazerTarefa, marcarPasso } from "@/app/(sistema)/tarefas/acoes";

/** Link que abre a tarefa na janela lateral, mantendo a visão atual. */
export function useLinkTarefa() {
  const caminho = usePathname();
  const params = useSearchParams();
  return (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("tarefa", id);
    p.delete("aviso");
    return `${caminho}?${p}`;
  };
}

/** Bolinha de "feito": marca na hora (a tela atualiza sozinha). */
export function BotaoFeito({ tarefa, grande = false }: { tarefa: Pick<Tarefa, "id" | "titulo" | "status" | "repete">; grande?: boolean }) {
  const [enviando, iniciar] = useTransition();
  const [marcada, setMarcada] = useState(tarefa.status === "feito");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <button type="button" className={`tf-feito${marcada ? " marcada" : ""}${grande ? " grande" : ""}`} disabled={enviando}
      aria-label={marcada ? `Desfazer: ${tarefa.titulo}` : `Marcar como feita: ${tarefa.titulo}`} title={erro ?? (marcada ? "Desfazer" : "Marcar como feita")}
      onClick={() => {
        const voltar = marcada;
        setMarcada(!voltar);
        iniciar(async () => {
          const r = voltar ? await desfazerTarefa(tarefa.id, !!tarefa.repete) : await concluirTarefa(tarefa.id);
          if (r?.erro) { setMarcada(voltar); setErro(r.erro); }
        });
      }}>
      <Icone nome="certo" tamanho={grande ? 18 : 14} />
    </button>
  );
}

/** Cartão de tarefa usado em Hoje, Kanban e Lista. */
export function CartaoTarefa({ t, hoje, mostrarData = true, semFeito = false, extra }: {
  t: Tarefa; hoje: string; mostrarData?: boolean; semFeito?: boolean; extra?: React.ReactNode;
}) {
  const link = useLinkTarefa();
  const a = area(t.area);
  const passos = t.checklist ?? [];
  const feitos = passos.filter((p) => p.feito).length;
  const atrasada = t.status !== "feito" && t.data && t.data < hoje;
  const rep = descreverRepete(t.repete);
  const at = atalho(t.atalho);
  const [abrirPassos, setAbrirPassos] = useState(false);
  const [lista, setLista] = useState(passos);
  const [, iniciar] = useTransition();

  return (
    <article className={`tf-cartao${t.status === "feito" ? " feita" : ""}${t.prioridade === "alta" ? " alta" : ""}`} style={{ ["--cor-area" as string]: a.cor }}>
      {!semFeito && <BotaoFeito tarefa={t} />}
      <div className="tf-miolo">
        <Link className="tf-titulo" href={link(t.id)} scroll={false}>{t.titulo}</Link>
        <div className="tf-meta">
          <span className="tf-area"><i />{a.rotulo}</span>
          {t.prioridade === "alta" && <span className="tf-tag alta">Prioridade alta</span>}
          {mostrarData && t.data && <span className={`tf-tag${atrasada ? " atrasada" : ""}`}><Icone nome="calendario" tamanho={12} />{dataAmigavel(t.data, hoje)}</span>}
          {rep && <span className="tf-tag rotina"><Icone nome="relogio" tamanho={12} />{rep}</span>}
          {t.status === "esperando" && t.esperando_quem && <span className="tf-tag esperando">Esperando {t.esperando_quem}</span>}
          {passos.length > 0 && (
            <button type="button" className="tf-tag passos" onClick={() => setAbrirPassos((v) => !v)} aria-expanded={abrirPassos}>
              <Icone nome="cadastros" tamanho={12} />{feitos}/{passos.length}
            </button>
          )}
          {at && <Link className="tf-tag atalho" href={at.valor}><Icone nome="diagonal" tamanho={12} />{at.rotulo}</Link>}
          {extra}
        </div>
        {abrirPassos && (
          <ul className="tf-passos">
            {lista.map((p, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={p.feito} onChange={(e) => {
                    const feito = e.target.checked;
                    setLista(lista.map((x, j) => (j === i ? { ...x, feito } : x)));
                    iniciar(async () => { await marcarPasso(t.id, i, feito); });
                  }} />
                  <span>{p.texto}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

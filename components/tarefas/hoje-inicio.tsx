"use client";

import Link from "next/link";
import { Icone } from "@/components/icone";
import { BotaoFeito } from "./cartao";
import { atalho, diaCurto, type Tarefa } from "@/lib/tarefas";

/** Início: as tarefas e pendências do dia, para marcar direto daqui. */
export function TarefasDoDia({ tarefas, hoje, feitas }: { tarefas: Tarefa[]; hoje: string; feitas: number }) {
  const total = tarefas.length + feitas;
  return (
    <>
      <div className="painel-topo">
        <div><h2>Para fazer hoje</h2><p>{total ? `${feitas} de ${total} feitas` : "Suas tarefas do dia"}</p></div>
        <Link className="botao secundario pequeno" href="/tarefas">Ver tarefas</Link>
      </div>
      {total > 0 && <div className="th-progresso"><i style={{ width: `${(feitas / total) * 100}%` }} /></div>}
      {tarefas.length ? (
        <ul className="th-lista">
          {tarefas.slice(0, 8).map((t) => {
            const at = atalho(t.atalho);
            const atrasada = !t.repete && t.data && t.data < hoje;
            return (
              <li key={t.id}>
                <BotaoFeito tarefa={t} />
                <Link className="th-titulo" href={`/tarefas?tarefa=${t.id}`}>
                  {t.prioridade === "alta" && <i className="tl-urgente" />}{t.titulo}
                  {atrasada && <small>desde {diaCurto(t.data!)}</small>}
                </Link>
                {at && <Link className="th-abrir" href={at.valor} title={`Abrir ${at.rotulo}`}><Icone nome="diagonal" tamanho={14} /></Link>}
              </li>
            );
          })}
          {tarefas.length > 8 && <li className="th-mais"><Link href="/tarefas">+ {tarefas.length - 8} tarefas</Link></li>}
        </ul>
      ) : (
        <p className="th-vazio"><Icone nome="certo" tamanho={18} />{feitas ? "Tudo feito por hoje." : "Nada marcado para hoje."}</p>
      )}
    </>
  );
}

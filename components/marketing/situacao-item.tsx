"use client";

import { useActionState, useState } from "react";
import { mudarItem } from "@/app/(sistema)/marketing/acoes";
import { CLASSE, ROTULO } from "@/lib/fotos";

const OPCOES = [
  { v: "com_ela", rotulo: "Com ela" },
  { v: "devolvido", rotulo: "Devolvido" },
  { v: "deu", rotulo: "Deu" },
] as const;

/** Botões de situação da peça (com ela / devolvido / deu). "Deu" pede com quem ficou. */
export function SituacaoItem({ id, situacao, pode }: { id: number; situacao: string; pode: boolean }) {
  const [estado, enviar, enviando] = useActionState(mudarItem, null);
  const [pedindo, setPedindo] = useState(false);
  if (!pode || situacao === "deu") return <span className={`etiqueta ${CLASSE[situacao]}`}>{ROTULO[situacao]}</span>;
  return (
    <div className="mf-situacao">
      <div className="mf-seg" role="group" aria-label="Situação">
        {OPCOES.map((o) => (
          o.v === "deu" ? (
            <button key={o.v} type="button" className={situacao === o.v ? "ativo" : undefined} disabled={enviando} onClick={() => setPedindo((p) => !p)}>{o.rotulo}</button>
          ) : (
            <form key={o.v} action={enviar}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="situacao" value={o.v} />
              <button type="submit" className={situacao === o.v ? `ativo ${o.v}` : undefined} disabled={enviando || situacao === o.v}>{o.rotulo}</button>
            </form>
          )
        ))}
      </div>
      {pedindo && (
        <form action={enviar} className="mf-deu">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="situacao" value="deu" />
          <input className="entrada" name="observacao" placeholder="Com quem ficou? (influencer, permuta…)" required aria-label="Com quem a peça ficou" />
          <button className="botao pequeno" type="submit" disabled={enviando}>Confirmar</button>
        </form>
      )}
      {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: 0 }}>{estado.erro}</p>}
    </div>
  );
}

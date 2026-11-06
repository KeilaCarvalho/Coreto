"use client";

import { useActionState, useState } from "react";
import { mudarItem } from "@/app/(sistema)/marketing/acoes";
import { CLASSE, ROTULO } from "@/lib/fotos";

function Botao({ id, situacao, children, className = "botao leve pequeno", enviando }: { id: number; situacao: string; children: React.ReactNode; className?: string; enviando: boolean }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="situacao" value={situacao} className={className} disabled={enviando}>{children}</button>
    </>
  );
}

/**
 * Situação da peça. Quem lança (marketing) só AVISA: "Devolvi na loja" ou "Ficou com alguém", com confirmação.
 * A baixa (Devolvido / Doado) é confirmada por quem aprova.
 */
export function SituacaoItem({ id, situacao, podeAvisar, podeConfirmar }: { id: number; situacao: string; podeAvisar: boolean; podeConfirmar: boolean }) {
  const [estado, enviar, enviando] = useActionState(mudarItem, null);
  const [passo, setPasso] = useState<"" | "devolver" | "doar">("");
  const selo = <span className={`etiqueta ${CLASSE[situacao] ?? "neutra"}`}>{ROTULO[situacao] ?? situacao}</span>;

  let acoes: React.ReactNode = null;
  if (situacao === "com_ela" && podeAvisar) {
    acoes = passo === "devolver" ? (
      <form action={enviar} className="mf-confirma">
        <span>Confirmar que devolveu na loja?</span>
        <Botao id={id} situacao="devolvendo" className="botao pequeno" enviando={enviando}>Sim, devolvi</Botao>
        <button type="button" className="botao-link" onClick={() => setPasso("")}>Cancelar</button>
      </form>
    ) : passo === "doar" ? (
      <form action={enviar} className="mf-confirma">
        <input className="entrada" name="observacao" placeholder="Com quem ficou? (influencer, permuta…)" required aria-label="Com quem a peça ficou" />
        <Botao id={id} situacao="doando" className="botao pequeno" enviando={enviando}>Avisar</Botao>
        <button type="button" className="botao-link" onClick={() => setPasso("")}>Cancelar</button>
      </form>
    ) : (
      <div className="mf-acoes">
        <button type="button" className="botao leve pequeno" onClick={() => setPasso("devolver")}>Devolvi na loja</button>
        <button type="button" className="botao-link" onClick={() => setPasso("doar")}>Ficou com alguém</button>
      </div>
    );
  } else if ((situacao === "devolvendo" || situacao === "doando") && podeConfirmar) {
    acoes = (
      <form action={enviar} className="mf-acoes">
        <Botao id={id} situacao={situacao === "devolvendo" ? "devolvido" : "deu"} className="botao pequeno" enviando={enviando}>{situacao === "devolvendo" ? "Confirmar que voltou" : "Confirmar doação"}</Botao>
        <button type="submit" name="situacao" value="com_ela" className="botao-link" disabled={enviando}>Ainda está com ela</button>
      </form>
    );
  } else if ((situacao === "devolvendo" || situacao === "doando") && podeAvisar) {
    acoes = (
      <form action={enviar} className="mf-acoes">
        <span className="mini">Esperando a Keila confirmar.</span>
        <Botao id={id} situacao="com_ela" className="botao-link" enviando={enviando}>Desfazer aviso</Botao>
      </form>
    );
  } else if ((situacao === "devolvido" || situacao === "deu") && podeConfirmar) {
    acoes = (
      <details className="mf-mais">
        <summary className="botao-link">Mudar</summary>
        <form action={enviar}><Botao id={id} situacao="com_ela" className="botao-link" enviando={enviando}>Voltar para “Com ela”</Botao></form>
      </details>
    );
  }

  return (
    <div className="mf-situacao">
      <div className="mf-sit-linha">{selo}{acoes}</div>
      {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: 0 }}>{estado.erro}</p>}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { excluirFotos } from "@/app/(sistema)/marketing/acoes";

/** Excluir com confirmação (peça ou sessão inteira). */
export function ExcluirFotos({ item, sessao, rotulo }: { item?: number; sessao?: number; rotulo: string }) {
  const [estado, enviar, enviando] = useActionState(excluirFotos, null);
  const [certeza, setCerteza] = useState(false);
  if (!certeza) return <button type="button" className="botao-link mf-excluir" onClick={() => setCerteza(true)}>{rotulo}</button>;
  return (
    <form action={enviar} className="mf-confirma mf-confirma-excluir">
      {item != null && <input type="hidden" name="item" value={item} />}
      {sessao != null && <input type="hidden" name="sessao" value={sessao} />}
      <span>{sessao != null ? "Excluir a sessão inteira com todas as peças?" : "Excluir esta peça?"}</span>
      <button type="submit" className="botao pequeno perigo" disabled={enviando}>Excluir</button>
      <button type="button" className="botao-link" onClick={() => setCerteza(false)}>Cancelar</button>
      {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: 0, flexBasis: "100%" }}>{estado.erro}</p>}
    </form>
  );
}

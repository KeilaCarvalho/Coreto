"use client";

import { useActionState, useEffect, useState } from "react";
import { editarItem, editarSessao } from "@/app/(sistema)/marketing/acoes";

/** Editar uma peça (nome, cor, tamanho, quantidade). */
export function EditarItem({ id, peca, cor, tamanho, quantidade }: { id: number; peca: string; cor: string; tamanho: string; quantidade: number }) {
  const [estado, enviar, enviando] = useActionState(editarItem, null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { if (estado?.ok) setAberto(false); }, [estado]);
  if (!aberto) return <button type="button" className="botao-link mf-editar" onClick={() => setAberto(true)}>Editar</button>;
  return (
    <form action={enviar} className="mf-edita">
      <input type="hidden" name="id" value={id} />
      <input className="entrada mf-e-nome" name="peca" defaultValue={peca} aria-label="Nome da peça" required />
      <div className="mf-g-linha mf-e-linha">
        <input className="entrada" name="cor" defaultValue={cor} placeholder="Cor" aria-label="Cor" />
        <input className="entrada" name="tamanho" defaultValue={tamanho} placeholder="Tam." aria-label="Tamanho" />
        <input className="entrada" name="quantidade" defaultValue={quantidade} inputMode="numeric" aria-label="Quantidade" />
      </div>
      <div className="mf-acoes">
        <button type="submit" className="botao pequeno" disabled={enviando}>Salvar</button>
        <button type="button" className="botao-link" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
      {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: 0 }}>{estado.erro}</p>}
    </form>
  );
}

/** Editar a sessão (evento, data, anotação). */
export function EditarSessao({ id, evento, data, observacao }: { id: number; evento: string; data: string; observacao: string }) {
  const [estado, enviar, enviando] = useActionState(editarSessao, null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { if (estado?.ok) setAberto(false); }, [estado]);
  if (!aberto) return <button type="button" className="botao-link mf-editar" onClick={() => setAberto(true)}>Editar sessão</button>;
  return (
    <form action={enviar} className="mf-edita">
      <input type="hidden" name="id" value={id} />
      <input className="entrada" name="evento" defaultValue={evento} aria-label="Evento" required />
      <input className="entrada" name="data" type="date" defaultValue={data} aria-label="Data da sessão" required />
      <input className="entrada" name="observacao" defaultValue={observacao} placeholder="Anotação" aria-label="Anotação" />
      <div className="mf-acoes">
        <button type="submit" className="botao pequeno" disabled={enviando}>Salvar</button>
        <button type="button" className="botao-link" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
      {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: 0 }}>{estado.erro}</p>}
    </form>
  );
}

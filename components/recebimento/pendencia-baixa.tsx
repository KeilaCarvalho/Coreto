"use client";

import { useState, useTransition } from "react";
import { resolverPendencia } from "@/app/(sistema)/producao/acoes";

/** Dar baixa numa peça que faltou: quantas chegaram, ou "não vem mais". */
export function PendenciaBaixa({ id, quantidade, podeLancar }: { id: string; quantidade: number; podeLancar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState(String(quantidade));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (cancelar: boolean) => iniciar(async () => {
    setErro(null);
    const r = await resolverPendencia(id, Number(qtd) || 0, cancelar);
    if (!r.ok) setErro(r.erro);
  });
  if (!podeLancar) return null;
  if (!aberto) return <button type="button" className="botao secundario pequeno" onClick={() => setAberto(true)}>Dar baixa</button>;
  return (
    <div className="pb">
      <label>Chegaram <input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} aria-label="Quantas chegaram" /></label>
      <button type="button" className="botao pequeno" disabled={pendente} onClick={() => rodar(false)}>Chegou</button>
      <button type="button" className="botao leve pequeno" disabled={pendente} onClick={() => rodar(true)}>Não vem mais</button>
      {erro && <small className="pb-erro">{erro}</small>}
    </div>
  );
}

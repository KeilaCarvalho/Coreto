"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { atualizarHera } from "@/app/(sistema)/comercial/acoes";

/** Faixa "Ao vivo do HeraDash": quando atualizou e o botão para puxar de novo. */
export function FaixaHera({ quando, erro }: { quando: string; erro?: string | null }) {
  const router = useRouter();
  const [rodando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  return (
    <div className={`hera-faixa${erro ? " com-erro" : ""}`} role="status">
      <span className="hera-ponto" aria-hidden="true" />
      <span className="hera-texto">
        <b>Ao vivo do HeraDash</b>
        <span>{aviso?.mensagem ?? (erro ? `Última tentativa falhou: ${erro}` : `Atualizado ${quando}. Puxa sozinho de hora em hora.`)}</span>
      </span>
      <button type="button" className="botao leve pequeno" disabled={rodando}
        onClick={() => iniciar(async () => { const r = await atualizarHera(); setAviso(r); router.refresh(); })}>
        <Icone nome="relogio" tamanho={15} />{rodando ? "Atualizando…" : "Atualizar agora"}
      </button>
    </div>
  );
}

"use client";

import { Icone } from "@/components/icone";

/** Quando uma tela do sistema dá erro: mostra o que aconteceu em vez de ficar parada. */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="painel fx-vazio">
      <span className="marcador rosa"><Icone nome="alerta" tamanho={24} /></span>
      <h2>Algo deu errado nesta tela</h2>
      <p>Tente de novo. Se continuar, mande um print desta mensagem.</p>
      <p className="mini">Código do erro: {error.digest ?? (error.message || "sem código")}</p>
      <button type="button" className="botao" onClick={() => reset()}>Tentar de novo</button>
    </section>
  );
}

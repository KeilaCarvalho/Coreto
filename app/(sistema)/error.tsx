"use client";

import { Icone } from "@/components/icone";

/** Quando uma tela do sistema dá erro: mostra o que aconteceu em vez de ficar parada. */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // O sistema foi publicado de novo enquanto a tela estava aberta: só recarregar resolve.
  if (/Server Action .* was not found|failed-to-find-server-action/i.test(error.message ?? "")) {
    return (
      <section className="painel fx-vazio">
        <span className="marcador"><Icone nome="alerta" tamanho={24} /></span>
        <h2>O sistema foi atualizado</h2>
        <p>Esta tela estava aberta desde antes da atualização. Recarregue para continuar — o que você digitou no Fluxo fica guardado e volta sozinho.</p>
        <button type="button" className="botao" onClick={() => window.location.reload()}>Recarregar agora</button>
      </section>
    );
  }
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

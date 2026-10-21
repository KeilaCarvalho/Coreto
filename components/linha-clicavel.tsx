"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Linha de tabela que abre um endereço ao clicar em qualquer parte dela (links e botões dentro continuam funcionando). */
export function LinhaClicavel({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  const [abrindo, iniciar] = useTransition();
  const abrir = () => iniciar(() => router.push(href, { scroll: false }));
  return (
    <tr className={`linha-clicavel${abrindo ? " abrindo" : ""}`} tabIndex={0} aria-busy={abrindo}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button, input, select")) abrir(); }}
      onKeyDown={(e) => { if (e.key === "Enter") abrir(); }}>
      {children}
    </tr>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * No celular, as tabelas viram cartões (uma linha = um cartão).
 * Para isso cada célula ganha o nome da coluna (data-rotulo), copiado do cabeçalho.
 * Tabelas com campos para digitar continuam como tabela.
 */
export function TabelasNoCelular() {
  const caminho = usePathname();
  useEffect(() => {
    const rotular = () => {
      document.querySelectorAll<HTMLTableElement>("table.tabela").forEach((tabela) => {
        if (tabela.querySelector("tbody input, tbody select, tbody textarea")) return;
        tabela.classList.add("em-cartoes");
        const nomes = Array.from(tabela.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
        tabela.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            const nome = nomes[i] ?? "";
            if (td.getAttribute("data-rotulo") !== nome) td.setAttribute("data-rotulo", nome);
          });
        });
      });
    };
    rotular();
    const observador = new MutationObserver(() => rotular());
    observador.observe(document.body, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [caminho]);
  return null;
}

"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import type { Folha, LinhaFolha } from "@/lib/folha";

/** Baixa os recibos da folha (todos, com resumo) ou só o de uma pessoa. */
export function BotaoPdfFolha({ folha, linhas, pessoa, rotulo = "Baixar recibos (PDF)", classe = "botao leve" }: {
  folha: Folha; linhas: LinhaFolha[]; pessoa?: string; rotulo?: string; classe?: string;
}) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function baixar() {
    setGerando(true); setErro(null);
    try {
      const { gerarPdfFolha, nomeDoMes } = await import("@/lib/pdf-folha");
      const blob = await gerarPdfFolha(folha, linhas, pessoa);
      const nome = pessoa ? `Recibo ${linhas.find((l) => l.pessoa.id === pessoa)?.pessoa.nome ?? ""} ${nomeDoMes(folha.mes)}` : `Folha ${nomeDoMes(folha.mes)}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${nome}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setErro(`Não consegui gerar o PDF: ${(e as Error).message}`);
    } finally { setGerando(false); }
  }
  return (
    <>
      <button type="button" className={classe} onClick={baixar} disabled={gerando || !linhas.length}><Icone nome="baixar" />{gerando ? "Gerando…" : rotulo}</button>
      {erro && <p className="aviso erro" role="alert" style={{ flexBasis: "100%", margin: 0 }}><Icone nome="alerta" />{erro}</p>}
    </>
  );
}

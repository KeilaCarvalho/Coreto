"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { dataPorExtenso, type DadosFluxo } from "@/lib/fluxo";

/** Baixar o PDF do dia ou mandar para a Deborah pelo compartilhamento do celular (WhatsApp). */
export function BotoesPdf({ dados }: { dados: DadosFluxo | null }) {
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function gerar(): Promise<File | null> {
    if (!dados) return null;
    setGerando(true);
    setAviso(null);
    try {
      const { gerarPdfFluxo, nomeDoPdf } = await import("@/lib/pdf-fluxo");
      const blob = await gerarPdfFluxo(dados);
      return new File([blob], nomeDoPdf(dados.data), { type: "application/pdf" });
    } catch (e) {
      setAviso({ tipo: "erro", texto: `Não consegui gerar o PDF: ${(e as Error).message}` });
      return null;
    } finally {
      setGerando(false);
    }
  }

  function baixar(arquivo: File) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function baixarPdf() {
    const arquivo = await gerar();
    if (arquivo) baixar(arquivo);
  }

  async function enviarDeborah() {
    const arquivo = await gerar();
    if (!arquivo || !dados) return;
    const texto = `Fluxo financeiro Coreto: ${dataPorExtenso(dados.data)}`;
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: "Fluxo financeiro Coreto", text: texto });
        setAviso({ tipo: "ok", texto: "Pronto. Escolha o WhatsApp e a conversa da Deborah." });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    baixar(arquivo);
    setAviso({ tipo: "ok", texto: "O PDF foi baixado. Neste computador é só anexar na conversa da Deborah no WhatsApp." });
  }

  const titulo = dados ? undefined : "Lance o dia primeiro";
  return (
    <>
      <button type="button" className="botao leve" onClick={baixarPdf} disabled={!dados || gerando} title={titulo}><Icone nome="baixar" />{gerando ? "Gerando…" : "Baixar PDF"}</button>
      <button type="button" className="botao whatsapp" onClick={enviarDeborah} disabled={!dados || gerando} title={titulo}><Icone nome="whatsapp" />Enviar para a Deborah</button>
      {aviso && <p className={`aviso ${aviso.tipo}`} role="status" style={{ flexBasis: "100%", margin: 0 }}><Icone nome={aviso.tipo === "ok" ? "certo" : "alerta"} />{aviso.texto}</p>}
    </>
  );
}

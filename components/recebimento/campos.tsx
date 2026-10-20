"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GradeQuantidades, type CelulaGrade, type LinhaGrade } from "@/components/grade-quantidades";

/** Escolher o modelo na janela de chegada: recarrega a janela com a grade daquele modelo. */
export function EscolherModelo({ produtos, atual }: { produtos: { id: string; referencia: string; nome: string }[]; atual: string | null }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  return (
    <select className="entrada" style={{ width: "100%" }} value={atual ?? ""} aria-label="Modelo"
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set("produto", e.target.value);
        router.replace(`${caminho}?${p}`, { scroll: false });
      }}>
      <option value="" disabled>Escolha o modelo que chegou</option>
      {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia} · {p.nome}</option>)}
    </select>
  );
}

/** Liberar tudo o que está aguardando ou só uma parte (o resto continua seguro). */
export function EscolhaLiberar({ linhas, tamanhos, celulas, aguardando }: {
  linhas: LinhaGrade[]; tamanhos: string[]; celulas: Record<string, CelulaGrade>; aguardando: number;
}) {
  const [modo, setModo] = useState<"tudo" | "parte">("tudo");
  const cheias = Object.fromEntries(Object.entries(celulas).map(([k, c]) => [k, { ...c, inicial: modo === "tudo" ? c.maximo : undefined }]));
  return (
    <>
      <div className="escolha-liberar" role="radiogroup" aria-label="Quanto liberar">
        <label><input type="radio" name="modo" checked={modo === "tudo"} onChange={() => setModo("tudo")} /><b>Liberar o lote todo</b>As {aguardando} peças que estão aguardando vão para venda.</label>
        <label><input type="radio" name="modo" checked={modo === "parte"} onChange={() => setModo("parte")} /><b>Liberar só uma parte</b>Digite quantas de cada cor e tamanho. O resto fica seguro com você.</label>
      </div>
      <GradeQuantidades key={modo} linhas={linhas} tamanhos={tamanhos} celulas={cheias} comBotoes={modo === "parte"} />
    </>
  );
}

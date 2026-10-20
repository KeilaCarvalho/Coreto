"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icone } from "@/components/icone";

/** Dentro de uma janela lateral: fecha a janela e mostra o aviso na tela de trás. */
const FecharJanela = createContext<((aviso?: string) => void) | null>(null);
export const useFecharJanela = () => useContext(FecharJanela);

/**
 * Janela lateral de inclusão/edição. Abre quando a URL tem ?<param>=<valor>
 * (valor "*" abre com qualquer valor). Fechar tira o parâmetro da URL e volta para a tela normal.
 */
export function JanelaLateral({ param, valor = "1", limpar = [], titulo, subtitulo, children }: {
  param: string; valor?: string; limpar?: string[]; titulo: string; subtitulo?: string; children: React.ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const atual = params.get(param);
  const aberta = valor === "*" ? atual !== null : atual === valor;

  const fechar = (aviso?: string) => {
    const p = new URLSearchParams(params.toString());
    p.delete(param);
    limpar.forEach((n) => p.delete(n));
    if (aviso) p.set("aviso", aviso); else p.delete("aviso");
    const q = p.toString();
    router.replace(q ? `${caminho}?${q}` : caminho, { scroll: false });
  };

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aberta) return null;
  return (
    <FecharJanela.Provider value={fechar}>
      <div className="fx-janela-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
        <div className="fx-janela" role="dialog" aria-modal="true" aria-label={titulo}>
          <div className="fx-janela-topo">
            <div><h2>{titulo}</h2>{subtitulo && <p>{subtitulo}</p>}</div>
            <button type="button" className="icone-botao" onClick={() => fechar()} aria-label="Fechar"><Icone nome="fechar" /></button>
          </div>
          <div className="fx-janela-corpo janela-generica">{children}</div>
        </div>
      </div>
    </FecharJanela.Provider>
  );
}

/** Botão "Cancelar" que fecha a janela onde está. */
export function CancelarJanela() {
  const fechar = useFecharJanela();
  if (!fechar) return null;
  return <button type="button" className="botao leve" onClick={() => fechar()}>Cancelar</button>;
}

/** Mostra o aviso deixado por uma janela que acabou de salvar (?aviso=...). */
export function AvisoDaUrl() {
  const aviso = useSearchParams().get("aviso");
  return aviso ? <p className="aviso ok" role="status"><Icone nome="certo" />{aviso}</p> : null;
}

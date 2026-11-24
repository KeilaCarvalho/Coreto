"use client";

import { useState } from "react";

const ICONE = {
  email: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M22 7l-10 6L2 7",
  senha: "M6 10V8a6 6 0 0 1 12 0v2 M5 10h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z M12 14v3",
  nome: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
} as const;

/** Campo do login com ícone à esquerda; o de senha tem o olho para mostrar o que foi digitado. */
export function CampoLogin({ id, rotulo, tipo, autoComplete, minLength, ajuda, extra }: {
  id: string; rotulo: string; tipo: "email" | "senha" | "nome"; autoComplete: string; minLength?: number; ajuda?: string; extra?: React.ReactNode;
}) {
  const [ver, setVer] = useState(false);
  const senha = tipo === "senha";
  return (
    <div className="lg-campo">
      <div className="lg-rotulos"><label htmlFor={id}>{rotulo}</label>{extra}</div>
      <div className="lg-caixa">
        <svg className="lg-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONE[tipo]} /></svg>
        <input id={id} name={id} required minLength={minLength} autoComplete={autoComplete}
          type={senha ? (ver ? "text" : "password") : tipo === "email" ? "email" : "text"}
          inputMode={tipo === "email" ? "email" : undefined} autoCapitalize={tipo === "nome" ? "words" : "none"} spellCheck={false} />
        {senha && (
          <button type="button" className="lg-olho" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder senha" : "Mostrar senha"} aria-pressed={ver}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ver ? "M3 3l18 18 M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6 M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.4-1 M9.9 9.9a3 3 0 0 0 4.2 4.2" : "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"} /></svg>
          </button>
        )}
      </div>
      {ajuda && <span className="lg-ajuda">{ajuda}</span>}
    </div>
  );
}

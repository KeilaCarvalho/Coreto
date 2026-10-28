"use client";

import { useEffect, useState } from "react";

/** O Supabase devolve erros de link no "#" do endereço (ex.: link já usado ou vencido). Mostra um aviso claro. */
export function AvisoLinkDoEmail() {
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const q = new URLSearchParams(window.location.search);
    const codigo = h.get("error_code") ?? q.get("error_code") ?? h.get("error") ?? q.get("error");
    if (!codigo) return;
    setErro(codigo === "otp_expired" || codigo === "access_denied"
      ? "Esse link do e-mail já foi usado ou venceu. Cada link funciona uma vez só: peça outro em “Esqueci minha senha” e abra o e-mail mais novo."
      : "Não deu para usar o link do e-mail. Peça outro em “Esqueci minha senha”.");
    history.replaceState(null, "", window.location.pathname);
  }, []);
  return erro ? <p className="aviso erro" role="alert">{erro}</p> : null;
}

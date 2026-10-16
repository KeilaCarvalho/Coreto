"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Icone } from "@/components/icone";

export type EstadoAcao = { erro?: string; ok?: string } | null;
type Acao = (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;

/** Formulário ligado a uma Server Action, com aviso de erro/sucesso e botão que mostra o envio. */
export function FormAcao({ acao, children, className, limparAoSalvar = false }: {
  acao: Acao; children: React.ReactNode; className?: string; limparAoSalvar?: boolean;
}) {
  const [estado, enviar] = useActionState(acao, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok && limparAoSalvar) form.current?.reset();
  }, [estado, limparAoSalvar]);
  return (
    <form ref={form} action={enviar} className={className}>
      {estado?.erro && <p className="aviso erro" role="alert"><Icone nome="alerta" />{estado.erro}</p>}
      {estado?.ok && <p className="aviso ok" role="status"><Icone nome="certo" />{estado.ok}</p>}
      {children}
    </form>
  );
}

export function BotaoEnviar({ children, enviando = "Salvando…", className = "botao" }: {
  children: React.ReactNode; enviando?: string; className?: string;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? enviando : children}</button>;
}

/** Situação de cada peça que saiu para fotos. Ela avisa (devolvendo/doando); a administração confirma (devolvido/deu). */
export const ROTULO: Record<string, string> = {
  com_ela: "Para devolver", devolvendo: "Devolução avisada", doando: "Doação avisada", devolvido: "Devolvido", deu: "Doado",
};
export const CLASSE: Record<string, string> = { com_ela: "alerta", devolvendo: "neutra", doando: "neutra", devolvido: "ok", deu: "neutra" };

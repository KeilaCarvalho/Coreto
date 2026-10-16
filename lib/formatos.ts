const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

export const reais = (valor: number | null | undefined) => (valor == null ? "—" : moeda.format(valor));
export const numero = (valor: number | null | undefined) => (valor == null ? "—" : inteiro.format(valor));
export const quando = (iso: string | null | undefined) => (iso ? dataHora.format(new Date(iso)) : "—");

/** "quinta-feira, 16 de outubro" com a primeira letra maiúscula. */
export function hojeExtenso(agora = new Date()) {
  const texto = dataLonga.format(agora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Hora em São Paulo, para a saudação. */
export function horaSP(agora = new Date()) {
  return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
}

/** Converte "1.234,56", "1234.56" ou "R$ 89,90" em número. Vazio vira null. */
export function lerValor(bruto: FormDataEntryValue | null): number | null {
  const texto = String(bruto ?? "").replace(/R\$|\s/g, "");
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

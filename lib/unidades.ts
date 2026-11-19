/**
 * A quantidade da ficha pode vir em cm, mm ou g, mas o preço é sempre o da nota (por metro ou por kg).
 * Este fator converte: 20 cm de entretela a R$ 18,30 o metro = 0,20 × 18,30.
 */
export function fatorUnidade(unidade: string | null | undefined) {
  const u = String(unidade ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["cm", "cms", "centimetro", "centímetro", "centimetros", "centímetros"].includes(u)) return 0.01;
  if (["mm", "milimetro", "milímetro", "milimetros", "milímetros"].includes(u)) return 0.001;
  if (["g", "gr", "grs", "grama", "gramas"].includes(u)) return 0.001;
  return 1;
}
export const totalDoItem = (quantidade: number, unidade: string | null | undefined, valor: number) => quantidade * fatorUnidade(unidade) * valor;
/** Texto curto que explica a conversão, ou null quando não há. */
export function avisoUnidade(unidade: string | null | undefined) {
  const f = fatorUnidade(unidade);
  if (f === 0.01) return "Valor por metro: a conta divide os cm por 100";
  if (f === 0.001) return /g/i.test(String(unidade)) ? "Valor por kg: a conta divide os gramas por 1000" : "Valor por metro: a conta divide os mm por 1000";
  return null;
}

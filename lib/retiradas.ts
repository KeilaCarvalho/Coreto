/** Retiradas de peças pela equipe: contas usadas na tela e no formulário. */

export type ItemRetirada = { id?: number; descricao: string; preco: number; desconto: number | null; liquido: number };
export type Abatimento = { descricao: string; valor: number };
export type Parcela = { id: number; retirada_id: number; numero: number; de: number; vencimento: string; valor: number; situacao: "aberta" | "paga" | "perdoada"; folha_mes: string | null; observacao: string | null };
export type Retirada = {
  id: number; pessoa_id: string; data: string; abatimentos: Abatimento[]; desconto_extra: number; total_combinado: number | null; observacao: string | null;
  itens: ItemRetirada[]; parcelas: Parcela[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Líquido da peça: preço com desconto; null = preço de custo (o valor é digitado). */
export const liquidoDaPeca = (preco: number, desconto: number | null, custo: number) => (desconto == null ? r2(custo) : r2(preco * (1 - desconto)));

/** Total a pagar: soma das peças − abatimentos, com o desconto extra (meta), ou o valor combinado. */
export function totalRetirada(r: Pick<Retirada, "itens" | "abatimentos" | "desconto_extra" | "total_combinado">) {
  const pecas = r2(r.itens.reduce((t, i) => t + Number(i.liquido), 0));
  const abat = r2((r.abatimentos ?? []).reduce((t, a) => t + Number(a.valor), 0));
  const calculado = r2(Math.max(pecas - abat, 0) * (1 - Number(r.desconto_extra || 0)));
  return { pecas, abat, calculado, total: r.total_combinado != null ? Number(r.total_combinado) : calculado, combinado: r.total_combinado != null };
}

/** Quanto ainda falta pagar: parcelas abertas, ou o total quando ainda não tem parcelas. */
export function emAberto(r: Retirada) {
  if (!r.parcelas.length) return totalRetirada(r).total;
  return r2(r.parcelas.filter((p) => p.situacao === "aberta").reduce((t, p) => t + Number(p.valor), 0));
}

/** Dia 7 do mês seguinte a uma data. */
export function proximoDia7(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m, 7)).toISOString().slice(0, 10);
}

export const SITUACAO_PARCELA: Record<string, { rotulo: string; classe: string }> = {
  aberta: { rotulo: "Em aberto", classe: "alerta" },
  paga: { rotulo: "Paga", classe: "ok" },
  perdoada: { rotulo: "Perdoada", classe: "neutra" },
};

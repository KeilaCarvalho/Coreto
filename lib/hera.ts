/** Dados puxados do HeraDash (PDV da loja) pela função hera-sincronizar. */
export type ParHera = { x: string; y: number };
export type ClienteHera = { nome: string; valor: number; vendas: number; pecas: number; aproximado?: boolean };
export type ProdutoHera = { x: string; COD_PROD: number; REF_PROD: string; VLR_TOTAL: number; VLR_UNIT_MEDIO: number; QTD_VENDIDA: number };
export type SubgrupoHera = { x: string; VLR_TOTAL: number; VLR_UNIT_MEDIO: number; QTD_VENDIDA: number };
export type MetricasHera = { VALOR_TOTAL: number; PREVISAO: number; QUANTIDADE: number; ATENDIMENTOS: number; TICKET_MEDIO: number; MEDIA_DIA: number };
export type DiaHera = { data: string; loja: number; faturamento: number; caixa: ParHera[]; vendedoras: ParHera[]; clientes: ClienteHera[]; atualizado_em: string };
export type MesHera = { mes: string; loja: number; metricas: MetricasHera | null; caixa: ParHera[]; vendedoras: ParHera[]; produtos: ProdutoHera[]; subgrupos: SubgrupoHera[]; atualizado_em: string };

/** Tipo de documento do caixa do Hera → forma de pagamento usada no Fluxo. */
export function formaDoTipo(tipo: string): string {
  const t = tipo.toUpperCase();
  if (t.includes("PIX") && (t.includes("ABERTO") || t.includes("PARC"))) return "Pix em aberto";
  if (t.includes("PIX") || t.includes("TRANSF")) return "Pix";
  if (t.includes("LINK")) return "Link de pagamento";
  if (t.includes("DEBITO") || t.includes("DÉBITO")) return "Cartão de débito";
  if (t.includes("CART") || t.includes("CRED")) return "Cartão de crédito";
  if (t.includes("DINHEIRO")) return "Dinheiro";
  return tipo.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}

/** Maquininha/banco do tipo de documento, para o detalhe. */
export function maquinaDoTipo(tipo: string): string | null {
  const t = tipo.toUpperCase();
  for (const [chave, nome] of [["GETNET", "Getnet"], ["VALORIBANK", "Valori"], ["VALORI", "Valori"], ["PAGSEGURO", "PagSeguro"], ["PAGAR", "Pagar-me"]] as const) if (t.includes(chave)) return nome;
  return null;
}

/** Soma pares {x, y} de várias lojas/dias pelo nome. */
export function somarPares(listas: ParHera[][]): ParHera[] {
  const m = new Map<string, number>();
  for (const l of listas) for (const p of l ?? []) m.set(p.x, (m.get(p.x) ?? 0) + Number(p.y || 0));
  return [...m.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => b.y - a.y);
}

export type FormaAgrupada = { nome: string; valor: number; detalhes: ParHera[] };
/** Caixa por tipo de documento agrupado nas formas do Fluxo (Pix, crédito, débito…). */
export function agruparFormas(caixa: ParHera[]): FormaAgrupada[] {
  const m = new Map<string, FormaAgrupada>();
  for (const p of caixa) {
    const nome = formaDoTipo(p.x);
    const g = m.get(nome) ?? { nome, valor: 0, detalhes: [] };
    g.valor += p.y;
    g.detalhes.push(p);
    m.set(nome, g);
  }
  return [...m.values()].map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100, detalhes: g.detalhes.sort((a, b) => b.y - a.y) })).sort((a, b) => b.valor - a.valor);
}

/** Curva ABC pelo valor vendido: A até 80% do acumulado, B até 95%, C o resto. */
export function curvaABC<T extends { VLR_TOTAL: number }>(lista: T[]): (T & { classe: "A" | "B" | "C"; pct: number })[] {
  const ordem = [...lista].sort((a, b) => b.VLR_TOTAL - a.VLR_TOTAL);
  const total = ordem.reduce((t, p) => t + p.VLR_TOTAL, 0) || 1;
  let acumulado = 0;
  return ordem.map((p) => {
    const antes = acumulado / total;
    acumulado += p.VLR_TOTAL;
    return { ...p, pct: (p.VLR_TOTAL / total) * 100, classe: antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C" };
  });
}

/** Clientes do período somando os dias. */
export function somarClientes(dias: DiaHera[]): ClienteHera[] {
  const m = new Map<string, ClienteHera>();
  for (const d of dias) for (const c of d.clientes ?? []) {
    const a = m.get(c.nome) ?? { nome: c.nome, valor: 0, vendas: 0, pecas: 0 };
    m.set(c.nome, { nome: c.nome, valor: a.valor + c.valor, vendas: a.vendas + c.vendas, pecas: a.pecas + c.pecas, aproximado: a.aproximado || c.aproximado });
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/** Nome em maiúsculas → "Millena de Melo". */
export const nomeBonito = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()).replace(/ (D[aeo]s?|E) /g, (m) => m.toLowerCase());

/** "há 12 min", "há 2 h". */
export function haQuanto(iso: string | null | undefined, agora = Date.now()) {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

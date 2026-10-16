/** Uma linha de valor do fluxo: forma de pagamento, conta bancária, referência a receber ou vendedora. */
export type LinhaValor = { nome: string; valor: number };

export type DadosFluxo = {
  data: string;                 // "2026-10-16"
  vendasDia: LinhaValor[];      // vendas do dia anterior por forma de pagamento
  saldos: LinhaValor[];         // saldos bancários
  aReceber: LinhaValor[];       // contas a receber
  observacao: string;
  vendasMes: LinhaValor[];      // acumulado do mês por forma de pagamento
  vendedoras: LinhaValor[];     // vendas do mês por vendedora
  contasAPagar: number;
  contasPagas: number;
};

export const FORMAS_PAGAMENTO = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Link de pagamento"];

export const somar = (linhas: LinhaValor[]) => linhas.reduce((t, l) => t + (Number.isFinite(l.valor) ? l.valor : 0), 0);

export function totaisFluxo(d: DadosFluxo) {
  return {
    vendasDia: somar(d.vendasDia),
    vendasMes: somar(d.vendasMes),
    saldo: somar(d.saldos),
    aReceber: somar(d.aReceber),
    vendedoras: somar(d.vendedoras),
    contasAPagar: d.contasAPagar,
    contasPagas: d.contasPagas,
  };
}

/** "2026-10-16" → "2026-10-01" */
export const inicioDoMes = (data: string) => `${data.slice(0, 7)}-01`;

/** "2026-10-16" → "sexta-feira, 16 de outubro de 2026" */
export function dataPorExtenso(data: string) {
  const texto = new Date(`${data}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-16" → "outubro de 2026" */
export const mesPorExtenso = (data: string) =>
  new Date(`${data.slice(0, 7)}-15T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });

/** Lê uma lista [{nome, valor}] vinda do banco, descartando o que não for válido. */
export function lerLinhas(bruto: unknown): LinhaValor[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((l) => ({ nome: String((l as LinhaValor)?.nome ?? "").trim(), valor: Number((l as LinhaValor)?.valor ?? 0) }))
    .filter((l) => l.nome && Number.isFinite(l.valor));
}

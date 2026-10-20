/** Uma linha de valor do fluxo: forma de pagamento, conta bancária, referência a receber ou vendedora. */
export type LinhaValor = { nome: string; valor: number };

/** Venda por forma de pagamento no lançamento: total do período e o valor de cada dia de venda. */
export type LinhaVenda = LinhaValor & { dias: number[] };

export type DadosFluxo = {
  data: string;                 // dia do lançamento, "2026-10-19"
  diasVenda: string[];          // dias de venda que entram nele: segunda = sexta + sábado
  vendasDia: LinhaVenda[];      // vendas desses dias por forma de pagamento
  saldos: LinhaValor[];         // saldos bancários
  aReceber: LinhaValor[];       // contas a receber
  observacao: string;
  vendasMes: LinhaValor[];      // acumulado do mês por forma de pagamento
  vendedoras: LinhaValor[];     // vendas do mês por vendedora
  contasAPagar: number;
  contasPagas: number;
};

export const FORMAS_PAGAMENTO = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Link de pagamento"];

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/* ---------- datas (sempre "AAAA-MM-DD", sem fuso) ---------- */
const meioDia = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const diaDaSemana = (iso: string) => meioDia(iso).getUTCDay();
export const somarDias = (iso: string, n: number) => {
  const d = meioDia(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const nomeDoDia = (iso: string) => DIAS_SEMANA[diaDaSemana(iso)];
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const ehFimDeSemana = (iso: string) => [0, 6].includes(diaDaSemana(iso));
export const inicioDoMes = (data: string) => `${data.slice(0, 7)}-01`;
/** Mês a que o lançamento pertence: o do último dia de venda (na segunda, 2/11, as vendas de 30 e 31/10 ainda são de outubro). */
export const mesDoLancamento = (data: string) => {
  const dias = diasDeVenda(data);
  return inicioDoMes(dias.length ? dias[dias.length - 1] : data);
};

/**
 * Dias de venda que entram no lançamento de um dia.
 * Segunda: sexta e sábado (a loja não lança no sábado). Terça a sexta: o dia anterior.
 * Sábado e domingo não têm lançamento.
 */
export function diasDeVenda(data: string): string[] {
  const w = diaDaSemana(data);
  if (w === 1) return [somarDias(data, -3), somarDias(data, -2)];
  if (w >= 2 && w <= 5) return [somarDias(data, -1)];
  return [];
}

/** "Vendas de sexta e sábado" ou "Vendas de ontem". */
export const rotuloPeriodo = (diasVenda: string[]) =>
  diasVenda.length > 1 ? `Vendas de ${diasVenda.map(nomeDoDia).join(" e ")}` : "Vendas de ontem";

/* ---------- totais ---------- */
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
    sobra: somar(d.saldos) - d.contasAPagar, // o a receber fica de fora: não se sabe quando entra
  };
}

/** Total vendido em cada dia de venda do lançamento. */
export const vendasPorDia = (d: Pick<DadosFluxo, "diasVenda" | "vendasDia">) =>
  d.diasVenda.map((dia, k) => ({ dia, valor: d.vendasDia.reduce((t, v) => t + (v.dias[k] ?? 0), 0) }));

/* ---------- textos ---------- */
/** "2026-10-16" → "Sexta-feira, 16 de outubro de 2026" */
export function dataPorExtenso(data: string, comAno = true) {
  const texto = meioDia(data).toLocaleDateString("pt-BR", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", ...(comAno ? { year: "numeric" } : {}),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-16" → "outubro de 2026" */
export const mesPorExtenso = (data: string) =>
  meioDia(`${data.slice(0, 7)}-15`).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

/* ---------- leitura do banco ---------- */
/** Lê uma lista [{nome, valor}] vinda do banco, descartando o que não for válido. */
export function lerLinhas(bruto: unknown): LinhaValor[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((l) => ({ nome: String((l as LinhaValor)?.nome ?? "").trim(), valor: Number((l as LinhaValor)?.valor ?? 0) }))
    .filter((l) => l.nome && Number.isFinite(l.valor));
}

/** Lê as vendas do lançamento; registros antigos sem os dias separados ficam com o total no último dia. */
export function lerVendas(bruto: unknown, quantosDias: number): LinhaVenda[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((l) => {
    const nome = String((l as LinhaVenda)?.nome ?? "").trim();
    const valor = Number((l as LinhaVenda)?.valor ?? 0);
    const brutos = Array.isArray((l as LinhaVenda)?.dias) ? (l as LinhaVenda).dias.map(Number) : null;
    const dias = Array.from({ length: Math.max(1, quantosDias) }, (_, k) =>
      brutos && brutos.length === quantosDias ? (Number.isFinite(brutos[k]) ? brutos[k] : 0) : k === quantosDias - 1 ? valor : 0);
    return { nome, valor: brutos && brutos.length === quantosDias ? dias.reduce((t, n) => t + n, 0) : valor, dias };
  }).filter((l) => l.nome && Number.isFinite(l.valor));
}

/** Contas a pagar vindas do Conta Azul: leitura da planilha e a regra de cobrança (Santander e Caixa). */

export type ContaPagar = {
  id?: number; fornecedor: string; descricao: string; categoria: string | null; conta: string | null; forma: string | null;
  competencia: string | null; vencimento: string; previsto: string | null; situacao: string | null;
  valor: number; valor_pago: number; em_aberto: number; pago_em: string | null; nota_fiscal: string | null; observacao: string | null;
};

const COLUNAS: Record<string, keyof ContaPagar> = {
  "nome do fornecedor": "fornecedor", "descrição": "descricao", "categoria 1": "categoria", "conta bancária": "conta",
  "forma de pagamento": "forma", "data de competência": "competencia", "data de vencimento": "vencimento", "data prevista": "previsto",
  "situação": "situacao", "valor original da parcela (r$)": "valor", "valor total pago da parcela (r$)": "valor_pago",
  "valor total da parcela em aberto (r$)": "em_aberto", "data do último pagamento": "pago_em", "nota fiscal": "nota_fiscal", "observações": "observacao",
};
const DATAS = new Set<keyof ContaPagar>(["competencia", "vencimento", "previsto", "pago_em"]);
const NUMEROS = new Set<keyof ContaPagar>(["valor", "valor_pago", "em_aberto"]);

const dataIso = (t: string) => {
  const s = t.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5).toISOString().slice(0, 10);
  return null;
};
const valorNum = (t: string) => {
  const s = t.replace(/R\$|\s/g, "");
  if (!s || s === "-") return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** Transforma as linhas da planilha (cabeçalho na 1ª linha) em contas. */
export function contasDaPlanilha(linhas: string[][]): { contas: ContaPagar[]; erro?: string } {
  const ci = linhas.findIndex((l) => l.some((c) => c.trim().toLowerCase() === "data de vencimento"));
  if (ci < 0) return { contas: [], erro: "Não achei a coluna \"Data de vencimento\". Exporte a \"Visão Contas a Pagar\" do Conta Azul." };
  const mapa = linhas[ci].map((c) => COLUNAS[c.trim().toLowerCase()]);
  const contas: ContaPagar[] = [];
  for (const l of linhas.slice(ci + 1)) {
    if (!l.some((c) => c.trim())) continue;
    const c: Record<string, unknown> = {};
    mapa.forEach((campo, i) => {
      if (!campo) return;
      const t = String(l[i] ?? "").trim();
      c[campo] = DATAS.has(campo) ? dataIso(t) : NUMEROS.has(campo) ? valorNum(t) : (t || null);
    });
    if (!c.vencimento) continue;
    c.fornecedor ??= ""; c.descricao ??= "";
    for (const k of NUMEROS) c[k] ??= 0;
    contas.push(c as ContaPagar);
  }
  if (!contas.length) return { contas, erro: "A planilha não tem nenhuma conta com vencimento." };
  return { contas };
}

/** Bancos que a Keila quer ser cobrada. O cartão Caixa conta junto (pago na fatura). */
export type Banco = "Santander" | "Caixa" | "Cartão Caixa";
export function bancoCobrado(conta: string | null): Banco | null {
  const c = (conta ?? "").toLowerCase();
  if (c.includes("santander")) return "Santander";
  if (/cart[aã]o/.test(c) && c.includes("caixa")) return "Cartão Caixa";
  if (c.includes("caixa")) return "Caixa";
  return null;
}
export const BANCOS_COBRADOS: Banco[] = ["Santander", "Caixa", "Cartão Caixa"];
/** Filtro do Supabase para os bancos cobrados. */
export const FILTRO_BANCOS = "conta.ilike.%santander%,conta.ilike.%caixa%";

/** Quantos dias faltam (negativo = atrasada). */
export function diasPara(venc: string, hoje: string) {
  return Math.round((Date.parse(`${venc}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5);
}
export function prazo(venc: string, hoje: string): { rotulo: string; classe: string } {
  const d = diasPara(venc, hoje);
  if (d < 0) return { rotulo: `Atrasada ${-d} ${d === -1 ? "dia" : "dias"}`, classe: "erro" };
  if (d === 0) return { rotulo: "Vence hoje", classe: "alerta" };
  if (d === 1) return { rotulo: "Vence amanhã", classe: "alerta" };
  if (d <= 7) return { rotulo: `Em ${d} dias`, classe: "neutra" };
  return { rotulo: `Em ${d} dias`, classe: "neutra" };
}

/** Semana do mês pelo dia: 0 = dias 1 a 7, 1 = 8 a 14 … 4 = 29 a 31. */
export const semanaDoMes = (iso: string) => Math.min(4, Math.floor((Number(iso.slice(8, 10)) - 1) / 7));

/** Categorias que não emitem nota (pessoa física, folha, impostos, tarifas). */
const SEM_NOTA = /fac[cç][aã]o|m\.o\.d|folha|sal[aá]rio|pr[oó]-?labore|comiss|vale|impost|tributo|das\b|taxa|tarifa|juros|retirada|empr[eé]stimo|aluguel|transfer/i;
/** Conta de fornecedor sem nota fiscal no Conta Azul (nem número de NF na descrição). */
export function faltaNota(c: Pick<ContaPagar, "nota_fiscal" | "categoria" | "fornecedor" | "descricao">) {
  if (c.nota_fiscal?.trim()) return false;
  if (!c.fornecedor?.trim()) return false;
  if (SEM_NOTA.test(c.categoria ?? "")) return false;
  if (/\bNF[\s.:-]*\d{3,}/i.test(c.descricao ?? "")) return false;
  return true;
}

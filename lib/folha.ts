/** Folha: comissão das vendedoras e vale-transporte + ajuda de custo. Conta usada na tela e no PDF. */

export type Regra = {
  pessoa_id: string; ativo: boolean; comissao_percentual: number | null; nome_no_fluxo: string | null;
  recebe_vt: boolean; vt_conta_sabado: boolean; vt_tarifa: number; vt_desconta: boolean;
  salario_base: number | null; vt_desconto_valor: number | null; ajuda_custo: number; bonus_fixo: number; observacao: string | null;
};
export type Pessoa = { id: string; nome: string };
export type Folha = { mes: string; vt_inicio: string; vt_fim: string; feriados: string[]; fechada_em: string | null };
export type Ajuste = { pessoa_id: string; realizado: number | null; dias_vt: number | null };
export type Item = { id: number; pessoa_id: string; parte: "comissao" | "vt"; tipo: string; descricao: string | null; valor: number };

export const TIPOS_ITEM = [
  { valor: "retirada", rotulo: "Retirada de mercadoria", sinal: -1 },
  { valor: "adiantamento", rotulo: "Adiantamento", sinal: -1 },
  { valor: "desconto", rotulo: "Desconto", sinal: -1 },
  { valor: "premio", rotulo: "Prêmio", sinal: 1 },
  { valor: "bonus", rotulo: "Bônus", sinal: 1 },
  { valor: "diferenca", rotulo: "Diferença", sinal: 0 },
  { valor: "outro", rotulo: "Outro", sinal: 0 },
] as const;
export const tipoItem = (v: string) => TIPOS_ITEM.find((t) => t.valor === v) ?? TIPOS_ITEM[TIPOS_ITEM.length - 1];

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------- datas ---------- */
const meioDia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const mais = (iso: string, n: number) => { const d = meioDia(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Período padrão do VT da folha de um mês: do dia 8 do mês seguinte ao dia 7 do outro (folha de outubro → 08/11 a 07/12). */
export function periodoPadrao(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const prox = new Date(Date.UTC(a, m, 8)), depois = new Date(Date.UTC(a, m + 1, 7));
  return { inicio: prox.toISOString().slice(0, 10), fim: depois.toISOString().slice(0, 10) };
}

/** Domingo de Páscoa (algoritmo de Meeus). */
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados nacionais (e Sexta-feira Santa) que caem no período. Ajustável na folha. */
export function feriadosDoPeriodo(inicio: string, fim: string) {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  const saida: string[] = [];
  for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
    for (const f of fixos) saida.push(`${ano}-${f}`);
    saida.push(mais(pascoa(ano), -2));
  }
  return saida.filter((d) => d >= inicio && d <= fim && meioDia(d).getUTCDay() !== 0).sort();
}

/** Dias de trabalho no período: tira domingos, sábados (se não conta) e feriados. */
export function diasDeTrabalho(inicio: string, fim: string, contaSabado: boolean, feriados: string[]) {
  let n = 0;
  for (let d = inicio; d <= fim; d = mais(d, 1)) {
    const w = meioDia(d).getUTCDay();
    if (w === 0 || (w === 6 && !contaSabado) || feriados.includes(d)) continue;
    n++;
  }
  return n;
}

/* ---------- cálculo ---------- */
export type LinhaFolha = {
  pessoa: Pessoa; regra: Regra;
  // comissão
  vendedora: boolean; realizado: number; realizadoDoFluxo: boolean; percentual: number; comissao: number;
  itensComissao: Item[]; somaComissao: number;
  // vale-transporte e ajuda de custo
  dias: number; diasAjustados: boolean; vt: number; descontoVt: number; ajudaCusto: number; bonusFixo: number;
  itensVt: Item[]; somaVt: number;
  total: number;
};

export function calcularFolha(args: {
  folha: Folha; pessoas: Pessoa[]; regras: Regra[]; equipeFluxo: { nome: string; valor: number }[]; ajustes: Ajuste[]; itens: Item[];
}): LinhaFolha[] {
  const { folha, pessoas, regras, equipeFluxo, ajustes, itens } = args;
  const fluxo = new Map(equipeFluxo.map((e) => [norm(e.nome), Number(e.valor) || 0]));
  return regras.filter((r) => r.ativo).map((regra) => {
    const pessoa = pessoas.find((p) => p.id === regra.pessoa_id) ?? { id: regra.pessoa_id, nome: "?" };
    const ajuste = ajustes.find((a) => a.pessoa_id === regra.pessoa_id);
    const meus = itens.filter((i) => i.pessoa_id === regra.pessoa_id);

    const percentual = Number(regra.comissao_percentual ?? 0);
    const vendedora = regra.comissao_percentual != null;
    const doFluxo = regra.nome_no_fluxo ? fluxo.get(norm(regra.nome_no_fluxo)) : undefined;
    const realizado = ajuste?.realizado != null ? Number(ajuste.realizado) : doFluxo ?? 0;
    const comissao = vendedora ? r2(realizado * percentual) : 0;
    const itensComissao = meus.filter((i) => i.parte === "comissao");
    const somaComissao = r2(comissao + itensComissao.reduce((t, i) => t + Number(i.valor), 0));

    const diasCalc = regra.recebe_vt ? diasDeTrabalho(folha.vt_inicio, folha.vt_fim, regra.vt_conta_sabado, folha.feriados ?? []) : 0;
    const dias = ajuste?.dias_vt != null ? ajuste.dias_vt : diasCalc;
    const vt = regra.recebe_vt ? r2(dias * Number(regra.vt_tarifa)) : 0;
    // Desconto do VT: 6% do salário, limitado ao valor do vale. Sem salário cadastrado, usa o valor informado.
    const descontoVt = regra.recebe_vt && regra.vt_desconta
      ? r2(Math.min(vt, regra.salario_base != null ? Number(regra.salario_base) * 0.06 : Number(regra.vt_desconto_valor ?? 0)))
      : 0;
    const ajudaCusto = Number(regra.ajuda_custo) || 0;
    const bonusFixo = Number(regra.bonus_fixo) || 0;
    const itensVt = meus.filter((i) => i.parte === "vt");
    const somaVt = r2(vt - descontoVt + ajudaCusto + bonusFixo + itensVt.reduce((t, i) => t + Number(i.valor), 0));

    return {
      pessoa, regra, vendedora, realizado, realizadoDoFluxo: ajuste?.realizado == null && doFluxo !== undefined, percentual, comissao,
      itensComissao, somaComissao, dias, diasAjustados: ajuste?.dias_vt != null, vt, descontoVt, ajudaCusto, bonusFixo, itensVt, somaVt,
      total: r2(somaComissao + somaVt),
    };
  }).sort((a, b) => Number(b.vendedora) - Number(a.vendedora) || b.realizado - a.realizado || a.pessoa.nome.localeCompare(b.pessoa.nome));
}

export const dataBR = (iso: string) => iso.split("-").reverse().join("/");
export const percentualBR = (p: number) => `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

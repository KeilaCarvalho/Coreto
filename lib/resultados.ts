/**
 * Resultados (fechamento do mês, visão do ano e DRE gerencial).
 * Entradas: vendas do caixa do HeraDash. Saídas: contas pagas no Conta Azul (importadas em Contas a pagar),
 * classificadas pela categoria do plano de contas. Regime de caixa: vale a data do pagamento.
 */

export type GrupoDre =
  | "impostos" | "produto" | "variaveis" | "pessoal" | "prolabore" | "ocupacao" | "marketing" | "administrativo"
  | "investimentos" | "dividas" | "outros";

export const GRUPOS: { id: GrupoDre; nome: string; curto: string; cor: string; fixo?: boolean; operacional: boolean; explica: string }[] = [
  { id: "impostos", nome: "Impostos sobre vendas", curto: "Impostos", cor: "#8b5cf6", operacional: true, explica: "Simples Nacional (DAS) e DIFAL." },
  { id: "produto", nome: "Custo do produto", curto: "Produto", cor: "#0e9aa7", operacional: true, explica: "Tecidos, aviamentos, facção, corte, modelagem e mercadoria para revenda." },
  { id: "variaveis", nome: "Despesas variáveis de venda", curto: "Variáveis", cor: "#f59e0b", operacional: true, explica: "Taxas de cartão e antecipação, fretes e embalagens para clientes." },
  { id: "pessoal", nome: "Pessoal", curto: "Pessoal", cor: "#2563eb", fixo: true, operacional: true, explica: "Salários, encargos, férias, 13º, rescisões, benefícios, ajuda de custo e premiações." },
  { id: "prolabore", nome: "Pró-labore das sócias", curto: "Pró-labore", cor: "#1e3a8a", fixo: true, operacional: true, explica: "Retiradas mensais da Deborah e da Wanessa." },
  { id: "ocupacao", nome: "Ocupação da loja", curto: "Ocupação", cor: "#16a34a", fixo: true, operacional: true, explica: "Aluguel, IPTU, energia, água, internet, seguro e manutenção do prédio." },
  { id: "marketing", nome: "Marketing", curto: "Marketing", cor: "#e11d74", fixo: true, operacional: true, explica: "Publicidade, tráfego pago, serviços de marketing, eventos e brindes." },
  { id: "administrativo", nome: "Administrativo", curto: "Administrativo", cor: "#64748b", fixo: true, operacional: true, explica: "Contabilidade, sistemas, consultorias, tarifas bancárias, escritório, transporte e demais despesas." },
  { id: "investimentos", nome: "Investimentos", curto: "Investimentos", cor: "#0f766e", operacional: false, explica: "Compra de equipamentos, móveis e utensílios." },
  { id: "dividas", nome: "Empréstimos e parcelamentos", curto: "Dívidas", cor: "#b45309", operacional: false, explica: "Amortização de empréstimos e parcelamento do Simples." },
  { id: "outros", nome: "Outras saídas", curto: "Outras", cor: "#9ca3af", operacional: false, explica: "Estornos e despesas a identificar." },
];
export const grupo = (id: GrupoDre) => GRUPOS.find((g) => g.id === id)!;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Categoria do Conta Azul → grupo do DRE. Categoria nova cai em "administrativo" e aparece no aviso. */
const MAPA: [GrupoDre, string[]][] = [
  ["impostos", ["simples nacional - das", "difal", "icms", "iss "]],
  ["dividas", ["amortizacao de emprestimos", "parcelamento do simples", "emprestimo", "juros"]],
  ["investimentos", ["aquisicao de equipamentos", "aquisicao de moveis", "aquisicao de"]],
  ["outros", ["estorno", "despesas a identificar"]],
  ["produto", ["tecidos", "m.o.d", "aviamentos", "cmv", "frete sobre compras", "consertos e ajustes de mercadorias", "materia-prima", "materia prima"]],
  ["variaveis", ["tarifas de cartoes", "taxa antecipacao", "antecipacao", "correios e remessas", "fretes e entregas a clientes", "embalagens"]],
  ["prolabore", ["pro-labore", "pro labore"]],
  ["pessoal", ["salario", "adiantamento salarial", "inss", "fgts", "ferias", "rescis", "13", "ajuda de custo", "gratifica", "beneficios", "exames medicos", "lanches e refeicoes", "vale transporte", "vale alimentacao"]],
  ["ocupacao", ["aluguel", "energia", "agua e esgoto", "iptu", "telefonia", "internet", "seguro", "manutencao predial", "manutencao de vitrine", "extintores", "materiais de limpeza", "condominio"]],
  ["marketing", ["marketing", "trafego pago", "coqueteis", "brindes", "publicidade", "influenc"]],
];

export function grupoDaCategoria(categoria: string | null | undefined): { grupo: GrupoDre; conhecido: boolean } {
  const c = norm(categoria ?? "");
  if (!c) return { grupo: "administrativo", conhecido: false };
  for (const [g, chaves] of MAPA) if (chaves.some((k) => c.includes(k))) return { grupo: g, conhecido: true };
  const conhecidosAdm = ["honorarios", "software", "consultoria", "tarifas bancarias", "materiais de escritorio", "material de uso", "despesas com transporte", "mercado", "cursos", "prestacao de servicos", "mao de obra de terceiros", "manutencao de maquinas", "manutencao de equipamentos"];
  return { grupo: "administrativo", conhecido: conhecidosAdm.some((k) => c.includes(k)) };
}

export type Pagamento = { pago_em: string; valor_pago: number; categoria: string | null; fornecedor: string | null; descricao: string | null };

export type Mes = {
  mes: string;                               // "2026-10"
  vendas: number;                            // entrou (caixa do HeraDash)
  porGrupo: Record<GrupoDre, number>;
  porCategoria: Map<string, { valor: number; grupo: GrupoDre }>;
  porFornecedor: Map<string, number>;
  saiu: number;
  pagamentos: number;
};

export const vazioGrupos = () => Object.fromEntries(GRUPOS.map((g) => [g.id, 0])) as Record<GrupoDre, number>;

export function montarMeses(pagamentos: Pagamento[], vendas: Map<string, number>, meses: string[]): { meses: Mes[]; semClasse: Set<string> } {
  const semClasse = new Set<string>();
  const porMes = new Map<string, Mes>(meses.map((m) => [m, { mes: m, vendas: vendas.get(m) ?? 0, porGrupo: vazioGrupos(), porCategoria: new Map(), porFornecedor: new Map(), saiu: 0, pagamentos: 0 }]));
  for (const p of pagamentos) {
    const m = porMes.get(p.pago_em.slice(0, 7));
    if (!m) continue;
    const v = Number(p.valor_pago) || 0;
    if (!v) continue;
    const { grupo: g, conhecido } = grupoDaCategoria(p.categoria);
    if (!conhecido && p.categoria) semClasse.add(p.categoria);
    const cat = p.categoria?.trim() || "Sem categoria";
    m.porGrupo[g] += v;
    const c = m.porCategoria.get(cat) ?? { valor: 0, grupo: g };
    c.valor += v;
    m.porCategoria.set(cat, c);
    const f = (p.fornecedor?.trim() || "Sem fornecedor");
    m.porFornecedor.set(f, (m.porFornecedor.get(f) ?? 0) + v);
    m.saiu += v;
    m.pagamentos += 1;
  }
  return { meses: meses.map((m) => porMes.get(m)!), semClasse };
}

/** Linhas do DRE gerencial de um mês (ou da soma de vários). */
export function dre(m: { vendas: number; porGrupo: Record<GrupoDre, number> }) {
  const g = m.porGrupo;
  const receita = m.vendas;
  const liquida = receita - g.impostos;
  const bruto = liquida - g.produto;
  const contribuicao = bruto - g.variaveis;
  const fixas = g.pessoal + g.prolabore + g.ocupacao + g.marketing + g.administrativo;
  const operacional = contribuicao - fixas;
  const naoOperacional = g.investimentos + g.dividas + g.outros;
  const caixa = operacional - naoOperacional;
  return { receita, liquida, bruto, contribuicao, fixas, operacional, naoOperacional, caixa };
}

/** % de despesas fixas sobre as vendas, como entra na precificação. */
export function percentualFixas(meses: { vendas: number; porGrupo: Record<GrupoDre, number> }[], comProlabore = true) {
  const vendas = meses.reduce((t, m) => t + m.vendas, 0);
  const fixas = meses.reduce((t, m) => t + m.porGrupo.pessoal + m.porGrupo.ocupacao + m.porGrupo.marketing + m.porGrupo.administrativo + (comProlabore ? m.porGrupo.prolabore : 0), 0);
  return vendas > 0 ? (fixas / vendas) * 100 : null;
}

export const somarMeses = (meses: Mes[]) => {
  const porGrupo = vazioGrupos();
  for (const m of meses) for (const g of GRUPOS) porGrupo[g.id] += m.porGrupo[g.id];
  return { vendas: meses.reduce((t, m) => t + m.vendas, 0), saiu: meses.reduce((t, m) => t + m.saiu, 0), porGrupo };
};

export const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesCurto = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}`;
export const mesLongo = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

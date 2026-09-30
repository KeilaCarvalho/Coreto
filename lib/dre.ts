export const dreGroups = [
  { id: "deductions", label: "Deduções da receita", master: "Deduções da receita", categories: ["Simples Nacional sobre faturamento", "Descontos incondicionais concedidos", "Devoluções de vendas"] },
  { id: "cmv", label: "Mercadorias para revenda · CMV", master: "Custos operacionais", categories: ["CMV - mercadorias para revenda"] },
  { id: "cpv", label: "Produção própria · CPV", master: "Custos operacionais", categories: ["Tecidos", "Aviamentos", "Mão de obra direta - Corte", "Mão de obra direta - Facção", "Mão de obra direta - Modelagem", "Embalagens incorporadas ao produto"] },
  { id: "selling", label: "Vendas", master: "Despesas comerciais", categories: ["Taxas e comissões de cartões", "Correios e remessas a clientes", "Freelancer de vendas", "Fretes e entregas a clientes", "Embalagens de venda"] },
  { id: "marketing", label: "Marketing e ações comerciais", master: "Despesas comerciais", categories: ["Brindes para clientes", "Coquetéis e eventos comerciais", "Manutenção de vitrine", "Tráfego pago", "Marketing e publicidade"] },
  { id: "people", label: "Pessoal", master: "Despesas administrativas", categories: ["Salários", "Férias", "FGTS", "Décimo terceiro", "Rescisões", "Pró-labore da administração", "Ajuda de custo", "Confraternizações", "Cursos e treinamentos", "Exames médicos ocupacionais", "Gratificações e premiações", "Planos de saúde e odontológico", "Seguro de vida", "Uniformes", "Lanches e refeições da equipe"] },
  { id: "services", label: "Serviços de terceiros", master: "Despesas administrativas", categories: ["Honorários advocatícios", "Consultoria administrativa e financeira", "Honorários contábeis", "Prestadores PJ administrativos"] },
  { id: "admin", label: "Estrutura e despesas administrativas", master: "Despesas administrativas", categories: ["Água e esgoto", "Aluguel predial", "Condomínio", "Transporte, aplicativos e estacionamento", "Extintores", "Material de escritório", "Material de limpeza e higiene", "Material de uso e consumo", "Telefonia e internet", "Manutenção predial", "Seguro de imóveis", "Energia administrativa", "Manutenção de equipamentos administrativos", "Software/sistemas de uso mensal"] },
  { id: "operations", label: "Operação e produção", master: "Outras despesas operacionais", categories: ["Manutenção de máquinas e equipamentos da produção", "Mão de obra de apoio operacional"] },
  { id: "taxes", label: "Despesas tributárias", master: "Outras despesas operacionais", categories: ["Alvará de funcionamento", "IPTU", "Taxa de lixo", "DIFAL não recuperável"] },
  { id: "other", label: "Outras despesas operacionais", master: "Outras despesas operacionais", categories: ["Perdas de estoque, caixa ou imobilizado"] },
  { id: "financial", label: "Despesas financeiras", master: "Resultado financeiro", categories: ["Juros bancários ou de fornecedores", "Tarifas bancárias", "Tarifas de transferências", "Multas financeiras"] },
  { id: "excluded", label: "Fora da DRE · patrimonial / adiantamentos", master: "Fora da DRE", categories: ["Distribuição/antecipação de lucros", "Despesas pessoais dos sócios", "Compra de móveis e utensílios", "Principal de empréstimos e parcelamentos", "Adiantamento salarial", "Tributos retidos a compensar"] },
] as const;
export type DreGroupId = typeof dreGroups[number]["id"];
export type DreEntry = { row: number; supplier: string; description: string; competence: string; dueDate: string; paymentDate: string | null; category: string; status: string; original: number; paid: number; open: number; interest: number; penalty: number; discount: number };
export type DreMapping = Record<string, DreGroupId | "pending">;
export type DreInputs = { revenue: number | null; freight: number | null; financialIncome: number | null; cmv: number | null; cpv: number | null };
export const emptyDreInputs: DreInputs = { revenue: null, freight: null, financialIncome: null, cmv: null, cpv: null };
export const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliases: Record<string, DreGroupId> = {};
for (const group of dreGroups) for (const category of group.categories) aliases[normalize(category)] = group.id;
for (const [id, names] of Object.entries({
  deductions: ["Simples Nacional - DAS"], cpv: ["M.O.D - Facção", "M.O.D - Corte", "M.O.D - Modelagem"],
  selling: ["Tarifas de Cartões de Crédito"], marketing: ["Publicidade e Propaganda", "Prestação de serviços - Marketing"],
  people: ["Gratificações / Premiações", "Pró-labore Deborah"],
  admin: ["Materiais de Escritório", "Despesas com Transporte - Uber/Mototáxi/Estacionamento"],
  excluded: ["Aquisição de Móveis e Utensílios", "Amortização de Empréstimos com Terceiros"],
})) for (const name of names) aliases[normalize(name)] = id as DreGroupId;
export function categoryGroup(category: string, mapping: DreMapping = {}): DreGroupId | "pending" { return mapping[category] || aliases[normalize(category)] || "pending"; }
export function cents(value: number) { return Math.round((value + Number.EPSILON) * 100); }
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let text = String(value ?? "").trim(); if (!text) return null;
  text = text.replace(/R\$|\s/g, "");
  if (/^\(.*\)$/.test(text)) text = "-" + text.slice(1, -1);
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text); return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}
export function parseDate(value: unknown): string | null {
  if (typeof value === "number" && value > 0 && value < 2958466) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  const text = String(value ?? "").trim(); const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso + "T12:00:00Z"); return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === iso ? iso : null;
}
export function parseContaAzulRows(grid: unknown[][]) {
  const header = grid.findIndex(row => row.some(v => normalize(v) === "data de competencia") && row.some(v => normalize(v) === "categoria 1"));
  if (header < 0) throw new Error("Cabeçalho não reconhecido. Exporte a Visão Contas a Pagar do Conta Azul com Data de competência e Categoria 1.");
  const columns = grid[header].map(normalize);
  const index = (name: string) => columns.indexOf(normalize(name));
  const required = ["Data de competência", "Data de vencimento", "Descrição", "Situação", "Valor original da parcela (R$)", "Valor total pago da parcela (R$)", "Valor total da parcela em aberto (R$)", "Categoria 1"];
  for (const name of required) if (index(name) < 0) throw new Error(`Coluna obrigatória ausente: ${name}.`);
  const entries: DreEntry[] = [], errors: string[] = []; let skipped = 0;
  for (let i = header + 1; i < grid.length; i++) {
    const row = grid[i]; if (!row.some(v => v !== null && v !== undefined && String(v).trim() !== "")) continue;
    const get = (name: string) => row[index(name)];
    const status = String(get("Situação") ?? "");
    if (normalize(status).includes("cancelad")) { skipped++; continue; }
    if (!String(get("Data de competência") ?? "").trim() && row.slice(0, 3).some(v => /^total( geral)?$/.test(normalize(v)))) { skipped++; continue; }
    const competence = parseDate(get("Data de competência")), dueDate = parseDate(get("Data de vencimento"));
    const original = parseMoney(get("Valor original da parcela (R$)"));
    const paid = parseMoney(get("Valor total pago da parcela (R$)")), open = parseMoney(get("Valor total da parcela em aberto (R$)"));
    const adjustments = ["Juros realizado (R$)", "Multa realizado (R$)", "Desconto realizado (R$)"].map(name => get(name) == null || get(name) === "" ? 0 : parseMoney(get(name)));
    const extraCategories = columns.some((name, col) => /^categoria [2-9]\d*$/.test(name) && String(row[col] ?? "").trim());
    const paymentValue = get("Data do último pagamento"), paymentDate = paymentValue == null || paymentValue === "" ? null : parseDate(paymentValue);
    if (!competence || !dueDate || original === null || paid === null || open === null || adjustments.includes(null) || (paymentValue && !paymentDate) || extraCategories) {
      errors.push(`Linha ${i + 1}: ${extraCategories ? "mais de uma categoria; revise o rateio no arquivo" : "data ou valor ausente/inválido"}.`); continue;
    }
    entries.push({ row: i + 1, supplier: String(get("Nome do fornecedor") ?? ""), description: String(get("Descrição") ?? ""), competence, dueDate, paymentDate, category: String(get("Categoria 1") ?? "").trim() || "Sem categoria", status, original, paid, open, interest: adjustments[0]!, penalty: adjustments[1]!, discount: adjustments[2]! });
  }
  if (!entries.length && !errors.length) throw new Error("O arquivo não contém lançamentos para importar.");
  if (entries.length > 5000) throw new Error("Importe até 5.000 lançamentos por arquivo.");
  return { entries, errors, skipped, months: [...new Set(entries.map(row => row.competence.slice(0,7)))].sort() };
}
export function summarizeDre(entries: DreEntry[], mapping: DreMapping, inputs: DreInputs, month: string) {
  const rows = entries.filter(row => row.competence.slice(0,7) === month && !normalize(row.status).includes("cancelad"));
  const totals = Object.fromEntries(dreGroups.map(group => [group.id, 0])) as Record<DreGroupId, number>;
  const categories = new Map<string, { category: string; group: DreGroupId | "pending"; amount: number; count: number }>();
  let pending = 0, original = 0, paid = 0, open = 0;
  for (const row of rows) {
    const group = categoryGroup(row.category, mapping), amount = cents(row.original);
    original += amount; paid += cents(row.paid); open += cents(row.open);
    if (group === "pending") pending += amount; else totals[group] += amount;
    const item = categories.get(row.category) || { category: row.category, group, amount: 0, count: 0 }; item.amount += amount; item.count++; categories.set(row.category, item);
  }
  for (const key of Object.keys(totals) as DreGroupId[]) totals[key] /= 100;
  const gross = inputs.revenue === null || inputs.freight === null ? null : (cents(inputs.revenue) + cents(inputs.freight)) / 100;
  const net = gross === null ? null : (cents(gross) - cents(totals.deductions)) / 100;
  const cmv = inputs.cmv ?? (rows.length && !rows.some(row => categoryGroup(row.category, mapping) === "cmv") ? 0 : null);
  const cpv = inputs.cpv ?? (rows.length && !rows.some(row => categoryGroup(row.category, mapping) === "cpv") ? 0 : null);
  const costs = cmv === null || cpv === null ? null : (cents(cmv) + cents(cpv)) / 100;
  const grossProfit = net === null || costs === null ? null : (cents(net) - cents(costs)) / 100;
  const expenses = ["selling", "marketing", "people", "services", "admin", "operations", "taxes", "other"].reduce((sum, key) => sum + cents(totals[key as DreGroupId]), 0) / 100;
  const operating = grossProfit === null ? null : (cents(grossProfit) - cents(expenses)) / 100;
  const financial = inputs.financialIncome === null ? null : (cents(inputs.financialIncome) - cents(totals.financial)) / 100;
  const hasPending = rows.some(row => categoryGroup(row.category, mapping) === "pending");
  const result = !rows.length || hasPending || operating === null || financial === null ? null : (cents(operating) + cents(financial)) / 100;
  return { totals, categories: [...categories.values()].map(item => ({ ...item, amount: item.amount / 100 })).sort((a,b) => b.amount - a.amount), pending: pending / 100, pendingCount: rows.filter(row => categoryGroup(row.category, mapping) === "pending").length, original: original / 100, paid: paid / 100, open: open / 100, count: rows.length, gross, net, cmv, cpv, costs, grossProfit, expenses, operating, financial, result, margin: result === null || !net ? null : result / net * 100 };
}

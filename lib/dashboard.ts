export type DashboardSale = { amount: number; saleDate: string; reportMonth: string | null; recordType: string; sellerName: string; saleCount: number; quantity: number };
export function selectSalesSource(rows: DashboardSale[], types: string[]) {
  for (const type of types) { const selected = rows.filter(row => (row.recordType || "detailed") === type); if (selected.length) return selected; }
  return [];
}
export function summarizeSales(rows: DashboardSale[]) {
  const totalRows = selectSalesSource(rows, ["annual", "daily", "detailed"]);
  const sellerRows = selectSalesSource(rows, ["sellers", "detailed"]);
  const sellers = new Map<string, { name: string; amount: number; count: number }>();
  for (const row of sellerRows) {
    if (!row.sellerName || row.sellerName === "Não informado") continue;
    const current = sellers.get(row.sellerName) || { name: row.sellerName, amount: 0, count: 0 };
    current.amount += row.amount; current.count += row.saleCount || 0; sellers.set(row.sellerName, current);
  }
  const daily = new Map<string, number>();
  for (const row of selectSalesSource(rows, ["daily", "detailed"])) daily.set(row.saleDate, (daily.get(row.saleDate) || 0) + row.amount);
  return { revenue: totalRows.length ? totalRows.reduce((sum, row) => sum + row.amount, 0) : null, source: totalRows[0]?.recordType || null, ranking: [...sellers.values()].sort((a,b) => b.amount-a.amount), days: [...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,amount])=>({date,amount})) };
}

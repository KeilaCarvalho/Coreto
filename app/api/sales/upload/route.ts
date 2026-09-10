import { env } from "cloudflare:workers";
import { accessError, getCurrentAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const money = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const isoDate = (value: string) => { const [day, month, rawYear] = value.split("/"); return `${rawYear.length === 2 ? `20${rawYear}` : rawYear}-${month}-${day}`; };
const reportMonth = (text: string) => { const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(?:à|a)\s*\d{2}\/\d{2}\/\d{4}/i); return match ? `${match[3]}-${match[2]}` : ""; };

function parseDaily(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const saleIds = new Map<string, Set<string>>();
  for (const line of lines) { const item = line.match(/([\d.]+,\d{2})(\d{2}\/\d{2}\/\d{2})(\d{6})\s+[\d,]+\d{6}$/); if (!item) continue; const date = isoDate(item[2]); if (!saleIds.has(date)) saleIds.set(date, new Set()); saleIds.get(date)?.add(item[3]); }
  let activeDate = ""; const rows: Record<string, string>[] = [];
  for (const line of lines) { const heading = line.match(/^Data Movimentação (\d{2}\/\d{2}\/\d{2})/); if (heading) activeDate = isoDate(heading[1]); const total = line.match(/^Total Parcial :\s+([\d.]+,\d{2})(\d{3})\s/); if (total && activeDate) rows.push({ Data: activeDate, Valor: String(money(total[1])), Quantidade: String(Number(total[2])), Vendas: String(saleIds.get(activeDate)?.size || 0) }); }
  return rows;
}

function parseProducts(text: string) { const rows: Record<string, string>[] = []; for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/\s+/g, " ").trim(); const match = line.match(/^(.+?)\s+(\d{3})\s+([\d.]+,\d{2})(.+?)\s+([\d.]+,\d{2})\s+([\d,]+)(\d{6})$/); if (match) rows.push({ Produto: match[4].trim(), Referência: match[1].trim(), Código: match[7], Quantidade: String(Number(match[2])), Valor: "0", Preço_venda: String(money(match[5])) }); } return rows; }
function parseAnnual(text: string) { const rows: Record<string, string>[] = []; let month = ""; for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/\s+/g, " ").trim(); const heading = line.match(/^Mes \/ Ano : (\d{2})\/(\d{4})/); if (heading) month = `${heading[2]}-${heading[1]}`; const match = line.match(/^CORETO\s+(\d+)\s+\d{3}(\d+)\s+([\d.]+,\d{2})\s+/); if (match && month) rows.push({ Data: `${month}-01`, Mês: month, Quantidade: String(Number(match[1])), Vendas: String(Number(match[2])), Valor: String(money(match[3])) }); } return rows; }
function parseSellers(text: string) { const rows: Record<string, string>[] = [], month = reportMonth(text); for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/\s+/g, " ").trim(); const match = line.match(/^\d+\s+(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d{3})\s+(\d{3})\s+/); if (match) rows.push({ Data: month ? `${month}-01` : "", Vendedora: match[1].trim(), Valor: String(money(match[2])), Comissão: String(money(match[3])), Vendas: String(Number(match[4])), Quantidade: String(Number(match[5])) }); } return rows; }

function parseKnownReport(text: string) {
  if (text.includes("Relatório de Venda de Produtos") && text.includes("Agrupamento por Data")) return { detectedType: "daily", label: "Vendas por dia", rows: parseDaily(text), month: reportMonth(text) };
  if (text.includes("Relatório Curva ABC de Produtos")) return { detectedType: "products", label: "Produtos mais vendidos", rows: parseProducts(text), month: reportMonth(text) };
  if (text.includes("Relatório de Evolução de Vendas")) { const rows = parseAnnual(text); return { detectedType: "annual", label: "Resumo geral do ano", rows, month: rows.at(-1)?.Mês || "" }; }
  if (text.includes("Relatório de Resumo de Comissão Vendedor")) return { detectedType: "sellers", label: "Comissão por vendedor", rows: parseSellers(text), month: reportMonth(text) };
  return { detectedType: "", label: "Relatório não reconhecido", rows: [] as Record<string, string>[], month: "" };
}

export async function POST(request: Request) {
  try {
    const denied = accessError(await getCurrentAccess(), ["admin", "chefe"]); if (denied) return denied;
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
    if (file.type !== "application/pdf") return Response.json({ error: "Envie um arquivo em PDF." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return Response.json({ error: "O PDF deve ter no máximo 15 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), key = `sales-reports/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: file.type } });
    const { extractText, getDocumentProxy } = await import("unpdf"); const pdf = await getDocumentProxy(bytes); const result = await extractText(pdf, { mergePages: true }); const text = typeof result.text === "string" ? result.text : result.text.join("\n");
    const parsed = parseKnownReport(text);
    if (!parsed.rows.length) return Response.json({ error: "Este formato de PDF ainda não foi reconhecido. Envie um dos quatro relatórios padrão da Coreto." }, { status: 422 });
    return Response.json({ ...parsed, fileName: file.name, key });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao ler o PDF." }, { status: 500 }); }
}

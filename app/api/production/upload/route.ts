import { env } from "cloudflare:workers";
import { accessError, getCurrentAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

type ExtractedItem = { name: string; unit: string; totalValue: number; totalQuantity: number; invoiceDate: string; invoiceNumber: string; observation: string; needsReview: boolean };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const moneyNumber = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const cleanFileName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

function readDate(text: string) { const match = text.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})\b/); return match ? `${match[3]}-${match[2]}-${match[1]}` : today(); }
function readInvoiceNumber(text: string) { return text.match(/(?:nota\s*fiscal|nf-?e|n[º°o]\.?)[^\d]{0,12}(\d{3,12})/i)?.[1] || ""; }

function extractItems(text: string, fileName: string): ExtractedItem[] {
  const invoiceDate = readDate(text), invoiceNumber = readInvoiceNumber(text), found: ExtractedItem[] = [], seen = new Set<string>();
  const ignored = /^(total|subtotal|desconto|imposto|icms|cnpj|cpf|endereço|telefone|chave|vencimento|pagamento)/i;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 8 || line.length > 180 || ignored.test(line)) continue;
    const match = line.match(/^(.{3,100}?)\s+(\d+(?:[.,]\d+)?)\s+(?:[A-Z]{1,5}\s+)?(?:R\$\s*)?([\d.]+,\d{2})\s+(?:R\$\s*)?([\d.]+,\d{2})$/i);
    if (!match) continue;
    const name = match[1].replace(/^\d+\s+/, "").trim(), quantity = moneyNumber(match[2]), totalValue = moneyNumber(match[4]);
    if (!name || quantity <= 0 || totalValue <= 0 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    found.push({ name, unit: "unidade", totalValue, totalQuantity: quantity, invoiceDate, invoiceNumber, observation: "Importado de documento; revise antes de confirmar.", needsReview: true });
    if (found.length >= 30) break;
  }
  if (found.length) return found;
  const values = [...text.matchAll(/(?:R\$\s*)?([\d.]+,\d{2})/g)].map((match) => moneyNumber(match[1])).filter((value) => value > 0);
  return [{ name: cleanFileName(fileName) || "Item do documento", unit: "unidade", totalValue: values.length ? Math.max(...values) : 0, totalQuantity: 1, invoiceDate, invoiceNumber, observation: "Leitura inicial do documento; confira nome, quantidade e valor.", needsReview: true }];
}

export async function POST(request: Request) {
  try {
    const denied = accessError(await getCurrentAccess(), ["admin"]); if (denied) return denied;
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
    if (!/^(application\/pdf|image\/)/.test(file.type)) return Response.json({ error: "Envie PDF ou imagem." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), key = `invoices/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: file.type } });
    let text = "";
    if (file.type === "application/pdf") {
      try { const { extractText, getDocumentProxy } = await import("unpdf"); const pdf = await getDocumentProxy(bytes); const result = await extractText(pdf, { mergePages: true }); text = typeof result.text === "string" ? result.text : result.text.join("\n"); } catch { text = ""; }
    }
    const extractedItems = extractItems(text, file.name).map((item) => ({ ...item, sourceFileKey: key }));
    return Response.json({ key, fileName: file.name, status: text ? "extracted" : "needs_review", extractedItems, readableText: Boolean(text) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha no upload." }, { status: 500 }); }
}

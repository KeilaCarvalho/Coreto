import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cutBatches, priceHistory, pricingSettings, productVariantSuggestions, supplies, technicalSheets } from "@/db/schema";
export const dynamic = "force-dynamic";
const n = (value: unknown) => Number(value) || 0;

export async function GET() {
  try {
    const db = getDb();
    const [supplyRows, cutRows, sheetRows, historyRows, variants, settingsRows] = await Promise.all([
      db.select().from(supplies).orderBy(desc(supplies.invoiceDate), desc(supplies.id)),
      db.select().from(cutBatches).orderBy(desc(cutBatches.finishedAt), desc(cutBatches.id)),
      db.select().from(technicalSheets).orderBy(desc(technicalSheets.updatedAt), desc(technicalSheets.id)),
      db.select().from(priceHistory).orderBy(desc(priceHistory.definedAt), desc(priceHistory.id)),
      db.select().from(productVariantSuggestions),
      db.select().from(pricingSettings).limit(1),
    ]);
    return Response.json({ supplies: supplyRows, cuts: cutRows.map((r) => ({ ...r, workDays: JSON.parse(r.workDaysJson) })), sheets: sheetRows.map((r) => ({ ...r, materials: JSON.parse(r.materialsJson), labor: JSON.parse(r.laborJson) })), priceHistory: historyRows, variants, settings: settingsRows[0] ?? { simpleRate: 0, cardRate: 0, commissionRate: 0, fixedExpenseRate: 0 } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar dados." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const action = String(body.action ?? ""); const db = getDb();
    if (action === "supply") {
      if (!String(body.name ?? "").trim() || !String(body.supplier ?? "").trim() || n(body.unitValue) <= 0) return Response.json({ error: "Preencha o insumo, fornecedor e valor unitário." }, { status: 400 });
      const [row] = await db.insert(supplies).values({ name: String(body.name).trim(), unit: String(body.unit || "unidade"), unitValue: n(body.unitValue), supplier: String(body.supplier).trim(), invoiceDate: String(body.invoiceDate), invoiceNumber: String(body.invoiceNumber || "") || null, observation: String(body.observation || "") || null }).returning(); return Response.json({ row }, { status: 201 });
    }
    if (action === "cut") {
      const days = Array.isArray(body.workDays) ? body.workDays as { date: string; dailyRate: number }[] : []; const totalCost = days.reduce((s, d) => s + n(d.dailyRate), 0); const quantity = n(body.quantity);
      if (!String(body.model ?? "").trim() || !days.length || quantity < 1) return Response.json({ error: "Informe modelo, dias trabalhados e quantidade produzida." }, { status: 400 });
      const [row] = await db.insert(cutBatches).values({ model: String(body.model).trim(), workDaysJson: JSON.stringify(days), totalCost, quantity, costPerPiece: totalCost / quantity, finishedAt: String(body.finishedAt) }).returning(); return Response.json({ row }, { status: 201 });
    }
    if (action === "sheet") {
      const materials = Array.isArray(body.materials) ? body.materials as { supplyId: number; quantity: number; unitValue: number }[] : []; const labor = Array.isArray(body.labor) ? body.labor as { type: string; value: number }[] : [];
      const materialCost = materials.reduce((s, i) => s + n(i.quantity) * n(i.unitValue), 0); const laborCost = labor.reduce((s, i) => s + n(i.value), 0); const rates = body.rates as Record<string, number> ?? {};
      if (!String(body.reference ?? "").trim()) return Response.json({ error: "Informe a referência da peça." }, { status: 400 });
      const [row] = await db.insert(technicalSheets).values({ reference: String(body.reference).trim(), variant: String(body.variant || "") || null, materialsJson: JSON.stringify(materials), laborJson: JSON.stringify(labor), materialCost, laborCost, totalCost: materialCost + laborCost, simpleRate: n(rates.simple), cardRate: n(rates.card), commissionRate: n(rates.commission), fixedExpenseRate: n(rates.fixed), desiredProfitRate: n(body.desiredProfit) }).returning(); return Response.json({ row }, { status: 201 });
    }
    if (action === "price") {
      const sheetId = n(body.sheetId), practicedPrice = n(body.practicedPrice), definedAt = String(body.definedAt); const [sheet] = await db.select().from(technicalSheets).where(eq(technicalSheets.id, sheetId)).limit(1); if (!sheet || practicedPrice <= 0) return Response.json({ error: "Ficha ou preço inválido." }, { status: 400 });
      const taxes = sheet.simpleRate + sheet.cardRate + sheet.commissionRate + sheet.fixedExpenseRate; const realMarginRate = ((practicedPrice - sheet.totalCost - practicedPrice * taxes / 100) / practicedPrice) * 100;
      await db.batch([db.update(technicalSheets).set({ currentPrice: practicedPrice, pricedAt: definedAt, updatedAt: new Date().toISOString() }).where(eq(technicalSheets.id, sheetId)), db.insert(priceHistory).values({ technicalSheetId: sheetId, practicedPrice, realMarginRate, definedAt })]); return Response.json({ realMarginRate });
    }
    if (action === "settings") {
      const values = { id: 1, simpleRate: n(body.simple), cardRate: n(body.card), commissionRate: n(body.commission), fixedExpenseRate: n(body.fixed), updatedAt: new Date().toISOString() }; await db.insert(pricingSettings).values(values).onConflictDoUpdate({ target: pricingSettings.id, set: values }); return Response.json({ settings: values });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar dados." }, { status: 500 }); }
}

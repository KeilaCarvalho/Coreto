import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { dreMonths } from "@/db/schema";
import { accessError, getCurrentAccess } from "@/lib/access";
import { dreGroups, emptyDreInputs, parseDate } from "@/lib/dre";
export const dynamic = "force-dynamic";
const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const date = z.string().refine(value => parseDate(value) === value);
const amount = z.number().finite().min(-1e10).max(1e10).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.001);
const text = z.string().max(1500);
const entry = z.object({ row: z.number().int().positive(), supplier: text, description: text, competence: date, dueDate: date, paymentDate: date.nullable(), category: z.string().min(1).max(300), status: text, original: amount, paid: amount, open: amount, interest: amount, penalty: amount, discount: amount });
const inputs = z.object({ revenue: amount.refine(value => value >= 0).nullable(), freight: amount.refine(value => value >= 0).nullable(), financialIncome: amount.refine(value => value >= 0).nullable(), cmv: amount.refine(value => value >= 0).nullable(), cpv: amount.refine(value => value >= 0).nullable() });
const bodySchema = z.object({ month: monthSchema, revision: z.number().int().nonnegative(), entries: z.array(entry).max(5000), mapping: z.record(z.string().max(300), z.string().refine(value => value === "pending" || dreGroups.some(group => group.id === value))), inputs, fileName: z.string().max(255).nullable() });
export async function GET(request: Request) {
  try {
    const denied = accessError(await getCurrentAccess(), ["admin", "chefe"]); if (denied) return denied;
    const parsed = monthSchema.safeParse(new URL(request.url).searchParams.get("month"));
    if (!parsed.success) return Response.json({ error: "Selecione um mês válido." }, { status: 400 });
    const [row] = await getDb().select().from(dreMonths).where(eq(dreMonths.month, parsed.data)).limit(1);
    return Response.json(row ? { month: row.month, entries: JSON.parse(row.entriesJson), mapping: JSON.parse(row.mappingJson), inputs: { ...emptyDreInputs, ...JSON.parse(row.inputsJson) }, fileName: row.fileName, revision: row.revision, updatedAt: row.updatedAt } : { month: parsed.data, entries: [], mapping: {}, inputs: emptyDreInputs, fileName: null, revision: 0, updatedAt: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("DRE load failed", error); return Response.json({ error: "Não foi possível carregar a DRE. Tente novamente." }, { status: 503 }); }
}
export async function PUT(request: Request) {
  try {
    const user = await getCurrentAccess(); const denied = accessError(user, ["admin", "chefe"]); if (denied || !user) return denied!;
    const raw = await request.text(); if (raw.length > 5 * 1024 * 1024) return Response.json({ error: "Importação muito grande. Reduza o período do arquivo." }, { status: 413 });
    const parsed = bodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: "Confira os valores e as datas da importação." }, { status: 400 });
    const data = parsed.data;
    if (data.entries.some(row => row.competence.slice(0,7) !== data.month)) return Response.json({ error: "O arquivo contém lançamentos de outra competência." }, { status: 400 });
    const values = { month: data.month, entriesJson: JSON.stringify(data.entries), mappingJson: JSON.stringify(data.mapping), inputsJson: JSON.stringify(data.inputs), fileName: data.fileName, updatedBy: user.email, updatedAt: new Date().toISOString(), revision: data.revision + 1 };
    const db = getDb();
    const rows = data.revision === 0
      ? await db.insert(dreMonths).values(values).onConflictDoNothing().returning({ revision: dreMonths.revision })
      : await db.update(dreMonths).set(values).where(sql`${dreMonths.month} = ${data.month} AND ${dreMonths.revision} = ${data.revision}`).returning({ revision: dreMonths.revision });
    if (!rows.length) return Response.json({ error: "Este mês foi atualizado em outra tela. Recarregue a DRE antes de salvar para preservar as alterações." }, { status: 409 });
    return Response.json({ revision: rows[0].revision, updatedAt: values.updatedAt });
  } catch (error) { console.error("DRE save failed", error); return Response.json({ error: "Não foi possível salvar a DRE. Suas alterações continuam na tela." }, { status: 500 }); }
}

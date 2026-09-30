import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { monthlyFinance, receipts, salesRecords } from "@/db/schema";
import { accessError, getCurrentAccess } from "@/lib/access";
import { summarizeSales } from "@/lib/dashboard";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getCurrentAccess(); const denied = accessError(user, ["admin","chefe","conferente","vendedora"]); if (denied || !user) return denied!;
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0,7);
    const [year, number] = month.split("-").map(Number);
    const next = number === 12 ? `${year+1}-01-01` : `${year}-${String(number+1).padStart(2,"0")}-01`;
    const db = getDb(), financeAllowed = ["admin","chefe"].includes(user.role), stockAllowed = ["admin","chefe","conferente"].includes(user.role);
    const [sales, monthly, stock, recent] = await Promise.all([
      financeAllowed ? db.select().from(salesRecords).where(or(eq(salesRecords.reportMonth,month),and(sql`${salesRecords.reportMonth} IS NULL`,gte(salesRecords.saleDate,`${month}-01`),lt(salesRecords.saleDate,next)))) : Promise.resolve([]),
      financeAllowed ? db.select().from(monthlyFinance).where(eq(monthlyFinance.month,month)).limit(1) : Promise.resolve([]),
      stockAllowed ? db.select({ pieces: sql<number>`coalesce(sum(${receipts.quantity}),0)`, deliveries: sql<number>`count(distinct coalesce(nullif(${receipts.batchKey},''), ${receipts.receivedAt} || ':' || ${receipts.model}))` }).from(receipts).where(and(gte(receipts.receivedAt,`${month}-01`),lt(receipts.receivedAt,next))) : Promise.resolve([]),
      stockAllowed ? db.select({ id:receipts.id,model:receipts.model,color:receipts.color,size:receipts.size,quantity:receipts.quantity,receivedAt:receipts.receivedAt,batchKey:receipts.batchKey }).from(receipts).where(and(gte(receipts.receivedAt,`${month}-01`),lt(receipts.receivedAt,next))).orderBy(desc(receipts.receivedAt),desc(receipts.id)).limit(5) : Promise.resolve([]),
    ]);
    const summary = summarizeSales(sales);
    const entries = monthly[0] ? JSON.parse(monthly[0].paymentEntriesJson) as { value: number }[] : [];
    const manualSellers = monthly[0] ? JSON.parse(monthly[0].sellerSalesJson) as {name:string;value:number}[] : [];
    const manualRanking = [...manualSellers.reduce((map,item)=>{const name=item.name.trim();if(name)map.set(name,(map.get(name)||0)+Number(item.value||0));return map;},new Map<string,number>())].map(([name,amount])=>({name,amount,count:0})).sort((a,b)=>b.amount-a.amount);
    return Response.json({ month, finance: financeAllowed ? { revenue: entries.length ? entries.reduce((sum,item)=>sum+Number(item.value || 0),0) : summary.revenue, revenueSource: entries.length ? "Fluxo financeiro mensal" : summary.source ? "Relatórios de vendas" : null, accountsPaid:monthly[0]?.accountsPaid ?? null, accountsPayable:monthly[0]?.accountsPayable ?? null, ranking:summary.ranking.length ? summary.ranking : manualRanking, rankingSource:summary.ranking.length ? "Relatórios de vendas" : manualRanking.length ? "Fluxo financeiro mensal" : null, days:summary.days } : null, stock:stockAllowed ? { pieces:Number(stock[0]?.pieces || 0), deliveries:Number(stock[0]?.deliveries || 0), recent } : null });
  } catch { return Response.json({error:"Não foi possível carregar o resumo do mês."},{status:500}); }
}

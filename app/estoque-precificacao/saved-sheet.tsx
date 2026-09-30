"use client";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Supply = { id: number; name: string; unit: string };
type Sheet = {
  id: number;
  reference: string;
  variant?: string;
  materials: { supplyId: number; quantity: number; unitValue: number }[];
  labor: { type: string; value: number }[];
  materialCost: number;
  laborCost: number;
  totalCost: number;
  simpleRate: number;
  cardRate: number;
  commissionRate: number;
  fixedExpenseRate: number;
  desiredProfitRate: number;
  currentPrice?: number;
};
type PriceHistory = { id: number; technicalSheetId: number; practicedPrice: number; realMarginRate: number; definedAt: string };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (value: string) => {
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
};

export function SavedSheet({ sheet, supplies, priceHistory }: { sheet: Sheet; supplies: Supply[]; priceHistory: PriceHistory[] }) {
  const taxRate = sheet.simpleRate + sheet.cardRate + sheet.commissionRate + sheet.fixedExpenseRate;
  const divisor = 1 - (taxRate + sheet.desiredProfitRate) / 100;
  const calculatedPrice = divisor > 0 ? sheet.totalCost / divisor : 0;
  const history = priceHistory.filter((item) => item.technicalSheetId === sheet.id);
  const latest = history[0];

  return (
    <AccordionItem value={String(sheet.id)} className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white px-5 shadow-sm">
      <AccordionTrigger className="hover:no-underline">
        <div className="grid flex-1 gap-3 pr-3 text-left sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="text-base font-semibold text-[#111827]">{sheet.reference}</p>
            <p className="mt-0.5 text-xs font-normal text-[#6B7280]">{sheet.variant || "Sem variação cadastrada"}</p>
          </div>
          <Summary label="Custo total" value={brl(sheet.totalCost)} />
          <Summary label="Preço praticado" value={sheet.currentPrice ? brl(sheet.currentPrice) : "Sem preço"} accent />
        </div>
      </AccordionTrigger>

      <AccordionContent>
        <div className="border-t border-[#E5E7EB] pt-5">
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 font-bold text-[#111827]">Materiais utilizados</h3>
              {sheet.materials.length === 0 ? <Empty text="Nenhum material registrado." /> : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Insumo</TableHead><TableHead>Quantidade</TableHead><TableHead>Valor unitário</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
                    <TableBody>{sheet.materials.map((item, index) => {
                      const supply = supplies.find((entry) => entry.id === item.supplyId);
                      return <TableRow key={`${item.supplyId}-${index}`}><TableCell className="font-semibold">{supply?.name || `Insumo #${item.supplyId}`}</TableCell><TableCell>{item.quantity.toLocaleString("pt-BR")} {supply?.unit || ""}</TableCell><TableCell>{brl(item.unitValue)}</TableCell><TableCell className="text-right font-bold">{brl(item.quantity * item.unitValue)}</TableCell></TableRow>;
                    })}</TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 font-bold text-[#111827]">Mão de obra</h3>
              {sheet.labor.length === 0 ? <Empty text="Nenhuma mão de obra registrada." /> : <div className="space-y-2">{sheet.labor.map((item, index) => <div key={`${item.type}-${index}`} className="flex items-center justify-between rounded-xl border px-4 py-3"><span>{item.type}</span><b>{brl(item.value)}</b></div>)}</div>}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Cost label="Custo de materiais" value={brl(sheet.materialCost)} />
            <Cost label="Custo de mão de obra" value={brl(sheet.laborCost)} />
            <Cost label="Custo total da peça" value={brl(sheet.totalCost)} strong />
          </div>

          <div className="mt-6 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5">
            <h3 className="font-bold text-[#111827]">Como o preço foi calculado</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Rate label="Simples" value={sheet.simpleRate} />
              <Rate label="Cartão" value={sheet.cardRate} />
              <Rate label="Comissão" value={sheet.commissionRate} />
              <Rate label="Despesas fixas" value={sheet.fixedExpenseRate} />
              <Rate label="Lucro desejado" value={sheet.desiredProfitRate} />
              <Rate label="Total considerado" value={taxRate + sheet.desiredProfitRate} />
            </div>
            <p className="mt-4 text-xs text-[#6B7280]">Preço calculado = custo total ÷ [1 − (taxas + lucro desejado)]</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Cost label="Preço calculado" value={divisor > 0 ? brl(calculatedPrice) : "Taxas inválidas"} />
              <Cost label="Preço praticado" value={sheet.currentPrice ? brl(sheet.currentPrice) : "Não definido"} />
              <Cost label="Margem real" value={latest ? `${latest.realMarginRate.toFixed(2)}%` : "Não calculada"} />
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 font-bold text-[#111827]">Histórico de preços</h3>
            {history.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-[#6B7280]">Ainda não há preços definidos para esta ficha.</div> : (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead>Data da definição</TableHead><TableHead>Preço praticado</TableHead><TableHead>Margem real</TableHead></TableRow></TableHeader>
                  <TableBody>{history.map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.definedAt)}</TableCell><TableCell className="font-bold text-[#2563EB]">{brl(item.practicedPrice)}</TableCell><TableCell className={item.realMarginRate < 0 ? "font-bold text-red-600" : "font-bold text-[#2563EB]"}>{item.realMarginRate.toFixed(2)}%</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="sm:min-w-32 sm:text-right"><p className="text-[11px] font-normal uppercase tracking-wide text-[#6B7280]">{label}</p><p className={`font-semibold ${accent ? "text-[#2563EB]" : "text-[#111827]"}`}>{value}</p></div>;
}
function Cost({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`rounded-xl p-4 ${strong ? "bg-[#111827] text-white" : "bg-white shadow-sm"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
function Rate({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-white p-3 text-center shadow-sm"><p className="text-[11px] text-[#6B7280]">{label}</p><p className="mt-1 font-semibold text-[#111827]">{value.toFixed(2)}%</p></div>;
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-[#F3F5F8] p-4 text-sm text-[#6B7280]">{text}</p>;
}

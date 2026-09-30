"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleCheckBig, CircleDollarSign, Download, Eye, History, Landmark, Pencil, PenLine, Plus, ReceiptText, Save, Trash2, WalletCards, X } from "lucide-react";
import { CoreShell, Panel, isoToday, money } from "@/components/core-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
import { downloadFinancePdf } from "@/lib/finance-pdf";
import { latestAtOrBefore } from "@/lib/finance-history";

type Line = { name: string; value: string };
type StoredLine = { name: string; value: number };
type FinanceRow = { id: number; date: string; totalSales: number; paymentEntries: StoredLine[]; flexibleAccounts: StoredLine[]; bankBalances: StoredLine[]; receivableEntries: StoredLine[]; updatedAt: string };
type MonthlyRow = { month: string; accountsPayable: number; accountsPaid: number; paymentEntries: StoredLine[]; sellerSales: StoredLine[] };
type AppRole = "admin" | "chefe" | "conferente" | "vendedora";

const defaultPayments = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Link de pagamento"];
const emptyPayments = (): Line[] => defaultPayments.map((name) => ({ name, value: "" }));
const emptyReceivables = (): Line[] => Array.from({ length: 3 }, () => ({ name: "", value: "" }));
const toLines = (lines: StoredLine[]): Line[] => lines.length ? lines.map((line) => ({ name: line.name, value: String(line.value) })) : emptyPayments();
const toFixedLines = (lines: StoredLine[] = []): Line[] => Array.from({ length: 3 }, (_, index) => lines[index] ? { name: lines[index].name, value: String(lines[index].value) } : { name: "", value: "" });
const parseCurrency = (raw: string | number) => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const clean = raw.replace(/R\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized = clean;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = clean.replace(thousands, "").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const decimalDigits = clean.length - lastDot - 1;
    normalized = decimalDigits === 3 ? clean.replace(/\./g, "") : clean;
  }
  return Number(normalized) || 0;
};
const numericLines = (lines: Line[]): StoredLine[] => lines.filter((line) => line.name.trim() || parseCurrency(line.value)).map((line) => ({ name: line.name.trim() || "Sem identificação", value: parseCurrency(line.value) }));
const totalLines = (lines: Line[]) => lines.reduce((sum, line) => sum + parseCurrency(line.value), 0);

async function post(body: unknown) {
  const response = await fetch("/api/core", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
  return data;
}

export default function FinancePage() {
  const [date, setDate] = useState(isoToday());
  const [history, setHistory] = useState<FinanceRow[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyRow[]>([]);
  const [dayPayments, setDayPayments] = useState<Line[]>(emptyPayments());
  const [monthPayments, setMonthPayments] = useState<Line[]>(emptyPayments());
  const [sellerSales, setSellerSales] = useState<Line[]>([{ name: "", value: "" }]);
  const [bankBalances, setBankBalances] = useState<Line[]>([{ name: "", value: "" }]);
  const [receivableEntries, setReceivableEntries] = useState<Line[]>(emptyReceivables());
  const [preservedAccounts, setPreservedAccounts] = useState<StoredLine[]>([]);
  const [accountsPayable, setAccountsPayable] = useState("");
  const [accountsPaid, setAccountsPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [activeTab, setActiveTab] = useState("visualizacao");
  const [inheritedFrom, setInheritedFrom] = useState<string | null>(null);

  const month = date.slice(0, 7);
  const load = useCallback(async () => {
    const response = await fetch(`/api/core?date=${date}&month=${month}`);
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Não foi possível carregar o fluxo.");
    setHistory(data.finance || []);
    setMonthlyHistory(data.monthlyFinance || []);
    const day = latestAtOrBefore<FinanceRow>(data.finance || [], date, (row) => row.date);
    const monthRow = latestAtOrBefore<MonthlyRow>(data.monthlyFinance || [], month, (row) => row.month);
    setInheritedFrom(day && day.date !== date ? day.date : null);
    setDayPayments(day ? toLines(day.paymentEntries) : emptyPayments());
    setBankBalances(day?.bankBalances?.length ? toLines(day.bankBalances) : [{ name: "", value: "" }]);
    setReceivableEntries(toFixedLines(day?.receivableEntries));
    setPreservedAccounts(day?.flexibleAccounts || []);
    setMonthPayments(monthRow ? toLines(monthRow.paymentEntries) : emptyPayments());
    setSellerSales(monthRow?.sellerSales?.length ? monthRow.sellerSales.map((line) => ({ name: line.name, value: String(line.value) })) : [{ name: "", value: "" }]);
    setAccountsPayable(monthRow ? String(monthRow.accountsPayable) : "");
    setAccountsPaid(monthRow ? String(monthRow.accountsPaid || 0) : "");
  }, [date, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/session").then((response) => response.json()).then((data) => setRole(data.user?.role || null)).catch(() => setRole(null)); }, []);

  const dayTotal = totalLines(dayPayments);
  const monthTotal = totalLines(monthPayments);
  const sellerSalesTotal = totalLines(sellerSales);
  const balanceTotal = totalLines(bankBalances);
  const receivableTotal = totalLines(receivableEntries);
  const previousDate = useMemo(() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }, [date]);
  const previousDateLabel = new Date(`${previousDate}T12:00:00`).toLocaleDateString("pt-BR");

  async function saveAll(showSuccess = true) {
    setSaving(true);
    try {
      await Promise.all([
        post({ action: "finance", date, paymentEntries: numericLines(dayPayments), flexibleAccounts: preservedAccounts, bankBalances: numericLines(bankBalances), receivableEntries: numericLines(receivableEntries) }),
        post({ action: "monthly_finance", month, paymentEntries: numericLines(monthPayments), sellerSales: numericLines(sellerSales), accountsPayable: parseCurrency(accountsPayable), accountsPaid: parseCurrency(accountsPaid) }),
      ]);
      if (showSuccess) toast.success("Fluxo financeiro salvo.");
      await load();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally { setSaving(false); }
  }

  async function deleteDay(dayDate: string) {
    try {
      await post({ action: "finance_delete", date: dayDate });
      toast.success("Lançamento diário excluído.");
      await load();
    } catch (error) { toast.error((error as Error).message); }
  }

  async function downloadPdf() {
    setCreatingPdf(true);
    try {
      if (role === "admin" && !(await saveAll(false))) return;
      await downloadFinancePdf({
        date,
        previousDateLabel,
        monthTotal,
        previousDayTotal: dayTotal,
        balanceTotal,
        accountsPaid: parseCurrency(accountsPaid),
        accountsPayable: parseCurrency(accountsPayable),
        receivableTotal,
        bankBalances: numericLines(bankBalances),
        receivableEntries: numericLines(receivableEntries),
        monthPayments: numericLines(monthPayments),
        dayPayments: numericLines(dayPayments),
        sellerSales: numericLines(sellerSales),
      });
      toast.success("PDF gerado e baixado.");
    } catch (error) { toast.error((error as Error).message || "Não foi possível gerar o PDF."); }
    finally { setCreatingPdf(false); }
  }

  return <CoreShell active="/fluxo-financeiro" title="Fluxo Financeiro Diário" subtitle="Acompanhe receitas, compromissos e saldos da operação.">
    <Toaster richColors />
    {inheritedFrom && <p role="status" className="mb-4 rounded-xl bg-[#EFF6FF] px-4 py-3 text-sm text-[#4B5563]">Dados mantidos do relatório de {new Date(`${inheritedFrom}T12:00:00`).toLocaleDateString("pt-BR")}. Altere os valores quando precisar e salve o painel para registrar esta data.</p>}
    <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><CalendarDays className="text-[#2563EB]"/><span className="sr-only">Data do relatório</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-44 border-[#DBEAFE] bg-[#F8FAFC]"/></label>
          {role === "chefe" && <span className="rounded-full bg-[#EFF6FF] px-3 py-2 text-xs font-bold text-[#2563EB]">Visualização somente</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {role === "admin" && <TabsList className="grid h-11 grid-cols-2 bg-[#EFF6FF] p-1"><TabsTrigger value="visualizacao" className="gap-2 px-4"><Eye size={16}/>Visualização</TabsTrigger><TabsTrigger value="lancamentos" className="gap-2 px-4"><PenLine size={16}/>Lançamentos</TabsTrigger></TabsList>}
          <Button className="h-11 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={downloadPdf} disabled={creatingPdf || saving}><Download/>{creatingPdf ? "Gerando PDF..." : "Baixar relatório em PDF"}</Button>
        </div>
      </div>

      <TabsContent value="visualizacao" className="mt-0">
        <FinanceOverview date={date} previousDateLabel={previousDateLabel} balanceTotal={balanceTotal} monthTotal={monthTotal} dayTotal={dayTotal} accountsPayable={parseCurrency(accountsPayable)} accountsPaid={parseCurrency(accountsPaid)} receivableTotal={receivableTotal} bankBalances={bankBalances} monthPayments={monthPayments} dayPayments={dayPayments} receivableEntries={receivableEntries} sellerSales={sellerSales}/>
      </TabsContent>

      {role === "admin" && <TabsContent value="lancamentos" className="mt-0 space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] p-5 text-white shadow-lg shadow-[#2563EB]/10"><div><h2 className="text-lg font-semibold">Lançamentos do fluxo</h2><p className="mt-1 text-sm text-white/75">Preencha os valores; a aba Visualização será atualizada automaticamente.</p></div><Button className="bg-white text-[#2563EB] hover:bg-[#EFF6FF]" onClick={() => saveAll()} disabled={saving}><Save/>{saving ? "Salvando..." : "Salvar lançamentos"}</Button></div>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <Panel title="Vendas do dia anterior por forma de pagamento"><p className="mb-4 text-sm text-[#6B7280]">Informe quanto foi vendido em cada forma de pagamento no dia anterior ({previousDateLabel}).</p><EditableLines value={dayPayments} onChange={setDayPayments}/><TotalBar label="Total das vendas do dia anterior" value={dayTotal}/></Panel>
            <Panel title="Vendas do mês por forma de pagamento"><p className="mb-4 text-sm text-[#6B7280]">Preencha o acumulado do mês. Esses valores ficam disponíveis em qualquer dia do mesmo mês.</p><EditableLines value={monthPayments} onChange={setMonthPayments}/><TotalBar label="Total das vendas do mês" value={monthTotal}/></Panel>
            <Panel title="Saldos bancários"><p className="mb-4 text-sm text-[#6B7280]">Cadastre todas as contas. O saldo total soma automaticamente os valores abaixo.</p><EditableLines value={bankBalances} onChange={setBankBalances} namePlaceholder="Banco ou conta"/><TotalBar label="Saldo total disponível" value={balanceTotal}/></Panel>
          </div>
          <div className="space-y-6">
            <Panel title="Contas do mês"><p className="mb-4 text-sm text-[#6B7280]">Informe o total que ainda falta pagar e o total que já foi pago no mês selecionado.</p><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-[#FFF4E5] p-4"><Field label="Total a pagar"><CurrencyInput value={accountsPayable} onChange={setAccountsPayable} className="h-12 bg-white text-lg font-bold"/></Field></div><div className="rounded-2xl bg-[#EFF6FF] p-4"><Field label="Total pago no mês"><CurrencyInput value={accountsPaid} onChange={setAccountsPaid} className="h-12 bg-white text-lg font-bold"/></Field></div></div></Panel>
            <Panel title="Contas a receber"><p className="mb-4 text-sm text-[#6B7280]">Informe até três referências e o valor total de cada uma.</p><div className="rounded-2xl bg-[#EFF6FF] p-4 sm:p-5"><div className="space-y-3">{receivableEntries.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]"><Field label={`Referência ${index + 1}`}><Input className="bg-white" placeholder="Ex.: Pagarme - Link" value={line.name} onChange={(event) => setReceivableEntries(receivableEntries.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/></Field><Field label="Valor total"><CurrencyInput className="bg-white" value={line.value} onChange={(next) => setReceivableEntries(receivableEntries.map((item, itemIndex) => itemIndex === index ? { ...item, value: next } : item))}/></Field></div>)}</div><div className="mt-5 flex items-end justify-between gap-4 border-t border-[#DBEAFE] pt-4"><p className="text-sm font-medium text-[#4B5563]">Total a receber</p><p className="text-2xl font-semibold text-[#111827]">{money(receivableTotal)}</p></div></div></Panel>
          </div>
        </div>
        <Panel title="Vendas por vendedor no mês"><p className="mb-4 text-sm text-[#6B7280]">Digite o nome de cada vendedor e o total que já vendeu no mês selecionado.</p><EditableLines value={sellerSales} onChange={setSellerSales} namePlaceholder="Nome do vendedor"/><TotalBar label="Total informado por vendedores" value={sellerSalesTotal}/></Panel>
        <Panel title="Histórico de dias preenchidos">
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-[#EFF6FF] p-4 text-sm text-[#4B5563]"><History className="mt-0.5 shrink-0 text-[#2563EB]" size={19}/><p>Abra um dia para consultar ou editar. Ao salvar novamente, o lançamento daquele dia será atualizado.</p></div>
          {history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-[#E5E7EB] text-sm text-[#6B7280]"><th className="px-3 py-3 font-semibold">Data do relatório</th><th className="px-3 py-3 font-semibold">Vendas do dia anterior</th><th className="px-3 py-3 font-semibold">Saldo total</th><th className="px-3 py-3 font-semibold">Última atualização</th><th className="px-3 py-3 text-right font-semibold">Ações</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className={`border-b border-[#E2E8F0] ${date === row.date ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"}`}><td className="px-3 py-4 font-semibold text-[#111827]">{new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}{date === row.date && <span className="ml-2 rounded-full bg-white px-2 py-1 text-xs text-[#2563EB]">Aberto</span>}</td><td className="px-3 py-4 font-bold text-[#111827]">{money(row.totalSales)}</td><td className="px-3 py-4 font-bold text-[#111827]">{money(row.bankBalances.reduce((sum, item) => sum + Number(item.value || 0), 0))}</td><td className="px-3 py-4 text-sm text-[#6B7280]">{new Date(row.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td className="px-3 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setDate(row.date); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil/>Abrir / editar</Button><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2/>Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir o dia {new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}?</AlertDialogTitle><AlertDialogDescription>As vendas do dia e os saldos bancários dessa data serão apagados. Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteDay(row.date)}>Excluir dia</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-[#E5E7EB] px-5 py-10 text-center text-[#6B7280]">Nenhum dia preenchido ainda.</div>}
        </Panel>
      </TabsContent>}
    </Tabs>
  </CoreShell>;
}

function FinanceOverview({ date, previousDateLabel, balanceTotal, monthTotal, dayTotal, accountsPayable, accountsPaid, receivableTotal, bankBalances, monthPayments, dayPayments, receivableEntries, sellerSales }: { date: string; previousDateLabel: string; balanceTotal: number; monthTotal: number; dayTotal: number; accountsPayable: number; accountsPaid: number; receivableTotal: number; bankBalances: Line[]; monthPayments: Line[]; dayPayments: Line[]; receivableEntries: Line[]; sellerSales: Line[] }) {
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
  const banks = bankBalances.filter((item) => item.name.trim() || parseCurrency(item.value));
  const receivables = receivableEntries.filter((item) => item.name.trim() || parseCurrency(item.value));
  return <div className="finance-overview">
    <div className="space-y-6">
      <section><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#2563EB]">Resumo financeiro</p><h3 className="mt-1 text-xl font-semibold text-[#111827]">Principais números do período</h3></div><div className="hidden h-1 w-24 rounded-full bg-gradient-to-r from-[#2563EB] to-[#93C5FD] sm:block"/></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ExecutiveMetric label="Vendas do mês" value={monthTotal} icon={<WalletCards/>}/>
          <ExecutiveMetric label="Vendas do dia anterior" value={dayTotal} note={`Referente a ${previousDateLabel}`} icon={<CalendarDays/>}/>
          <ExecutiveMetric label="Saldo total" value={balanceTotal} icon={<Landmark/>}/>
          <ExecutiveMetric label="Contas pagas no mês" value={accountsPaid} icon={<CircleCheckBig/>}/>
          <ExecutiveMetric label="Contas a pagar" value={accountsPayable} icon={<ReceiptText/>} warning/>
          <ExecutiveMetric label="Contas a receber" value={receivableTotal} icon={<CircleDollarSign/>}/>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <OverviewList eyebrow="Saldos por conta" title="Disponibilidade bancária" total={balanceTotal} items={banks} empty="Nenhum saldo bancário informado." icon={<Landmark/>}/>
        <OverviewList eyebrow="Valores a receber" title="Referências dos recebimentos" total={receivableTotal} items={receivables} empty="Nenhum recebimento informado." icon={<CircleDollarSign/>}/>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <PaymentOverview eyebrow="Acumulado do mês" title="Vendas por forma de pagamento" items={monthPayments}/>
        <PaymentOverview eyebrow="Fechamento do dia anterior" title={`Vendas de ${previousDateLabel}`} items={dayPayments}/>
      </section>
      <SellerOverview items={sellerSales}/>
    </div>
  </div>;
}

function ExecutiveMetric({ label, value, note, icon, warning = false }: { label: string; value: number; note?: string; icon: React.ReactNode; warning?: boolean }) {
  return <div className={`group relative overflow-hidden rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${warning ? "border-[#F3CF9E] bg-[#FFF8EE]" : "border-[#DBEAFE] bg-gradient-to-br from-white to-[#EFF6FF]"}`}><div className={`absolute inset-y-0 left-0 w-1 ${warning ? "bg-[#F4A340]" : "bg-[#93C5FD]"}`}/><div className="flex items-start justify-between gap-4"><div><p className={`text-xs font-extrabold uppercase tracking-[.12em] ${warning ? "text-[#B86A12]" : "text-[#2563EB]"}`}>{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-[#111827] sm:text-[1.7rem]">{money(value)}</p>{note && <p className="mt-1 text-xs text-[#6B7280]">{note}</p>}</div><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${warning ? "bg-[#FFE7C2] text-[#B86A12]" : "bg-[#EFF6FF] text-[#2563EB]"}`}>{icon}</div></div></div>;
}

function OverviewList({ eyebrow, title, total, items, empty, icon }: { eyebrow: string; title: string; total: number; items: Line[]; empty: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">{icon}</div><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#2563EB]">{eyebrow}</p><h4 className="mt-1 font-semibold text-[#111827]">{title}</h4></div></div><div className="text-right"><p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Total</p><p className="mt-1 text-lg font-semibold text-[#2563EB]">{money(total)}</p></div></div><div className="mt-4 space-y-2">{items.length ? items.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 rounded-xl bg-[#F8FAFC] px-4 py-3"><span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#4B5563]"><i className="h-2 w-2 shrink-0 rounded-full bg-[#93C5FD]"/><span className="truncate">{item.name || "Sem identificação"}</span></span><b className="shrink-0 text-[#111827]">{money(parseCurrency(item.value))}</b></div>) : <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 text-center text-sm text-[#6B7280]">{empty}</div>}</div></div>;
}

function PaymentOverview({ eyebrow, title, items }: { eyebrow: string; title: string; items: Line[] }) {
  const visible = items.filter((item) => item.name.trim() || parseCurrency(item.value));
  const total = totalLines(items);
  return <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#2563EB]">{eyebrow}</p><h4 className="mt-1 text-lg font-semibold text-[#111827]">{title}</h4><p className="mt-1 text-sm text-[#6B7280]">Distribuição por forma de pagamento</p><div className="mt-6 space-y-5">{visible.length ? visible.slice(0, 7).map((item, index) => { const value = parseCurrency(item.value); const share = total ? value / total * 100 : 0; return <div key={`${item.name}-${index}`}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-[#4B5563]">{item.name || "Sem identificação"}</span><span className="text-right"><b className="text-[#111827]">{money(value)}</b><small className="ml-2 text-[#6B7280]">{share.toFixed(1).replace(".", ",")}%</small></span></div><div className="h-2.5 overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#93C5FD]" style={{ width: `${Math.max(share, value > 0 ? 1.5 : 0)}%` }}/></div></div>; }) : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] text-sm text-[#6B7280]">Nenhuma venda informada.</div>}</div><div className="mt-6 flex items-center justify-between rounded-xl bg-[#EFF6FF] px-4 py-4 text-[#111827]"><span className="font-bold">Total</span><b className="text-xl">{money(total)}</b></div></div>;
}

function SellerOverview({ items }: { items: Line[] }) {
  const visible = items.filter((item) => item.name.trim() || parseCurrency(item.value)).sort((a, b) => parseCurrency(b.value) - parseCurrency(a.value));
  const total = totalLines(items);
  return <section className="rounded-2xl border border-[#DBEAFE] bg-gradient-to-br from-[#2563EB] to-[#3B82F6] p-5 text-white shadow-lg sm:p-6"><div className="flex flex-col gap-3 border-b border-white/15 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#DBEAFE]">Equipe comercial</p><h4 className="mt-1 text-xl font-semibold">Vendas por vendedor no mês</h4></div><div className="sm:text-right"><p className="text-xs uppercase tracking-wide text-white/65">Total informado</p><p className="mt-1 text-2xl font-semibold text-[#DBEAFE]">{money(total)}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.length ? visible.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 rounded-xl bg-white/10 px-4 py-4"><span className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#93C5FD] text-sm font-semibold text-[#111827]">{index + 1}</span><b className="truncate">{item.name || "Sem identificação"}</b></span><strong className="shrink-0 text-[#EFF6FF]">{money(parseCurrency(item.value))}</strong></div>) : <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-white/25 px-5 py-8 text-center text-sm text-white/70">Nenhuma venda por vendedor informada neste mês.</div>}</div></section>;
}

function EditableLines({ value, onChange, namePlaceholder = "Forma de pagamento" }: { value: Line[]; onChange: (lines: Line[]) => void; namePlaceholder?: string }) {
  return <div>{value.map((line, index) => <div key={index} className="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(100px,.65fr)_36px] gap-2"><Input placeholder={namePlaceholder} value={line.name} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/><CurrencyInput value={line.value} onChange={(next) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, value: next } : item))}/><Button type="button" variant="ghost" aria-label="Remover linha" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X/></Button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { name: "", value: "" }])}><Plus/>Adicionar linha</Button></div>;
}
function CurrencyInput({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!focused) setDraft(value ? money(parseCurrency(value)) : ""); }, [value, focused]);
  return <Input type="text" inputMode="decimal" placeholder="R$ 0,00" className={className} value={focused ? draft : (value ? money(parseCurrency(value)) : "")} onFocus={() => { setFocused(true); setDraft(value ? parseCurrency(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""); }} onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} onBlur={() => { const parsed = parseCurrency(draft); const normalized = draft.trim() ? parsed.toFixed(2) : ""; onChange(normalized); setDraft(normalized ? money(parsed) : ""); setFocused(false); }}/>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2"><Label>{label}</Label>{children}</label>; }
function TotalBar({ label, value }: { label: string; value: number }) { return <div className="mt-4 flex items-center justify-between rounded-xl bg-[#111827] p-4 text-white"><span className="text-sm">{label}</span><b className="text-xl text-[#93C5FD]">{money(value)}</b></div>; }

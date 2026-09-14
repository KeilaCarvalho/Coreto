"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CalendarDays, CircleCheckBig, CircleDollarSign, Download, History, Landmark, Pencil, Plus, ReceiptText, Save, Trash2, WalletCards, X } from "lucide-react";
import { CoreShell, Panel, isoToday, money } from "@/components/core-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";

type Line = { name: string; value: string };
type StoredLine = { name: string; value: number };
type FinanceRow = { id: number; date: string; totalSales: number; paymentEntries: StoredLine[]; flexibleAccounts: StoredLine[]; bankBalances: StoredLine[]; receivableEntries: StoredLine[]; updatedAt: string };
type MonthlyRow = { month: string; accountsPayable: number; accountsPaid: number; paymentEntries: StoredLine[] };

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
  const [bankBalances, setBankBalances] = useState<Line[]>([{ name: "", value: "" }]);
  const [receivableEntries, setReceivableEntries] = useState<Line[]>(emptyReceivables());
  const [preservedAccounts, setPreservedAccounts] = useState<StoredLine[]>([]);
  const [accountsPayable, setAccountsPayable] = useState("");
  const [accountsPaid, setAccountsPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const pdfReportRef = useRef<HTMLDivElement>(null);

  const month = date.slice(0, 7);
  const load = useCallback(async () => {
    const response = await fetch(`/api/core?date=${date}&month=${month}`);
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Não foi possível carregar o fluxo.");
    setHistory(data.finance || []);
    setMonthlyHistory(data.monthlyFinance || []);
    const day = (data.finance || []).find((row: FinanceRow) => row.date === date);
    const monthRow = (data.monthlyFinance || []).find((row: MonthlyRow) => row.month === month);
    setDayPayments(day ? toLines(day.paymentEntries) : emptyPayments());
    setBankBalances(day?.bankBalances?.length ? toLines(day.bankBalances) : [{ name: "", value: "" }]);
    setReceivableEntries(toFixedLines(day?.receivableEntries));
    setPreservedAccounts(day?.flexibleAccounts || []);
    setMonthPayments(monthRow ? toLines(monthRow.paymentEntries) : emptyPayments());
    setAccountsPayable(monthRow ? String(monthRow.accountsPayable) : "");
    setAccountsPaid(monthRow ? String(monthRow.accountsPaid || 0) : "");
  }, [date, month]);

  useEffect(() => { load(); }, [load]);

  const dayTotal = totalLines(dayPayments);
  const monthTotal = totalLines(monthPayments);
  const balanceTotal = totalLines(bankBalances);
  const receivableTotal = totalLines(receivableEntries);
  const previousDate = useMemo(() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }, [date]);
  const previousDateLabel = new Date(`${previousDate}T12:00:00`).toLocaleDateString("pt-BR");

  async function saveAll(showSuccess = true) {
    setSaving(true);
    try {
      await Promise.all([
        post({ action: "finance", date, paymentEntries: numericLines(dayPayments), flexibleAccounts: preservedAccounts, bankBalances: numericLines(bankBalances), receivableEntries: numericLines(receivableEntries) }),
        post({ action: "monthly_finance", month, paymentEntries: numericLines(monthPayments), accountsPayable: parseCurrency(accountsPayable), accountsPaid: parseCurrency(accountsPaid) }),
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
      if (!(await saveAll(false))) return;
      const report = pdfReportRef.current;
      if (!report) throw new Error("Não foi possível preparar o relatório.");
      await document.fonts.ready;
      const images = Array.from(report.querySelectorAll("img"));
      await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(report, { scale: 2, backgroundColor: "#F3F6F8", useCORS: true, logging: false });
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      doc.save(`fluxo-financeiro-coreto-${date}-atualizado.pdf`);
      toast.success("PDF gerado e baixado.");
    } catch (error) { toast.error((error as Error).message || "Não foi possível gerar o PDF."); }
    finally { setCreatingPdf(false); }
  }

  return <CoreShell active="/fluxo-financeiro" title="Fluxo Financeiro Diário" subtitle="Financeiro / Painel executivo">
    <Toaster richColors />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2"><CalendarDays className="text-[#159C85]"/><span className="sr-only">Data do relatório</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-44 bg-white"/></label>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => saveAll()} disabled={saving}><Save/>{saving ? "Salvando..." : "Salvar painel"}</Button><Button className="bg-[#16324A] hover:bg-[#0f2948]" onClick={downloadPdf} disabled={creatingPdf || saving}><Download/>{creatingPdf ? "Gerando PDF..." : "Baixar novo relatório em PDF"}</Button></div>
    </div>

    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Vendas do dia anterior" value={money(dayTotal)} note={`Referente a ${previousDateLabel}`} icon={<Banknote/>}/><Metric label="Vendas do mês" value={money(monthTotal)} icon={<WalletCards/>}/><Metric label="Saldo total" value={money(balanceTotal)} icon={<Landmark/>}/><Metric label="Contas a pagar" value={money(parseCurrency(accountsPayable))} icon={<ReceiptText/>} tone="orange"/><Metric label="Contas pagas no mês" value={money(parseCurrency(accountsPaid))} icon={<CircleCheckBig/>} tone="blue"/><Metric label="Contas a receber" value={money(receivableTotal)} icon={<CircleDollarSign/>} details={numericLines(receivableEntries)}/>
    </div>

    <div className="grid items-start gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Panel title="Vendas do dia anterior por forma de pagamento"><p className="mb-4 text-sm text-[#708398]">Informe quanto foi vendido em cada forma de pagamento no dia anterior ({previousDateLabel}).</p><EditableLines value={dayPayments} onChange={setDayPayments}/><TotalBar label="Total das vendas do dia anterior" value={dayTotal}/></Panel>
        <Panel title="Vendas do mês por forma de pagamento"><p className="mb-4 text-sm text-[#708398]">Preencha o acumulado do mês. Esses valores ficam disponíveis em qualquer dia do mesmo mês.</p><EditableLines value={monthPayments} onChange={setMonthPayments}/><TotalBar label="Total das vendas do mês" value={monthTotal}/></Panel>
        <Panel title="Saldos bancários"><p className="mb-4 text-sm text-[#708398]">Cadastre todas as contas. O card “Saldo total” soma automaticamente os valores abaixo.</p><EditableLines value={bankBalances} onChange={setBankBalances} namePlaceholder="Banco ou conta"/><TotalBar label="Saldo total disponível" value={balanceTotal}/></Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Contas do mês"><p className="mb-4 text-sm text-[#708398]">Informe o total que ainda falta pagar e o total que já foi pago no mês selecionado.</p><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-[#FFF4E5] p-4"><Field label="Total a pagar"><CurrencyInput value={accountsPayable} onChange={setAccountsPayable} className="h-12 bg-white text-lg font-bold"/></Field></div><div className="rounded-2xl bg-[#edeffd] p-4"><Field label="Total pago no mês"><CurrencyInput value={accountsPaid} onChange={setAccountsPaid} className="h-12 bg-white text-lg font-bold"/></Field></div></div></Panel>
        <Panel title="Contas a receber"><p className="mb-4 text-sm text-[#708398]">Informe até três referências e o valor total de cada uma. Não é necessário cadastrar parcelas ou vencimentos.</p><div className="rounded-2xl bg-[#F3F6F8] p-4 sm:p-5"><div className="space-y-3">{receivableEntries.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]"><Field label={`Referência ${index + 1}`}><Input className="bg-white" placeholder="Ex.: Pagarme - Link" value={line.name} onChange={(event) => setReceivableEntries(receivableEntries.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/></Field><Field label="Valor total"><CurrencyInput className="bg-white" value={line.value} onChange={(next) => setReceivableEntries(receivableEntries.map((item, itemIndex) => itemIndex === index ? { ...item, value: next } : item))}/></Field></div>)}</div><div className="mt-5 flex items-end justify-between gap-4 border-t border-[#cadde9] pt-4"><p className="text-sm font-medium text-[#587086]">Total a receber</p><p className="text-2xl font-black text-[#16324A]">{money(receivableTotal)}</p></div></div></Panel>
      </div>
    </div>

    <div className="mt-6">
      <Panel title="Histórico de dias preenchidos">
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-[#E9F9F5] p-4 text-sm text-[#506b82]"><History className="mt-0.5 shrink-0 text-[#159C85]" size={19}/><p>Abra um dia para consultar ou editar. Ao salvar novamente, o lançamento daquele dia será atualizado. A exclusão remove as vendas, os saldos bancários e as contas a receber registradas nessa data.</p></div>
        {history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-[#dfe7ee] text-sm text-[#708398]"><th className="px-3 py-3 font-semibold">Data do relatório</th><th className="px-3 py-3 font-semibold">Vendas do dia anterior</th><th className="px-3 py-3 font-semibold">Saldo total</th><th className="px-3 py-3 font-semibold">Última atualização</th><th className="px-3 py-3 text-right font-semibold">Ações</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className={`border-b border-[#edf1f4] ${date === row.date ? "bg-[#E9F9F5]" : "hover:bg-[#F3F6F8]"}`}><td className="px-3 py-4 font-semibold text-[#16324A]">{new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}{date === row.date && <span className="ml-2 rounded-full bg-[#E9F9F5] px-2 py-1 text-xs text-[#159C85]">Aberto</span>}</td><td className="px-3 py-4 font-bold text-[#16324A]">{money(row.totalSales)}</td><td className="px-3 py-4 font-bold text-[#16324A]">{money(row.bankBalances.reduce((sum, item) => sum + Number(item.value || 0), 0))}</td><td className="px-3 py-4 text-sm text-[#708398]">{new Date(row.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td className="px-3 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setDate(row.date); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil/>Abrir / editar</Button><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2/>Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir o dia {new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}?</AlertDialogTitle><AlertDialogDescription>As vendas do dia e os saldos bancários dessa data serão apagados. Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteDay(row.date)}>Excluir dia</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-[#cddae4] px-5 py-10 text-center text-[#708398]">Nenhum dia preenchido ainda.</div>}
      </Panel>
    </div>
    <PdfReport ref={pdfReportRef} date={date} previousDateLabel={previousDateLabel} balanceTotal={balanceTotal} monthTotal={monthTotal} dayTotal={dayTotal} accountsPayable={parseCurrency(accountsPayable)} accountsPaid={parseCurrency(accountsPaid)} receivableTotal={receivableTotal} bankBalances={bankBalances} monthPayments={monthPayments} dayPayments={dayPayments} receivableEntries={receivableEntries}/>
  </CoreShell>;
}

function PdfReport({ ref, date, previousDateLabel, balanceTotal, monthTotal, dayTotal, accountsPayable, accountsPaid, receivableTotal, bankBalances, monthPayments, dayPayments, receivableEntries }: { ref: React.Ref<HTMLDivElement>; date: string; previousDateLabel: string; balanceTotal: number; monthTotal: number; dayTotal: number; accountsPayable: number; accountsPaid: number; receivableTotal: number; bankBalances: Line[]; monthPayments: Line[]; dayPayments: Line[]; receivableEntries: Line[] }) {
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  const validBanks = bankBalances.filter((item) => item.name.trim() || parseCurrency(item.value));
  const receivableCards = Array.from({ length: 3 }, (_, index) => receivableEntries[index] || { name: "", value: "" });
  const reportStyle: React.CSSProperties = { position: "fixed", left: "-10000px", top: 0, width: 794, height: 1123, padding: "38px 38px 28px", boxSizing: "border-box", overflow: "hidden", background: "#ffffff", color: "#16324A", fontFamily: 'Arial, "Helvetica Neue", sans-serif' };
  return <div ref={ref} aria-hidden="true" style={reportStyle}>
    <div style={{ height: 72, display: "flex", alignItems: "center" }}>
      <div style={{ width: 58, height: 58, borderRadius: 15, border: "1px solid #bce8e5", background: "#fff", boxShadow: "0 4px 9px rgba(20,55,95,.10)", display: "grid", placeItems: "center", flexShrink: 0 }}><img src="/coreto-logo.png" alt="" style={{ width: 48, height: 42, objectFit: "contain" }}/></div>
      <div style={{ marginLeft: 15, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#159C85", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}><i style={{ width: 5, height: 5, borderRadius: 99, background: "#159C85" }}/>CORETO</div>
        <div style={{ color: "#16324A", fontWeight: 700, fontSize: 25, lineHeight: 1.05, marginTop: 6 }}>Fluxo Financeiro Diário</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#159C85", fontWeight: 700, fontSize: 8, letterSpacing: .55, marginTop: 6 }}><i style={{ width: 4, height: 4, borderRadius: 99, background: "#45D6B3" }}/>RELATÓRIO FINANCEIRO DIÁRIO</div>
      </div>
      <div style={{ width: 130, textAlign: "right", flexShrink: 0 }}><div style={{ color: "#20364f", fontWeight: 700, fontSize: 9, letterSpacing: .55 }}>REFERÊNCIA</div><div style={{ color: "#16324A", fontWeight: 700, fontSize: 16, marginTop: 6 }}>{displayDate}</div><div style={{ color: "#159C85", fontSize: 8, marginTop: 4 }}>{weekday}</div></div>
    </div>
    <div style={{ height: 1, background: "#a9c8ca", marginTop: 13, marginBottom: 24 }}/>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <PdfSummaryCard label="DISPONIBILIDADE TOTAL" value={balanceTotal} color="#159C85"/>
      <PdfSummaryCard label="CONTAS PAGAS NO MÊS" value={accountsPaid} color="#159C85"/>
      <PdfSummaryCard label="CONTAS A PAGAR AINDA" value={accountsPayable} color="#F4A340"/>
      <PdfSummaryCard label="VENDAS DO MÊS" value={monthTotal} color="#16324A"/>
      <PdfSummaryCard label="VENDAS DO DIA ANTERIOR" sublabel={previousDateLabel} value={dayTotal} color="#16324A"/>
      <PdfSummaryCard label="TOTAL A RECEBER" value={receivableTotal} color="#159C85"/>
      {receivableCards.map((item, index) => <PdfSummaryCard key={index} label={(item.name || `RECEBIMENTO ${index + 1}`).toUpperCase()} value={parseCurrency(item.value)} color="#159C85"/>) }
    </div>
    <div style={{ marginTop: 31, height: 139, border: "1px solid #c7d8e6", borderRadius: 12, background: "white", padding: "15px 13px 12px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", paddingBottom: 12, borderBottom: "1px solid #d7e3e9" }}><div><div style={{ color: "#159C85", fontSize: 9, fontWeight: 700, letterSpacing: .75 }}>SALDOS POR CONTA</div><div style={{ color: "#16324A", fontSize: 14, fontWeight: 700, marginTop: 5 }}>Disponibilidade bancária</div></div><div style={{ textAlign: "right" }}><div style={{ color: "#159C85", fontSize: 8, fontWeight: 700 }}>DISPONIBILIDADE TOTAL</div><div style={{ color: "#159C85", fontSize: 14, fontWeight: 700, marginTop: 5 }}>{money(balanceTotal)}</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 20, rowGap: 13, paddingTop: 13 }}>{validBanks.slice(0, 6).map((item, index) => <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, fontSize: 9.5 }}><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, color: "#294258" }}><i style={{ width: 7, height: 7, borderRadius: 99, background: pdfColors[index % pdfColors.length], flexShrink: 0 }}/><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name || "Conta sem nome"}</span></span><b style={{ color: "#16324A", fontSize: 9.5, whiteSpace: "nowrap" }}>{money(parseCurrency(item.value))}</b></div>)}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 30 }}><PdfListBlock eyebrow="VENDAS DO PERÍODO" title="Vendas do mês" items={monthPayments}/><PdfListBlock eyebrow="FECHAMENTO ANTERIOR" title={`Vendas do dia anterior - ${previousDateLabel}`} items={dayPayments}/></div>
    <div style={{ position: "absolute", left: 38, right: 38, bottom: 24, height: 38, borderTop: "1px solid #d7e3e9", color: "#294258", display: "flex", alignItems: "end", justifyContent: "center", fontSize: 8.5 }}><span>Coreto Indústria e Comércio de Roupas - Fluxo financeiro de {displayDate}</span></div>
  </div>;
}

const pdfColors = ["#7d8383", "#3b91da", "#ef6c00", "#0b6615", "#e00000", "#21a52c"];
function PdfSummaryCard({ label, sublabel, value, color }: { label: string; sublabel?: string; value: number; color: string }) { return <div style={{ height: 74, border: "1px solid #c7d8e6", borderRadius: 11, background: "white", padding: "13px 12px", boxSizing: "border-box", boxShadow: "0 2px 6px rgba(20,55,95,.025)" }}><div style={{ color, fontWeight: 700, fontSize: label.length > 22 ? 8.1 : 9, letterSpacing: .7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div><div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 6, marginTop: 10 }}><div style={{ color: "#16324A", fontWeight: 700, fontSize: 17, whiteSpace: "nowrap" }}>{money(value)}</div>{sublabel && <div style={{ color: "#718398", fontSize: 7.5, whiteSpace: "nowrap", paddingBottom: 2 }}>{sublabel}</div>}</div></div>; }
function PdfListBlock({ eyebrow, title, items }: { eyebrow: string; title: string; items: Line[] }) {
  const visible = items.filter((item) => item.name.trim() || parseCurrency(item.value)).slice(0, 5);
  const total = totalLines(items);
  let current = 0;
  const chart = total > 0 ? `conic-gradient(${visible.map((item, index) => { const start = current; current += (parseCurrency(item.value) / total) * 100; return `${pdfColors[index % pdfColors.length]} ${start.toFixed(2)}% ${current.toFixed(2)}%`; }).join(", ")})` : "#dfe7eb";
  return <div style={{ height: 276, border: "1px solid #c7d8e6", borderRadius: 12, background: "white", padding: "15px 13px", boxSizing: "border-box" }}>
    <div style={{ color: "#159C85", fontSize: 8.5, fontWeight: 700, letterSpacing: .65 }}>{eyebrow}</div>
    <div style={{ color: "#16324A", fontWeight: 700, fontSize: 14, marginTop: 6 }}>{title}</div>
    <div style={{ height: 205, display: "grid", gridTemplateColumns: "128px 1fr", gap: 13, alignItems: "center" }}>
      <div style={{ width: 108, height: 108, borderRadius: 999, background: chart, position: "relative", marginLeft: 3 }}><i style={{ position: "absolute", inset: 20, borderRadius: 999, background: "white" }}/></div>
      <div>{visible.map((item, index) => <div key={index} style={{ minHeight: 30, padding: "6px 0", borderBottom: "1px solid #d7e3e9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, fontSize: 9.5 }}><span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, color: "#16324A" }}><i style={{ width: 8, height: 8, borderRadius: 99, background: pdfColors[index % pdfColors.length], flexShrink: 0 }}/><span>{item.name || "Sem identificação"}</span></span><b style={{ color: "#159C85", whiteSpace: "nowrap" }}>{money(parseCurrency(item.value))}</b></div>)}<div style={{ paddingTop: 9, display: "flex", justifyContent: "space-between", color: "#16324A", fontSize: 10.5, fontWeight: 700 }}><span>Total</span><span>{money(total)}</span></div></div>
    </div>
  </div>;
}

function EditableLines({ value, onChange, namePlaceholder = "Forma de pagamento" }: { value: Line[]; onChange: (lines: Line[]) => void; namePlaceholder?: string }) {
  return <div>{value.map((line, index) => <div key={index} className="mb-2 grid grid-cols-[minmax(0,1fr)_150px_40px] gap-2"><Input placeholder={namePlaceholder} value={line.name} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/><CurrencyInput value={line.value} onChange={(next) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, value: next } : item))}/><Button type="button" variant="ghost" aria-label="Remover linha" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X/></Button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { name: "", value: "" }])}><Plus/>Adicionar linha</Button></div>;
}
function CurrencyInput({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!focused) setDraft(value ? money(parseCurrency(value)) : ""); }, [value, focused]);
  return <Input type="text" inputMode="decimal" placeholder="R$ 0,00" className={className} value={focused ? draft : (value ? money(parseCurrency(value)) : "")} onFocus={() => { setFocused(true); setDraft(value ? parseCurrency(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""); }} onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} onBlur={() => { const parsed = parseCurrency(draft); const normalized = draft.trim() ? parsed.toFixed(2) : ""; onChange(normalized); setDraft(normalized ? money(parsed) : ""); setFocused(false); }}/>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2"><Label>{label}</Label>{children}</label>; }
function TotalBar({ label, value }: { label: string; value: number }) { return <div className="mt-4 flex items-center justify-between rounded-xl bg-[#16324A] p-4 text-white"><span className="text-sm">{label}</span><b className="text-xl text-[#65ddda]">{money(value)}</b></div>; }
function Metric({ label, value, note, icon, details = [], tone = "aqua" }: { label: string; value: string; note?: string; icon: React.ReactNode; details?: StoredLine[]; tone?: "aqua" | "blue" | "orange" | "red" }) { const accent = tone === "orange" ? "bg-[#F4A340]" : tone === "red" ? "bg-red-400" : tone === "blue" ? "bg-[#159C85]" : "bg-[#45D6B3]"; const surface = tone === "orange" ? "bg-[#FFF8EE]" : tone === "red" ? "bg-red-50" : tone === "blue" ? "bg-[#f7f7ff]" : "bg-[#f7fcfd]"; return <div className={`relative overflow-hidden rounded-xl border border-[#d9e6ee] p-4 shadow-sm ${surface}`}><div className={`absolute inset-y-0 right-0 w-1 ${accent}`}/><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-[#708398]">{label}</p><p className="mt-1.5 text-xl font-black text-[#16324A] sm:text-2xl">{value}</p>{note && <p className="mt-1 text-xs text-[#708398]">{note}</p>}</div><div className="rounded-lg bg-white/80 p-2.5 text-[#159C85] shadow-sm [&>svg]:h-5 [&>svg]:w-5">{icon}</div></div>{details.length > 0 && <div className="mt-3 space-y-1 rounded-lg bg-white/75 p-2.5">{details.slice(0, 3).map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-[#587086]">{item.name}</span><b className="shrink-0 text-[#16324A]">{money(item.value)}</b></div>)}</div>}</div>; }

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Box, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheckBig, ClipboardCheck, Clock3, Filter, Layers3, LogOut, Menu, PackageCheck, Pencil, Plus, Search, Shirt, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast, Toaster } from "sonner";
import Link from "next/link";
import { CoreShell, useCoreSession } from "@/components/core-shell";

type Receipt = { id: number; batchKey: string; receivedAt: string; model: string; color: string; size: string; quantity: number; checkedBy: string; observation: string | null; createdAt?: string };
type Tracking = { id: number; batchKey: string; model: string; status: "pending" | "completed"; pendingNote: string | null; updatedAt: string };
type LegacyTracking = Omit<Tracking, "batchKey">;
type GroupedModel = { key: string; model: string; total: number; lastReceivedAt: string; variants: Receipt[]; status: "pending" | "completed"; pendingNote: string };
type User = { name: string; email: string | null; role: "admin" | "chefe" | "conferente" | "vendedora" };
const sizes = ["PP", "P", "M", "G", "GG", "XG", "Único"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const newColorRow = () => ({ color: "", quantities: Object.fromEntries(sizes.map((size) => [size, ""])) as Record<string, string> });
function shortDate(value: string) { const [y, m, d] = value.slice(0, 10).split("-"); return `${d}/${m}/${y}`; }

export default function ReceiptsPage() {
  const { user: sessionUser } = useCoreSession();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [legacyTracking, setLegacyTracking] = useState<LegacyTracking[]>([]);
  const user = sessionUser || { name: "Usuário Coreto", email: null, role: "conferente" as const };
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ receivedAt: today(), model: "", observation: "" });
  const [colorRows, setColorRows] = useState([newColorRow()]);
  const [filters, setFilters] = useState({ from: "", to: "", model: "", color: "" }); const [applied, setApplied] = useState(filters); const [suggestions, setSuggestions] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const load = useCallback(async () => {
    setLoading(true); const params = new URLSearchParams(); Object.entries(applied).forEach(([k, v]) => v && params.set(k, v));
    const response = await fetch(`/api/receipts?${params}`); const data = await response.json();
    if (response.ok) { setReceipts(data.receipts); setTracking(data.tracking || []); setLegacyTracking(data.legacyTracking || []); setSuggestions(data.models); } else if (data.redirect) { window.location.replace(data.redirect); return; } else toast.error(data.error ?? "Não foi possível carregar os recebimentos."); setLoading(false);
  }, [applied]);
  useEffect(() => { load(); }, [load]);
  const total = useMemo(() => receipts.reduce((sum, item) => sum + item.quantity, 0), [receipts]);
  const weekTotal = useMemo(() => { const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0); return receipts.filter((r) => new Date(`${r.receivedAt}T12:00:00`) >= monday).reduce((sum, r) => sum + r.quantity, 0); }, [receipts]);
  const groupedModels = useMemo(() => groupReceiptsByDelivery(receipts, tracking, legacyTracking), [receipts, tracking, legacyTracking]);
  const visibleModels = useMemo(() => statusFilter === "all" ? groupedModels : groupedModels.filter((item) => item.status === statusFilter), [groupedModels, statusFilter]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const items = colorRows.flatMap((row) => sizes.map((size) => ({ color: row.color.trim(), size, quantity: Number(row.quantities[size] || 0) })).filter((item) => item.quantity > 0));
    if (!form.model.trim()) { toast.error("Informe o modelo."); return; }
    if (!items.length) { toast.error("Informe pelo menos uma cor e a quantidade de um tamanho."); return; }
    if (items.some((item) => !item.color)) { toast.error("Informe a cor de todas as quantidades preenchidas."); return; }
    if (items.some((item) => !Number.isInteger(item.quantity))) { toast.error("As quantidades precisam ser números inteiros."); return; }
    setSaving(true); const response = await fetch("/api/receipts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, items }) }); const data = await response.json();
    if (response.ok) { setForm((current) => ({ ...current, model: "", observation: "" })); setColorRows([newColorRow()]); toast.success(`${data.receipts.length} variação(ões) registradas de uma só vez.`); await load(); document.getElementById("model")?.focus(); } else toast.error(data.error ?? "Não foi possível salvar o recebimento."); setSaving(false);
  }
  async function saveTracking(batchKey: string, model: string, status: "pending" | "completed", pendingNote: string) {
    const response = await fetch("/api/receipts", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ batchKey, model, status, pendingNote }) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o acompanhamento.");
    setTracking((current) => [...current.filter((item) => item.batchKey !== batchKey), data.tracking]);
    toast.success(status === "completed" ? "Modelo marcado como concluído." : "Pendência atualizada.");
  }
  async function deleteReceipt(id: number) {
    const response = await fetch(`/api/receipts?id=${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { toast.error(data.error ?? "Não foi possível excluir o recebimento."); return; }
    toast.success("Recebimento excluído do histórico.");
    await load();
  }
  return <CoreShell active="/recebimentos" title="Recebimentos" subtitle="Registre as entregas e acompanhe a conferência de cada modelo.">
    <Toaster richColors position="top-right"/>
    <div className="receipts-layout">
        <section className="grid gap-4 md:grid-cols-3 xl:col-span-2"><div className="relative overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-6 text-[#111827] shadow-sm md:col-span-2"><div className="absolute -right-8 -top-10 h-40 w-40 rounded-full border-[24px] border-white/[.06]" /><div className="relative flex items-start justify-between"><div><p className="text-sm font-medium text-[#6B7280]">Peças recebidas nesta semana</p><p className="mt-2 text-4xl font-semibold tracking-tight">{weekTotal.toLocaleString("pt-BR")}</p><p className="mt-2 text-xs text-[#6B7280]">Atualizado com os registros do histórico</p></div><div className="rounded-xl bg-[#EFF6FF] p-3 text-[#2563EB]"><Shirt size={28} /></div></div></div><div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-[#6B7280]">Total no período filtrado</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#111827]">{total.toLocaleString("pt-BR")}</p><p className="mt-2 text-xs text-[#6B7280]">{receipts.length} {receipts.length === 1 ? "registro" : "registros"}</p></div><div className="rounded-2xl bg-[#EFF6FF] p-3 text-[#2563EB]"><ClipboardCheck size={25} /></div></div></div></section>
        <section className="contents">
          <form onSubmit={submit} className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-[#E5E7EB] px-6 py-5"><div className="rounded-xl bg-[#EFF6FF] p-2 text-[#2563EB]"><Plus size={20} /></div><div><h2 className="font-bold text-[#111827]">Novo recebimento</h2><p className="text-xs text-[#6B7280]">Informe o modelo e todas as cores e tamanhos recebidos</p></div></div><div className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="date">Data do recebimento</Label><div className="relative"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={17} /><Input id="date" type="date" className="h-11 pl-10" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} required /></div></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="model">Modelo</Label><Input id="model" list="models" className="h-11" placeholder="Ex.: Vestido Aurora" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} autoComplete="off" required /><datalist id="models">{suggestions.map((model) => <option key={model} value={model} />)}</datalist></div>
            <div className="space-y-3 sm:col-span-2"><div className="flex items-center justify-between"><div><Label>Cores e quantidades desta nova entrega</Label><p className="mt-1 text-xs text-[#6B7280]">Cada salvamento cria novos registros no histórico. Deixe em branco os tamanhos que não chegaram.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setColorRows([...colorRows, newColorRow()])}><Plus size={15}/>Adicionar cor</Button></div>{colorRows.map((row, rowIndex) => <div key={rowIndex} className="rounded-2xl border border-[#E5E7EB] bg-[#F3F5F8] p-4"><div className="mb-4 flex items-center gap-2"><Input aria-label={`Cor ${rowIndex + 1}`} className="h-11 bg-white" placeholder="Ex.: Preto, verde ou amarelo" value={row.color} onChange={(event) => setColorRows(colorRows.map((item, index) => index === rowIndex ? { ...item, color: event.target.value } : item))}/>{colorRows.length > 1 && <Button type="button" size="icon" variant="ghost" className="shrink-0 text-red-500" aria-label={`Remover cor ${rowIndex + 1}`} onClick={() => setColorRows(colorRows.filter((_, index) => index !== rowIndex))}><X size={17}/></Button>}</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{sizes.map((size) => <label key={size} className="space-y-1.5"><span className="block text-center text-xs font-bold text-[#4B5563]">{size}</span><Input aria-label={`Quantidade ${size} da cor ${row.color || rowIndex + 1}`} className="h-10 bg-white px-2 text-center font-bold" type="number" min="0" step="1" inputMode="numeric" autoComplete="off" placeholder="0" value={row.quantities[size]} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setColorRows(colorRows.map((item, index) => index === rowIndex ? { ...item, quantities: { ...item.quantities, [size]: event.target.value } } : item))}/></label>)}</div><p className="mt-3 text-right text-xs font-semibold text-[#2563EB]">Total desta nova cor: {sizes.reduce((sum, size) => sum + Number(row.quantities[size] || 0), 0)} peças</p></div>)}</div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="checkedBy">Conferido por</Label><Input id="checkedBy" className="h-11 bg-[#F3F5F8] text-[#6B7280]" value={user.name} disabled /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="observation">Observação <span className="font-normal text-[#6B7280]">(opcional)</span></Label><Textarea id="observation" rows={3} placeholder="Ex.: veio a menos que o combinado" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} /></div><Button type="submit" disabled={saving} className="h-12 bg-[#2563EB] font-bold hover:bg-[#2563EB] sm:col-span-2">{saving ? "Salvando..." : <><Check size={18} />Salvar todas as cores e tamanhos</>}</Button>
          </div></form>
          <section className="order-last min-w-0 rounded-2xl border border-[#E5E7EB] bg-white shadow-sm xl:col-span-2"><div className="border-b border-[#E5E7EB] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-bold text-[#111827]">Histórico de recebimentos</h2><p className="mt-0.5 text-xs text-[#6B7280]">Registros mais recentes primeiro</p></div><div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB]"><Sparkles size={15} />Variações disponíveis para ficha técnica</div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Input aria-label="Data inicial" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /><Input aria-label="Data final" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={15} /><Input className="pl-9" placeholder="Filtrar modelo" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} /></div><div className="flex gap-2"><Input placeholder="Filtrar cor" value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value })} /><Button type="button" aria-label="Aplicar filtros" onClick={() => setApplied(filters)} className="shrink-0 bg-[#111827]"><Filter size={16} /></Button></div></div>{Object.values(applied).some(Boolean) && <button className="mt-3 text-xs font-semibold text-[#2563EB] hover:underline" onClick={() => { const empty = { from: "", to: "", model: "", color: "" }; setFilters(empty); setApplied(empty); }}>Limpar filtros</button>}</div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#F3F5F8]"><TableHead>Data</TableHead><TableHead>Modelo</TableHead><TableHead>Cor</TableHead><TableHead>Tam.</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead>Conferido por</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="h-40 text-center text-[#6B7280]">Carregando recebimentos...</TableCell></TableRow> : receipts.length === 0 ? <TableRow><TableCell colSpan={8} className="h-48 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]"><PackageCheck /></div><p className="mt-3 font-semibold text-[#111827]">Nenhum recebimento encontrado</p><p className="mt-1 text-xs text-[#6B7280]">Registre a primeira peça ou ajuste os filtros.</p></TableCell></TableRow> : receipts.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-[#6B7280]">{shortDate(item.receivedAt)}</TableCell><TableCell className="font-semibold text-[#111827]">{item.model}</TableCell><TableCell>{item.color}</TableCell><TableCell><span className="rounded-md bg-[#EFF6FF] px-2 py-1 text-xs font-bold text-[#2563EB]">{item.size}</span></TableCell><TableCell className="text-right font-bold">{item.quantity}</TableCell><TableCell className="whitespace-nowrap">{item.checkedBy}</TableCell><TableCell className="max-w-[220px] truncate text-[#6B7280]" title={item.observation ?? ""}>{item.observation || "—"}</TableCell><TableCell><div className="flex justify-end gap-2"><EditReceiptButton item={item} onSaved={load}/><AlertDialog><AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Excluir recebimento de ${item.model}`}><Trash2 size={15}/>Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir este recebimento?</AlertDialogTitle><AlertDialogDescription>O registro de {item.quantity} peça(s) do modelo {item.model}, cor {item.color}, tamanho {item.size}, será removido do histórico. Os totais serão recalculados automaticamente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteReceipt(item.id)}>Excluir recebimento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div>
          </section>
        </section>
        <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[#E5E7EB] p-5 sm:p-6">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-[#EFF6FF] p-2.5 text-[#2563EB]"><Layers3 size={21}/></div><div><h2 className="font-bold text-[#111827]">Acompanhamento por modelo</h2><p className="mt-0.5 text-sm text-[#6B7280]">Veja o que já chegou e registre o que ainda falta finalizar.</p></div></div>
            <div className="flex flex-wrap gap-2 rounded-xl bg-[#F3F5F8] p-1">{([['all','Todos'],['pending','Pendentes'],['completed','Concluídos']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${statusFilter === value ? "bg-white text-[#2563EB] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>{label} <span className="ml-1 opacity-70">{value === "all" ? groupedModels.length : groupedModels.filter((item) => item.status === value).length}</span></button>)}</div>
          </div>
          {loading ? <div className="py-14 text-center text-[#6B7280]">Carregando recebimentos...</div> : visibleModels.length === 0 ? <div className="py-14 text-center"><PackageCheck className="mx-auto text-[#2563EB]"/><p className="mt-3 font-semibold text-[#111827]">Nenhum recebimento neste filtro</p><p className="mt-1 text-sm text-[#6B7280]">Cada nova entrega aparece separadamente aqui.</p></div> : <div className="grid gap-3 p-4 sm:p-6">{visibleModels.map((item) => <ModelTrackingCard key={item.key} item={item} onSave={saveTracking}/>)}</div>}
        </section>
      </div>
  </CoreShell>;
}

function EditReceiptButton({ item, onSaved }: { item: Receipt; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [observation, setObservation] = useState(item.observation || "");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return toast.error("Informe uma quantidade inteira maior que zero.");
    try {
      setSaving(true);
      const response = await fetch("/api/receipts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, quantity: parsedQuantity, observation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível corrigir o recebimento.");
      toast.success("Recebimento corrigido. Os totais foram recalculados.");
      setOpen(false);
      await onSaved();
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`Editar recebimento de ${item.model}`}><Pencil size={15}/>Editar</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Corrigir recebimento</DialogTitle><DialogDescription>{item.model} · {item.color} · tamanho {item.size} · {shortDate(item.receivedAt)}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><label className="space-y-2"><Label>Quantidade correta</Label><Input type="number" min="1" step="1" inputMode="numeric" value={quantity} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setQuantity(event.target.value)} required/></label><label className="space-y-2"><Label>Observação</Label><Textarea rows={3} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Ex.: chegou depois"/></label><Button className="w-full bg-[#2563EB]" disabled={saving}>{saving ? "Salvando..." : "Salvar correção"}</Button></form></DialogContent></Dialog>;
}

function groupReceiptsByDelivery(receipts: Receipt[], tracking: Tracking[], legacyTracking: LegacyTracking[]): GroupedModel[] {
  const trackingMap = new Map(tracking.map((item) => [item.batchKey, item]));
  const legacyMap = new Map(legacyTracking.map((item) => [item.model, item]));
  const groups = new Map<string, Receipt[]>();
  for (const receipt of receipts) { const key = receipt.batchKey || `legacy:${receipt.receivedAt}:${receipt.model}`; groups.set(key, [...(groups.get(key) || []), receipt]); }
  return [...groups.entries()].map(([key, variants]) => { const model = variants[0].model; const state = trackingMap.get(key) || (!variants[0].batchKey ? legacyMap.get(model) : undefined); return { key, model, variants, total: variants.reduce((sum, item) => sum + item.quantity, 0), lastReceivedAt: variants[0].receivedAt, status: state?.status || "pending", pendingNote: state?.pendingNote || "" }; }).sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt) || b.variants[0].id - a.variants[0].id);
}

function aggregateVariants(receipts: Receipt[]) {
  const groups = new Map<string, { color: string; size: string; quantity: number }>();
  for (const item of receipts) { const key = `${item.color}\u0000${item.size}`; const current = groups.get(key); groups.set(key, { color: item.color, size: item.size, quantity: (current?.quantity || 0) + item.quantity }); }
  return [...groups.values()].sort((a, b) => {
    const colorOrder = a.color.localeCompare(b.color, "pt-BR");
    if (colorOrder) return colorOrder;
    const aIndex = sizes.indexOf(a.size);
    const bIndex = sizes.indexOf(b.size);
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? sizes.length : aIndex) - (bIndex === -1 ? sizes.length : bIndex);
    return a.size.localeCompare(b.size, "pt-BR", { numeric: true });
  });
}

type PendingTask = { id: string; text: string; done: boolean };

function parsePendingTasks(value: string): PendingTask[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as PendingTask[];
    if (Array.isArray(parsed)) return parsed.filter((task) => task?.text).map((task, index) => ({ id: task.id || `task-${index}`, text: String(task.text), done: Boolean(task.done) }));
  } catch { /* Textos antigos são convertidos abaixo. */ }
  return value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ id: `legacy-${index}`, text, done: false }));
}

function ModelTrackingCard({ item, onSave }: { item: GroupedModel; onSave: (batchKey: string, model: string, status: "pending" | "completed", pendingNote: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const tasks = parsePendingTasks(item.pendingNote);
  const completedCount = tasks.filter((task) => task.done).length;

  async function persist(nextTasks: PendingTask[], status = item.status) {
    try {
      setSaving(true);
      await onSave(item.key, item.model, status, JSON.stringify(nextTasks));
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  return <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 transition hover:border-[#2563EB]/35 hover:shadow-sm">
    <div className="flex items-start gap-3">
      <button type="button" disabled={saving} onClick={() => persist(tasks, item.status === "completed" ? "pending" : "completed")} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${item.status === "completed" ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#FFF4E5] text-[#9a6500] hover:bg-[#ffe7ad]"}`} aria-label={item.status === "completed" ? "Reabrir recebimento" : "Concluir recebimento"}>{item.status === "completed" ? <CircleCheckBig size={21}/> : <Clock3 size={21}/>}</button>
      <Link prefetch href={`/recebimento-detalhe?key=${encodeURIComponent(item.key)}`} className="group min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-[#111827]">{item.model}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "completed" ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#FFF4E5] text-[#9a6500]"}`}>{item.status === "completed" ? "Concluído" : "Pendente"}</span></div>
        <p className="mt-1 text-xs text-[#6B7280]">Entrega de {shortDate(item.lastReceivedAt)} · {item.total} peças</p>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB]">Abrir detalhes <ChevronRight size={14} className="transition group-hover:translate-x-0.5"/></span>
      </Link>
    </div>
    {tasks.length ? <div className="mt-3 space-y-2 border-t border-[#E2E8F0] pt-3">{tasks.slice(0, 4).map((task) => <label key={task.id} className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox disabled={saving} checked={task.done} onCheckedChange={(checked) => persist(tasks.map((current) => current.id === task.id ? { ...current, done: checked === true } : current))}/><span className={task.done ? "text-[#6B7280] line-through" : "font-semibold text-[#4B5563]"}>{task.text}</span></label>)}{tasks.length > 4 && <p className="text-xs font-semibold text-[#2563EB]">+ {tasks.length - 4} tarefa(s) na página completa</p>}<p className="text-[11px] text-[#6B7280]">{completedCount} de {tasks.length} concluída(s)</p></div> : item.status === "pending" && <Link href={`/recebimento-detalhe?key=${encodeURIComponent(item.key)}`} className="mt-3 block border-t border-[#E2E8F0] pt-3 text-xs font-semibold text-[#6B7280] hover:text-[#2563EB]">Adicionar checklist do que falta</Link>}
  </article>;
}

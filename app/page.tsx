"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Box, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheckBig, ClipboardCheck, Clock3, Filter, Layers3, LogOut, Menu, PackageCheck, Pencil, Plus, Search, Shirt, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast, Toaster } from "sonner";
import Link from "next/link";

type Receipt = { id: number; receivedAt: string; model: string; color: string; size: string; quantity: number; checkedBy: string; observation: string | null };
type Tracking = { id: number; model: string; status: "pending" | "completed"; pendingNote: string | null; updatedAt: string };
type GroupedModel = { model: string; total: number; lastReceivedAt: string; variants: Receipt[]; status: "pending" | "completed"; pendingNote: string };
type User = { name: string; email: string | null; role: "admin" | "chefe" | "conferente" | "vendedora" };
const sizes = ["PP", "P", "M", "G", "GG", "XG", "Único"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const newColorRow = () => ({ color: "", quantities: Object.fromEntries(sizes.map((size) => [size, ""])) as Record<string, string> });
function shortDate(value: string) { const [y, m, d] = value.slice(0, 10).split("-"); return `${d}/${m}/${y}`; }

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [user, setUser] = useState<User>({ name: "Usuário Coreto", email: null, role: "admin" });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({ receivedAt: today(), model: "", observation: "" });
  const [colorRows, setColorRows] = useState([newColorRow()]);
  const [filters, setFilters] = useState({ from: "", to: "", model: "", color: "" }); const [applied, setApplied] = useState(filters); const [suggestions, setSuggestions] = useState<string[]>([]);
  const load = useCallback(async () => {
    setLoading(true); const params = new URLSearchParams(); Object.entries(applied).forEach(([k, v]) => v && params.set(k, v));
    const response = await fetch(`/api/receipts?${params}`); const data = await response.json();
    if (response.ok) { setReceipts(data.receipts); setTracking(data.tracking || []); setUser(data.user); setSuggestions(data.models); } else if (data.redirect) { window.location.replace(data.redirect); return; } else toast.error(data.error ?? "Não foi possível carregar os recebimentos."); setLoading(false);
  }, [applied]);
  useEffect(() => { load(); }, [load]);
  const total = useMemo(() => receipts.reduce((sum, item) => sum + item.quantity, 0), [receipts]);
  const weekTotal = useMemo(() => { const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0); return receipts.filter((r) => new Date(`${r.receivedAt}T12:00:00`) >= monday).reduce((sum, r) => sum + r.quantity, 0); }, [receipts]);
  const groupedModels = useMemo(() => groupReceiptsByModel(receipts, tracking), [receipts, tracking]);
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
  async function saveTracking(model: string, status: "pending" | "completed", pendingNote: string) {
    const response = await fetch("/api/receipts", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, status, pendingNote }) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o acompanhamento.");
    setTracking((current) => [...current.filter((item) => item.model !== model), data.tracking]);
    toast.success(status === "completed" ? "Modelo marcado como concluído." : "Pendência atualizada.");
  }
  async function deleteReceipt(id: number) {
    const response = await fetch(`/api/receipts?id=${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { toast.error(data.error ?? "Não foi possível excluir o recebimento."); return; }
    toast.success("Recebimento excluído do histórico.");
    await load();
  }
  return <div className="min-h-screen bg-[#F3F6F8] text-[#16324A]">
    <Toaster richColors position="top-right" />
    {mobileNav && <button className="fixed inset-0 z-30 bg-[#071c33]/45 lg:hidden" aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col bg-[#16324A] text-white shadow-2xl transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-24 items-center justify-between border-b border-white/10 px-7"><img src="/coreto-logo.png" alt="Coreto" className="h-14 w-auto object-contain"/><button className="lg:hidden" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={21} /></button></div>
      <nav className="coreto-scrollbar flex-1 overflow-y-auto px-4 py-6"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/60">Operação</div><a className="flex items-center gap-3 rounded-xl bg-[#159C85] px-4 py-3.5 text-sm font-semibold shadow-lg shadow-[#0b2847]/20" href="#top"><PackageCheck size={20} />Recebimento da Facção</a>{user.role === "admin" && <div className="mt-3 space-y-1">{[["/estoque-precificacao","Estoque & Precificação"],["/retiradas","Retiradas"],["/folha-comissao","Folha & Comissão"],["/fluxo-financeiro","Fluxo Financeiro"],["/vendas-comparativos","Vendas & Comparativos"],["/analise-financeira","Análise Financeira"],["/crm","CRM"],["/usuarios","Usuários e acessos"]].map(([href,item]) => <Link prefetch href={href} key={href} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"><Box size={17} />{item}</Link>)}</div>}</nav>
      <div className="border-t border-white/10 p-4"><div className="flex items-center gap-3 rounded-xl bg-white/[.07] p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#45D6B3] font-bold text-[#16324A]">{user.name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{user.name}</div><div className="text-xs capitalize text-blue-100/65">{user.role}</div></div><LogOut size={16} className="text-blue-100/55" /></div></div>
    </aside>
    <main id="top" className="lg:ml-[268px]">
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#dce5ed] bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10"><div className="flex items-center gap-3"><button className="rounded-lg border border-[#d7e1ea] p-2 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20} /></button><div><p className="text-xs font-medium text-[#708398]">Operação / Recebimento</p><h1 className="text-lg font-bold tracking-tight text-[#16324A] sm:text-xl">Recebimento da Facção</h1></div></div><div className="hidden items-center gap-2 rounded-full border border-[#dce5ed] bg-[#F3F6F8] py-2 pl-2 pr-4 sm:flex"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#E9F9F5] text-[#159C85]"><UserRound size={16} /></div><span className="text-sm font-semibold">{user.name}</span><ChevronDown size={14} className="text-[#7890a6]" /></div></header>
      <div className="mx-auto grid max-w-[1500px] gap-6 p-5 sm:p-8 lg:p-10 xl:grid-cols-[minmax(360px,0.82fr)_minmax(620px,1.45fr)]">
        <section className="grid gap-4 md:grid-cols-3 xl:col-span-2"><div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#16324A] to-[#159C85] p-6 text-white shadow-lg shadow-[#16324A]/10 md:col-span-2"><div className="absolute -right-8 -top-10 h-40 w-40 rounded-full border-[24px] border-white/[.06]" /><div className="relative flex items-start justify-between"><div><p className="text-sm font-medium text-blue-100">Peças recebidas nesta semana</p><p className="mt-2 text-4xl font-black tracking-tight">{weekTotal.toLocaleString("pt-BR")}</p><p className="mt-2 text-xs text-blue-100/75">Atualizado com os registros do histórico</p></div><div className="rounded-2xl bg-white/10 p-3"><Shirt size={28} /></div></div></div><div className="rounded-2xl border border-[#dfe7ee] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-[#6a7f92]">Total no período filtrado</p><p className="mt-2 text-3xl font-black tracking-tight text-[#16324A]">{total.toLocaleString("pt-BR")}</p><p className="mt-2 text-xs text-[#8ca0b2]">{receipts.length} {receipts.length === 1 ? "registro" : "registros"}</p></div><div className="rounded-2xl bg-[#E9F9F5] p-3 text-[#159C85]"><ClipboardCheck size={25} /></div></div></div></section>
        <section className="contents">
          <form onSubmit={submit} className="rounded-2xl border border-[#dfe7ee] bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-[#e5ecf2] px-6 py-5"><div className="rounded-xl bg-[#E9F9F5] p-2 text-[#159C85]"><Plus size={20} /></div><div><h2 className="font-bold text-[#16324A]">Novo recebimento</h2><p className="text-xs text-[#8294a5]">Informe o modelo e todas as cores e tamanhos recebidos</p></div></div><div className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="date">Data do recebimento</Label><div className="relative"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8396a8]" size={17} /><Input id="date" type="date" className="h-11 pl-10" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} required /></div></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="model">Modelo</Label><Input id="model" list="models" className="h-11" placeholder="Ex.: Vestido Aurora" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} autoComplete="off" required /><datalist id="models">{suggestions.map((model) => <option key={model} value={model} />)}</datalist></div>
            <div className="space-y-3 sm:col-span-2"><div className="flex items-center justify-between"><div><Label>Cores e quantidades desta nova entrega</Label><p className="mt-1 text-xs text-[#8294a5]">Cada salvamento cria novos registros no histórico. Deixe em branco os tamanhos que não chegaram.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setColorRows([...colorRows, newColorRow()])}><Plus size={15}/>Adicionar cor</Button></div>{colorRows.map((row, rowIndex) => <div key={rowIndex} className="rounded-2xl border border-[#dce6ed] bg-[#F3F6F8] p-4"><div className="mb-4 flex items-center gap-2"><Input aria-label={`Cor ${rowIndex + 1}`} className="h-11 bg-white" placeholder="Ex.: Preto, verde ou amarelo" value={row.color} onChange={(event) => setColorRows(colorRows.map((item, index) => index === rowIndex ? { ...item, color: event.target.value } : item))}/>{colorRows.length > 1 && <Button type="button" size="icon" variant="ghost" className="shrink-0 text-red-500" aria-label={`Remover cor ${rowIndex + 1}`} onClick={() => setColorRows(colorRows.filter((_, index) => index !== rowIndex))}><X size={17}/></Button>}</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{sizes.map((size) => <label key={size} className="space-y-1.5"><span className="block text-center text-xs font-bold text-[#486176]">{size}</span><Input aria-label={`Quantidade ${size} da cor ${row.color || rowIndex + 1}`} className="h-10 bg-white px-2 text-center font-bold" type="number" min="0" step="1" inputMode="numeric" autoComplete="off" placeholder="0" value={row.quantities[size]} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setColorRows(colorRows.map((item, index) => index === rowIndex ? { ...item, quantities: { ...item.quantities, [size]: event.target.value } } : item))}/></label>)}</div><p className="mt-3 text-right text-xs font-semibold text-[#159C85]">Total desta nova cor: {sizes.reduce((sum, size) => sum + Number(row.quantities[size] || 0), 0)} peças</p></div>)}</div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="checkedBy">Conferido por</Label><Input id="checkedBy" className="h-11 bg-[#f4f7f9] text-[#5d7184]" value={user.name} disabled /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="observation">Observação <span className="font-normal text-[#96a6b4]">(opcional)</span></Label><Textarea id="observation" rows={3} placeholder="Ex.: veio a menos que o combinado" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} /></div><Button type="submit" disabled={saving} className="h-12 bg-[#159C85] font-bold hover:bg-[#1069a8] sm:col-span-2">{saving ? "Salvando..." : <><Check size={18} />Salvar todas as cores e tamanhos</>}</Button>
          </div></form>
          <section className="order-last min-w-0 rounded-2xl border border-[#dfe7ee] bg-white shadow-sm xl:col-span-2"><div className="border-b border-[#e5ecf2] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-bold text-[#16324A]">Histórico de recebimentos</h2><p className="mt-0.5 text-xs text-[#8294a5]">Registros mais recentes primeiro</p></div><div className="flex items-center gap-2 text-xs font-semibold text-[#159C85]"><Sparkles size={15} />Variações disponíveis para ficha técnica</div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Input aria-label="Data inicial" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /><Input aria-label="Data final" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9baa]" size={15} /><Input className="pl-9" placeholder="Filtrar modelo" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} /></div><div className="flex gap-2"><Input placeholder="Filtrar cor" value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value })} /><Button type="button" aria-label="Aplicar filtros" onClick={() => setApplied(filters)} className="shrink-0 bg-[#16324A]"><Filter size={16} /></Button></div></div>{Object.values(applied).some(Boolean) && <button className="mt-3 text-xs font-semibold text-[#159C85] hover:underline" onClick={() => { const empty = { from: "", to: "", model: "", color: "" }; setFilters(empty); setApplied(empty); }}>Limpar filtros</button>}</div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#F3F6F8]"><TableHead>Data</TableHead><TableHead>Modelo</TableHead><TableHead>Cor</TableHead><TableHead>Tam.</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead>Conferido por</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="h-40 text-center text-[#7e91a2]">Carregando recebimentos...</TableCell></TableRow> : receipts.length === 0 ? <TableRow><TableCell colSpan={8} className="h-48 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#E9F9F5] text-[#159C85]"><PackageCheck /></div><p className="mt-3 font-semibold text-[#16324A]">Nenhum recebimento encontrado</p><p className="mt-1 text-xs text-[#8799a9]">Registre a primeira peça ou ajuste os filtros.</p></TableCell></TableRow> : receipts.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-[#617689]">{shortDate(item.receivedAt)}</TableCell><TableCell className="font-semibold text-[#16324A]">{item.model}</TableCell><TableCell>{item.color}</TableCell><TableCell><span className="rounded-md bg-[#E9F9F5] px-2 py-1 text-xs font-bold text-[#159C85]">{item.size}</span></TableCell><TableCell className="text-right font-bold">{item.quantity}</TableCell><TableCell className="whitespace-nowrap">{item.checkedBy}</TableCell><TableCell className="max-w-[220px] truncate text-[#718598]" title={item.observation ?? ""}>{item.observation || "—"}</TableCell><TableCell><div className="flex justify-end gap-2"><EditReceiptButton item={item} onSaved={load}/><AlertDialog><AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Excluir recebimento de ${item.model}`}><Trash2 size={15}/>Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir este recebimento?</AlertDialogTitle><AlertDialogDescription>O registro de {item.quantity} peça(s) do modelo {item.model}, cor {item.color}, tamanho {item.size}, será removido do histórico. Os totais serão recalculados automaticamente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteReceipt(item.id)}>Excluir recebimento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div>
          </section>
        </section>
        <section className="rounded-2xl border border-[#dfe7ee] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[#e5ecf2] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-[#E9F9F5] p-2.5 text-[#159C85]"><Layers3 size={21}/></div><div><h2 className="font-bold text-[#16324A]">Acompanhamento por modelo</h2><p className="mt-0.5 text-sm text-[#718598]">Veja o que já chegou e registre o que ainda falta finalizar.</p></div></div>
            <div className="flex gap-2 text-sm"><span className="rounded-full bg-[#FFF4E5] px-3 py-1.5 font-semibold text-[#9a6500]">{groupedModels.filter((item) => item.status === "pending").length} pendentes</span><span className="rounded-full bg-[#E9F9F5] px-3 py-1.5 font-semibold text-[#159C85]">{groupedModels.filter((item) => item.status === "completed").length} concluídos</span></div>
          </div>
          {loading ? <div className="py-14 text-center text-[#7e91a2]">Carregando modelos...</div> : groupedModels.length === 0 ? <div className="py-14 text-center"><PackageCheck className="mx-auto text-[#159C85]"/><p className="mt-3 font-semibold text-[#16324A]">Nenhum modelo encontrado</p><p className="mt-1 text-sm text-[#8799a9]">Os modelos aparecem aqui depois do primeiro recebimento.</p></div> : <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">{groupedModels.map((item) => <ModelTrackingCard key={item.model} item={item} onSave={saveTracking}/>)}</div>}
        </section>
      </div>
    </main>
  </div>;
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
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" size="sm" variant="outline" aria-label={`Editar recebimento de ${item.model}`}><Pencil size={15}/>Editar</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Corrigir recebimento</DialogTitle><DialogDescription>{item.model} · {item.color} · tamanho {item.size} · {shortDate(item.receivedAt)}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><label className="space-y-2"><Label>Quantidade correta</Label><Input type="number" min="1" step="1" inputMode="numeric" value={quantity} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setQuantity(event.target.value)} required/></label><label className="space-y-2"><Label>Observação</Label><Textarea rows={3} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Ex.: chegou depois"/></label><Button className="w-full bg-[#159C85]" disabled={saving}>{saving ? "Salvando..." : "Salvar correção"}</Button></form></DialogContent></Dialog>;
}

function groupReceiptsByModel(receipts: Receipt[], tracking: Tracking[]): GroupedModel[] {
  const trackingMap = new Map(tracking.map((item) => [item.model, item]));
  const groups = new Map<string, Receipt[]>();
  for (const receipt of receipts) groups.set(receipt.model, [...(groups.get(receipt.model) || []), receipt]);
  return [...groups.entries()].map(([model, variants]) => { const state = trackingMap.get(model); return { model, variants, total: variants.reduce((sum, item) => sum + item.quantity, 0), lastReceivedAt: variants.reduce((latest, item) => item.receivedAt > latest ? item.receivedAt : latest, variants[0].receivedAt), status: state?.status || "pending", pendingNote: state?.pendingNote || "" }; }).sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt) || a.model.localeCompare(b.model));
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

function ModelTrackingCard({ item, onSave }: { item: GroupedModel; onSave: (model: string, status: "pending" | "completed", pendingNote: string) => Promise<void> }) {
  const [status, setStatus] = useState<"pending" | "completed">(item.status);
  const [tasks, setTasks] = useState<PendingTask[]>(() => parsePendingTasks(item.pendingNote));
  const [newTask, setNewTask] = useState("");
  const [saving, setSaving] = useState(false);
  const variants = aggregateVariants(item.variants);
  const totalsByColor = variants.reduce<Record<string, number>>((totals, variant) => { totals[variant.color] = (totals[variant.color] || 0) + variant.quantity; return totals; }, {});
  const visibleTasks = parsePendingTasks(item.pendingNote);
  const completedCount = visibleTasks.filter((task) => task.done).length;

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    setTasks((current) => [...current, { id: crypto.randomUUID(), text, done: false }]);
    setNewTask("");
  }

  async function save() {
    try {
      setSaving(true);
      const cleanTasks = tasks.filter((task) => task.text.trim()).map((task) => ({ ...task, text: task.text.trim() }));
      await onSave(item.model, status, JSON.stringify(cleanTasks));
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  return <Sheet>
    <SheetTrigger asChild>
      <button className="group flex w-full items-start gap-3 rounded-2xl border border-[#dfe7ee] p-3 text-left transition hover:border-[#159C85]/40 hover:bg-[#f7fbfe] hover:shadow-sm">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.status === "completed" ? "bg-[#E9F9F5] text-[#159C85]" : "bg-[#FFF4E5] text-[#9a6500]"}`}>{item.status === "completed" ? <CircleCheckBig size={19}/> : <Clock3 size={19}/>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold text-[#16324A]">{item.model}</p><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.status === "completed" ? "bg-[#E9F9F5] text-[#159C85]" : "bg-[#FFF4E5] text-[#9a6500]"}`}>{item.status === "completed" ? "Concluído" : "Pendente"}</span></div>
          {item.status === "completed" ? <p className="mt-1 text-sm text-[#159C85]">Processo finalizado</p> : visibleTasks.length ? <div className="mt-1.5 space-y-1">{visibleTasks.slice(0, 3).map((task) => <div key={task.id} className={`flex items-center gap-1.5 text-xs ${task.done ? "text-[#8294a5] line-through" : "font-semibold text-[#536a7e]"}`}><span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border ${task.done ? "border-[#20a8a5] bg-[#20a8a5] text-white" : "border-[#aebbc6] bg-white"}`}>{task.done && <Check size={10}/>}</span><span className="truncate">{task.text}</span></div>)}{visibleTasks.length > 3 && <p className="text-xs font-semibold text-[#159C85]">+ {visibleTasks.length - 3} pendência(s)</p>}<p className="text-xs text-[#8294a5]">{completedCount} de {visibleTasks.length} concluída(s)</p></div> : <p className="mt-1 text-sm text-[#718598]">Clique para criar a lista do que falta</p>}
          <p className="mt-1.5 text-xs text-[#91a0ad]">{item.total} peças · {shortDate(item.lastReceivedAt)}</p>
        </div>
        <ChevronRight className="mt-2 shrink-0 text-[#91a0ad] transition group-hover:translate-x-0.5 group-hover:text-[#159C85]" size={18}/>
      </button>
    </SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader className="border-b px-6 py-6"><SheetTitle className="text-xl text-[#16324A]">{item.model}</SheetTitle><SheetDescription>{item.total} peças recebidas · detalhes por cor e tamanho</SheetDescription></SheetHeader>
      <div className="space-y-6 px-6 pb-8">
        <div className="space-y-3"><h3 className="font-bold text-[#16324A]">Cores e tamanhos recebidos</h3><div className="overflow-hidden rounded-xl border border-[#dfe7ee]"><Table className="table-fixed"><TableHeader><TableRow className="bg-[#F3F6F8]"><TableHead className="h-9 w-[34%] px-2">Cor</TableHead><TableHead className="h-9 w-[20%] px-2">Tamanho</TableHead><TableHead className="h-9 w-[22%] px-2 text-right">Quantidade</TableHead><TableHead className="h-9 w-[24%] px-2 text-right">Total da cor</TableHead></TableRow></TableHeader><TableBody>{variants.map((variant) => <TableRow key={`${variant.color}-${variant.size}`}><TableCell className="px-2 py-1.5 font-semibold text-[#16324A]">{variant.color}</TableCell><TableCell className="px-2 py-1.5"><span className="rounded-md bg-[#E9F9F5] px-2 py-1 text-xs font-bold text-[#159C85]">{variant.size}</span></TableCell><TableCell className="px-2 py-1.5 text-right font-bold">{variant.quantity}</TableCell><TableCell className="px-2 py-1.5 text-right font-black text-[#159C85]">{totalsByColor[variant.color]}</TableCell></TableRow>)}</TableBody></Table></div></div>
        <div className="space-y-4 rounded-2xl bg-[#F3F6F8] p-5">
          <div className="space-y-2"><Label>Status do modelo</Label><Select value={status} onValueChange={(value) => setStatus(value as "pending" | "completed")}><SelectTrigger className="h-11 w-full bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="completed">Concluído</SelectItem></SelectContent></Select></div>
          {status === "pending" && <div className="space-y-3"><div><Label>Checklist do que falta</Label><p className="mt-1 text-xs text-[#8294a5]">Marque cada etapa conforme for concluída.</p></div><div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-xl border bg-white p-3"><Checkbox checked={task.done} onCheckedChange={(checked) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: checked === true } : item))}/><Input className={`h-9 flex-1 border-0 px-0 shadow-none focus-visible:ring-0 ${task.done ? "text-[#8294a5] line-through" : ""}`} value={task.text} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, text: event.target.value } : item))}/><Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500" aria-label="Remover tarefa" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}><X size={16}/></Button></div>)}</div><div className="flex gap-2"><Input className="bg-white" placeholder="Ex.: emitir etiqueta" value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTask(); } }}/><Button type="button" variant="outline" onClick={addTask}><Plus size={16}/>Adicionar</Button></div></div>}
          <Button onClick={save} disabled={saving} className="h-11 w-full bg-[#159C85] font-bold hover:bg-[#1069a8]">{saving ? "Salvando..." : "Salvar acompanhamento"}</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}

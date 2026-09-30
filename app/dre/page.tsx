"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, FileSpreadsheet, Upload, CircleAlert, Check, Save, ChevronDown, LoaderCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CoreShell, Panel, money } from "@/components/core-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dreGroups, emptyDreInputs, categoryGroup, parseMoney, summarizeDre, type DreEntry, type DreMapping, type DreInputs } from "@/lib/dre";
import { readContaAzulFile } from "@/lib/dre-excel";
import "./dre.css";

type MonthData = { month: string; entries: DreEntry[]; mapping: DreMapping; inputs: DreInputs; fileName: string | null; revision: number; updatedAt: string | null };
type Preview = { entries: DreEntry[]; errors: string[]; skipped: number; months: string[]; fileName: string };
const currentMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0,7);
const amount = (value: number | null) => value === null ? "—" : money(value);
const inputLabels: Record<keyof DreInputs,string> = { revenue: "Vendas de produtos e serviços", freight: "Receitas de fretes e entregas", financialIncome: "Receitas financeiras", cmv: "CMV reconhecido no mês", cpv: "CPV reconhecido no mês" };
const dateLabel = (date: string) => date.slice(0,10).split("-").reverse().join("/");
function fresh(month: string): MonthData { return { month, entries: [], mapping: {}, inputs: { ...emptyDreInputs }, fileName: null, revision: 0, updatedAt: null }; }
export default function DrePage() { return <CoreShell active="/dre" title="DRE" subtitle="Entenda os resultados, dos lançamentos ao desempenho do mês."><DreContent /></CoreShell>; }
function DreContent() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<MonthData>(() => fresh(currentMonth()));
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [reading, setReading] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null), [previewMonth, setPreviewMonth] = useState("");
  const [draftMapping, setDraftMapping] = useState<DreMapping>({});
  const [inputDraft, setInputDraft] = useState<Record<string,string>>({});
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setMessage(""); setPage(0);
    fetch("/api/dre?month=" + month, { signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível carregar este mês.");
      setData(result); setDraftMapping(result.mapping);
      setInputDraft(Object.fromEntries(Object.entries(result.inputs).map(([key,value]) => [key, value === null ? "" : String(value).replace(".",",")])));
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, attempt]);
  const summary = useMemo(() => summarizeDre(data.entries, data.mapping, data.inputs, month), [data,month]);
  const previewRows = preview?.entries.filter(row => row.competence.slice(0,7) === previewMonth) || [];
  const previewSummary = summarizeDre(previewRows, draftMapping, emptyDreInputs, previewMonth);
  const filtered = data.entries.filter(row => (row.description + " " + row.supplier + " " + row.category).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const chart = dreGroups.filter(group => !["cmv","cpv","excluded"].includes(group.id)).map(group => ({ name: ({admin:"Estrutura administrativa",marketing:"Marketing",deductions:"Deduções",services:"Serviços de terceiros",financial:"Financeiras"} as Record<string,string>)[group.id] || group.label, value: summary.totals[group.id] })).filter(group => group.value !== 0).sort((a,b) => b.value-a.value);
  async function save(next: MonthData, success: string) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dre", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      const saved = { ...next, ...result }; setData(saved); setDraftMapping(saved.mapping); setMessage(success); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); return false; }
    finally { setSaving(false); }
  }
  async function readFile(file?: File) {
    if (!file) return; setReading(true); setError(""); setMessage("");
    try {
      const result = await readContaAzulFile(file);
      setPreview({ ...result, fileName: file.name });
      const selected = result.months.includes(month) ? month : result.months.at(-1) || month;
      setPreviewMonth(selected); if (selected !== month) setMonth(selected);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ler este arquivo."); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function saveInputs() {
    const inputs = { ...emptyDreInputs };
    for (const key of Object.keys(inputs) as (keyof DreInputs)[]) {
      const value = inputDraft[key]?.trim() || ""; const number = value ? parseMoney(value) : null;
      if (value && (number === null || number < 0)) { setError("Informe um valor válido e não negativo em " + inputLabels[key] + "."); return; }
      inputs[key] = number;
    }
    await save({ ...data, inputs }, "Receitas e custos atualizados.");
  }
  return <div className="dre-workspace">
    <div className="dre-toolbar">
      <div className="dre-period"><label htmlFor="dre-month">Competência</label><Input id="dre-month" type="month" value={month} disabled={saving || reading || !!preview} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} /><span>Regime de competência</span></div>
      <input ref={fileInput} type="file" accept=".xls,.xlsx" className="sr-only" aria-label="Arquivo Conta Azul" onChange={event => readFile(event.target.files?.[0])} />
      <Button onClick={() => fileInput.current?.click()} disabled={loading || saving || reading}>{reading ? <LoaderCircle className="animate-spin" /> : <Upload />} {reading ? "Lendo arquivo…" : "Importar Conta Azul"}</Button>
    </div>
    {error && <div role="alert" className="dre-notice dre-notice-error"><CircleAlert /><div>{error} <button className="underline" onClick={() => setAttempt(value => value+1)}>Recarregar dados salvos</button></div></div>}
    {message && <div role="status" className="dre-notice"><Check />{message}</div>}
    {loading ? <div className="dre-empty"><LoaderCircle className="animate-spin" /> Carregando a DRE…</div> : data.month !== month ? <div className="dre-empty">Os dados deste mês não foram carregados. Tente novamente.</div> : <>
    {preview && <Panel title="Conferir importação" action={<Button variant="outline" disabled={saving} onClick={() => setPreview(null)}>Cancelar</Button>}>
      <div className="dre-import-meta"><FileSpreadsheet /><div><strong>{preview.fileName}</strong><p>{preview.entries.length} lançamentos encontrados · {preview.skipped} linhas desconsideradas (canceladas ou totais)</p></div></div>
      <div className="dre-import-select"><label htmlFor="import-month">Competência a importar</label><select id="import-month" value={previewMonth} disabled={saving} onChange={event => { setPreviewMonth(event.target.value); setMonth(event.target.value); }}>{preview.months.map(item => <option key={item}>{item}</option>)}</select><span>{previewRows.length} lançamentos · {money(previewSummary.original)}</span></div>
      {preview.months.length > 1 && <p className="dre-helper">O arquivo contém vários meses. Importe uma competência por vez; os outros meses permanecem intactos.</p>}
      {preview.errors.length > 0 && <div className="dre-notice dre-notice-error"><div><strong>Corrija {preview.errors.length} linha(s) antes de importar.</strong><ul>{preview.errors.slice(0,10).map(text => <li key={text}>{text}</li>)}</ul></div></div>}
      <p className="dre-helper">A importação substitui a base de contas desta competência, sem somar novamente arquivos repetidos. Exporte todas as contas do mês, com todos os status, para preservar a cobertura.</p>
      {data.entries.length > 0 && <div className="dre-notice"><CircleAlert />A base atual de {data.entries.length} lançamentos será substituída. Receitas e custos informados serão preservados.</div>}
      <CategoryMapping categories={previewSummary.categories} mapping={draftMapping} onChange={setDraftMapping} disabled={saving} />
      <div className="dre-import-actions"><p>{previewSummary.pendingCount ? previewSummary.pendingCount + " lançamentos ficarão pendentes de classificação." : "Todas as categorias possuem um grupo."}</p><Button disabled={saving || !!preview.errors.length || !previewRows.length || previewMonth !== month} onClick={async () => { if (await save({ ...data, entries: previewRows, mapping: draftMapping, fileName: preview.fileName }, "Importação concluída. Os gráficos e o demonstrativo foram atualizados.")) setPreview(null); }}>{saving ? "Salvando…" : data.entries.length ? "Substituir base deste mês" : "Confirmar importação"}</Button></div>
    </Panel>}
    <Tabs defaultValue="overview">
      <TabsList className="dre-tabs"><TabsTrigger value="overview"><BarChart3 />Visão geral</TabsTrigger><TabsTrigger value="statement"><FileSpreadsheet />Demonstrativo DRE</TabsTrigger></TabsList>
      <TabsContent value="overview" className="dre-tab-content">
        <div className="dre-metrics">
          <Metric label="Receita bruta" value={summary.gross} note={summary.gross === null ? "Informe vendas e fretes no demonstrativo" : "Vendas + fretes e entregas"} accent />
          <Metric label="Despesas operacionais" value={data.entries.length ? summary.expenses : null} note="Comerciais, administrativas e outras" />
          <Metric label="Resultado final" value={summary.result} note={summary.result === null ? "Aguardando dados e conferências" : "Receitas menos custos e despesas"} />
          <Metric label="Margem líquida" value={null} display={summary.margin === null ? "—" : summary.margin.toLocaleString("pt-BR",{maximumFractionDigits:1}) + "%"} note="Resultado final / receita líquida" />
        </div>
        {!data.entries.length ? <div className="dre-empty"><FileSpreadsheet size={32}/><h2>Seu resultado começa pelos lançamentos</h2><p>Importe a Visão Contas a Pagar do Conta Azul. Os grupos da sua DRE já estão preparados.</p><Button onClick={() => fileInput.current?.click()}>Selecionar Excel</Button></div> : <>
          <div className="dre-visual-grid"><Panel title="Despesas por grupo"><p className="dre-helper">Valores originais pela competência. Custos de estoque ficam separados.</p>{chart.length ? <div className="dre-chart" style={{height:Math.max(270,chart.length*42)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{left:4,right:24,top:10,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={value => Number(value).toLocaleString("pt-BR",{notation:"compact"})}/><YAxis type="category" dataKey="name" width={135} tick={{fontSize:11}}/><Tooltip formatter={value => money(Number(value))} cursor={{fill:"#eff6ff"}}/><Bar dataKey="value" name="Despesas" fill="#3B82F6" radius={[0,5,5,0]} maxBarSize={22}/></BarChart></ResponsiveContainer></div> : <p className="dre-empty">Nenhuma despesa classificada neste mês.</p>}</Panel>
          <Panel title="Composição da base"><div className="dre-composition">{[
            ["Lançamentos importados",summary.original,"Valor original · "+summary.count+" registros"],
            ["Pagamentos informados",summary.paid,"Total pago das parcelas desta competência"],
            ["Saldo em aberto",summary.open,"Saldo informado no arquivo importado"],
            ["Fora da DRE",summary.totals.excluded,"Patrimônio, adiantamentos e outros"],
            ["A classificar",summary.pending,summary.pendingCount+" lançamentos para conferir"],
          ].map(([label,value,note]) => <div key={String(label)}><span>{label}</span><strong>{money(Number(value))}</strong><small>{note}</small></div>)}</div></Panel></div>
          <Panel title="Maiores categorias"><div className="dre-ranking">{summary.categories.slice(0,6).map((item,index) => <div key={item.category}><span className="dre-rank-number">{String(index+1).padStart(2,"0")}</span><div><strong>{item.category}</strong><small>{item.group === "pending" ? "A classificar" : dreGroups.find(group => group.id===item.group)?.label}</small></div><b>{money(item.amount)}</b></div>)}</div></Panel>
        </>}
        <Readiness summary={summary} inputs={data.inputs} />
      </TabsContent>
      <TabsContent value="statement" className="dre-tab-content">
        <Readiness summary={summary} inputs={data.inputs} />
        <Panel title="Demonstrativo de resultados" action={<span className="dre-tag">Competência · {month.split("-").reverse().join("/")}</span>}>
          <p className="dre-helper">Abra os grupos para conferir as categorias. Valores pendentes aparecem como —. A estrutura segue suas categorias; o resultado só é exibido após os dados essenciais.</p>
          <div className="dre-statement">
            <StatementRow label="Receita bruta" value={summary.gross} total />
            <StatementRow label="Vendas de produtos e serviços" value={data.inputs.revenue} indent />
            <StatementRow label="Fretes e entregas a clientes" value={data.inputs.freight} indent />
            <GroupRow id="deductions" summary={summary} loaded={!!data.entries.length}/>
            <StatementRow label="Receita líquida" value={summary.net} total />
            <StatementRow label="Custos operacionais" value={summary.costs} total />
            <CostRow id="cmv" value={summary.cmv} summary={summary} />
            <CostRow id="cpv" value={summary.cpv} summary={summary} />
            <StatementRow label="Lucro bruto" value={summary.grossProfit} total />
            {["Despesas comerciais","Despesas administrativas","Outras despesas operacionais"].map(master => <div key={master}><div className="dre-master">{master}</div>{dreGroups.filter(group => group.master === master).map(group => <GroupRow key={group.id} id={group.id} summary={summary} loaded={!!data.entries.length}/>)}</div>)}
            <StatementRow label="Resultado operacional" value={summary.operating} total />
            <StatementRow label="Receitas financeiras" value={data.inputs.financialIncome} indent />
            <GroupRow id="financial" summary={summary} loaded={!!data.entries.length}/>
            <StatementRow label="Resultado financeiro" value={summary.financial} total />
            <StatementRow label="Resultado final" value={summary.result} total final />
          </div>
          <p className="dre-helper">Os valores pagos e em aberto são informativos. Juros, multas e descontos realizados não são lançados automaticamente em outra competência; confira sua apropriação antes do fechamento.</p>
        </Panel>
        <Panel title="Receitas e custos do mês" action={<Button disabled={saving || !!preview} onClick={saveInputs}><Save />{saving ? "Salvando…" : "Salvar valores"}</Button>}>
          <p className="dre-helper">Contas a pagar não contém receitas. Preencha os valores apurados, inclusive 0 quando não houver movimento. Deixe em branco o que ainda não foi conferido.</p>
          <div className="dre-inputs">{(Object.keys(inputLabels) as (keyof DreInputs)[]).map(key => <label key={key} htmlFor={"dre-"+key}><span>{inputLabels[key]}</span><Input id={"dre-"+key} inputMode="decimal" placeholder="Não informado" value={inputDraft[key] || ""} disabled={saving || !!preview} onChange={event => setInputDraft(current => ({...current,[key]:event.target.value}))}/>{key==="cmv" || key==="cpv" ? <small>Compras importadas: {money(summary.totals[key])}. Informe somente o custo dos itens vendidos.</small> : null}</label>)}</div>
        </Panel>
        {data.entries.length > 0 && <Panel title="Classificação das categorias" action={<Button variant="outline" disabled={saving || !!preview} onClick={() => save({...data,mapping:draftMapping},"Classificação atualizada.")}><Save />Salvar classificação</Button>}>
          <CategoryMapping categories={summary.categories} mapping={draftMapping} onChange={setDraftMapping} disabled={saving || !!preview}/>
        </Panel>}
        <Panel title="Lançamentos da competência" action={<span className="dre-tag">{data.entries.length} registros</span>}>
          <div className="dre-source"><FileSpreadsheet size={18}/><span>{data.fileName || "Nenhum arquivo importado"}{data.updatedAt ? " · Atualizado em "+dateLabel(data.updatedAt) : ""}</span></div>
          <Input aria-label="Buscar lançamentos" placeholder="Buscar descrição, fornecedor ou categoria…" value={query} onChange={event => {setQuery(event.target.value);setPage(0);}}/>
          <div className="dre-table-scroll"><Table><TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Descrição / fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Valor original</TableHead><TableHead>Pago</TableHead><TableHead>Em aberto</TableHead></TableRow></TableHeader><TableBody>{filtered.slice(page*15,page*15+15).map(row => <TableRow key={row.row}><TableCell>{dateLabel(row.competence)}</TableCell><TableCell><strong>{row.description || "Sem descrição"}</strong><small className="block text-muted-foreground">{row.supplier || "Fornecedor não informado"}</small></TableCell><TableCell>{row.category}</TableCell><TableCell>{money(row.original)}</TableCell><TableCell>{money(row.paid)}</TableCell><TableCell>{money(row.open)}</TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum lançamento encontrado.</TableCell></TableRow>}</TableBody></Table></div>
          {filtered.length>15 && <div className="dre-pagination"><Button variant="outline" disabled={!page} onClick={()=>setPage(value=>value-1)}>Anterior</Button><span>{page+1} / {Math.ceil(filtered.length/15)}</span><Button variant="outline" disabled={(page+1)*15>=filtered.length} onClick={()=>setPage(value=>value+1)}>Próxima</Button></div>}
        </Panel>
      </TabsContent>
    </Tabs>
    </>}
  </div>;
}
type Summary = ReturnType<typeof summarizeDre>;
function Metric({label,value,note,accent,display}:{label:string;value:number|null;note:string;accent?:boolean;display?:string}) { return <div className={"dre-metric"+(accent?" dre-metric-accent":"")}><span>{label}</span><strong>{display || amount(value)}</strong><p>{note}</p></div>; }
function StatementRow({label,value,total,indent,final}:{label:string;value:number|null;total?:boolean;indent?:boolean;final?:boolean}) { return <div className={"dre-statement-row"+(total?" dre-total":"")+(indent?" dre-indent":"")+(final?" dre-final":"")}><span>{label}</span><strong>{amount(value)}</strong></div>; }
function GroupRow({id,summary,loaded}:{id:typeof dreGroups[number]["id"];summary:Summary;loaded:boolean}) {
  const group=dreGroups.find(group=>group.id===id)!; const categories=summary.categories.filter(item=>item.group===id);
  return <details className="dre-group"><summary><span><ChevronDown size={14}/>{group.label}</span><strong>{loaded ? money(summary.totals[id]) : "—"}</strong></summary><div>{categories.length ? categories.map(item=><StatementRow key={item.category} label={item.category} value={item.amount} indent/>) : group.categories.map(category=><StatementRow key={category} label={category} value={loaded ? 0 : null} indent/>)}</div></details>;
}
function Readiness({summary,inputs}:{summary:Summary;inputs:DreInputs}) {
  const missing = [];
  if (!summary.count) missing.push("Importar as contas da competência");
  if (inputs.revenue===null || inputs.freight===null) missing.push("Informar receitas de vendas e fretes");
  if (inputs.financialIncome===null) missing.push("Conferir receitas financeiras");
  if (summary.cmv===null || summary.cpv===null) missing.push("Informar os custos das mercadorias e produtos vendidos");
  if (summary.pendingCount) missing.push("Classificar "+summary.pendingCount+" lançamentos");
  return <div className="dre-notice"><CircleAlert/><div><strong>{missing.length ? "Para completar o resultado" : "Base gerencial preenchida"}</strong><p>{missing.length ? missing.join(" · ")+". Use a aba Demonstrativo DRE." : "Confira a cobertura do arquivo e a apropriação dos custos antes de fechar o mês."}</p></div></div>;
}
function CategoryMapping({categories,mapping,onChange,disabled}:{categories:Summary["categories"];mapping:DreMapping;onChange:(mapping:DreMapping)=>void;disabled?:boolean}) {
  return <div className="dre-mapping">{categories.map(item=><div key={item.category}><div><strong>{item.category}</strong><small>{item.count} lançamentos · {money(item.amount)}</small></div><Select value={categoryGroup(item.category,mapping)} disabled={disabled} onValueChange={value=>onChange({...mapping,[item.category]:value as DreMapping[string]})}><SelectTrigger aria-label={"Grupo de "+item.category}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">A classificar</SelectItem>{dreGroups.map(group=><SelectItem key={group.id} value={group.id}>{group.master === group.label || group.id === "excluded" ? group.label : group.master + " · " + group.label}</SelectItem>)}</SelectContent></Select></div>)}</div>;
}

function CostRow({id,value,summary}:{id:"cmv"|"cpv";value:number|null;summary:Summary}) { const group=dreGroups.find(group=>group.id===id)!;const categories=summary.categories.filter(item=>item.group===id);return <details className="dre-group"><summary><span><ChevronDown size={14}/>{id==="cmv"?"Custo das mercadorias vendidas · CMV":"Custo dos produtos vendidos · CPV"}</span><strong>{amount(value)}</strong></summary><div className="dre-cost-note">Valor acima: custo reconhecido. Abaixo: compras importadas para conferência, que não são somadas novamente à DRE.</div>{categories.length ? categories.map(item=><StatementRow key={item.category} label={item.category} value={item.amount} indent/>) : group.categories.map(category=><StatementRow key={category} label={category} value={null} indent/>)}</details>; }

// Puxa do HeraDash (PDV da loja) vendas, formas de pagamento, vendedoras, clientes e curva ABC
// e grava em hera_dias / hera_meses. Roda de hora em hora pelo pg_cron e pelo botão "Atualizar agora".
// Credenciais do robô: segredos HERA_EMAIL e HERA_SENHA (cadastrados no painel do Supabase).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BASE = "https://dashboard.herasoft.com.br";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Par = { x: string; y: number };
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const partes = (iso: string) => ({ dia: iso.slice(8, 10), mes: iso.slice(5, 7), ano: iso.slice(2, 4) });

class SemLogin extends Error {}

async function entrar(): Promise<string> {
  // Aceita HERA_EMAIL/HERA_SENHA ou EMAIL/SENHA (nome com espaço sobrando também vale).
  const env = Object.entries(Deno.env.toObject()).map(([k, v]) => [k.trim().toUpperCase(), v] as const);
  const ler = (...nomes: string[]) => nomes.map((n) => env.find(([k]) => k === n)?.[1]).find(Boolean);
  const email = ler("HERA_EMAIL", "EMAIL")?.trim(), senha = ler("HERA_SENHA", "SENHA");
  if (!email || !senha) {
    const parecidos = Object.keys(Deno.env.toObject()).filter((k) => /hera|email|senha/i.test(k));
    throw new SemLogin(`Falta cadastrar HERA_EMAIL e HERA_SENHA nos segredos das Edge Functions.${parecidos.length ? ` Encontrei: ${parecidos.join(", ")}.` : ""}`);
  }
  const r = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
  if (!r.ok) throw new SemLogin(`O HeraDash recusou o login (status ${r.status}). Confira o e-mail e a senha do robô.`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new SemLogin("O HeraDash não devolveu a sessão no login.");
  await sb.from("hera_sessao").upsert({ id: 1, cookie, expira: new Date(Date.now() + 3.5 * 3600e3).toISOString() });
  return cookie;
}

async function sessao(): Promise<string> {
  const { data } = await sb.from("hera_sessao").select("cookie, expira").eq("id", 1).maybeSingle();
  if (data?.cookie && data.expira && new Date(data.expira).getTime() > Date.now() + 5 * 60e3) return data.cookie;
  return entrar();
}

let cookie = "";
async function api<T>(caminho: string, tentativa = 0): Promise<T | null> {
  const r = await fetch(`${BASE}${caminho}`, { headers: { cookie } });
  if ((r.status === 401 || r.status === 403 || r.status === 500) && tentativa === 0 && caminho !== "/api/user") {
    const u = await fetch(`${BASE}/api/user`, { headers: { cookie } });
    if (!u.ok) { cookie = await entrar(); return api<T>(caminho, 1); }
  }
  if (!r.ok) return null;
  const t = await r.text();
  try { return JSON.parse(t) as T; } catch { return null; }
}

// O HeraDash multiplica o valor da venda pelas peças no ranking de clientes; aqui desfazemos.
type ClienteHera = { x: string; VLR_TOTAL: number; VENDAS_TOTAL: number; PECAS_TOTAL: number };
const clientesCorrigidos = (lista: ClienteHera[] | null) => (lista ?? []).map((c) => ({
  nome: c.x.replace(/\s+/g, " ").trim(),
  valor: Math.round((c.PECAS_TOTAL ? c.VLR_TOTAL / c.PECAS_TOTAL : c.VLR_TOTAL) * 100) / 100,
  vendas: c.VENDAS_TOTAL, pecas: c.PECAS_TOTAL, aproximado: c.VENDAS_TOTAL > 1,
}));
const limpar = (l: Par[] | null) => (l ?? []).map((p) => ({ x: String(p.x).replace(/\s+/g, " ").trim(), y: Number(p.y) || 0 }));

async function puxarDia(loja: number, iso: string) {
  const { dia, mes, ano } = partes(iso);
  const q = `lojas=${loja}&dia=${dia}&mes=${mes}&ano=${ano}`;
  const [fat, caixa, vend, cli] = await Promise.all([
    api<number>(`/api/faturamento/dia?${q}`),
    api<Par[]>(`/api/caixa/dia?${q}`),
    api<Par[]>(`/api/funcionarios/vendas?${q}&resolveAll=false`),
    api<ClienteHera[]>(`/api/vendas/ranking-cliente/dia?${q}`),
  ]);
  return { data: iso, loja, faturamento: Number(fat) || 0, caixa: limpar(caixa), vendedoras: limpar(vend), clientes: clientesCorrigidos(cli), atualizado_em: new Date().toISOString() };
}

async function puxarMes(loja: number, primeiro: string) {
  const { mes, ano } = partes(primeiro);
  const q = `lojas=${loja}&mes=${mes}&ano=${ano}`;
  const [metricas, caixa, vend, produtos, subgrupos] = await Promise.all([
    api<Record<string, number>>(`/api/metricas?${q}`),
    api<Par[]>(`/api/caixa/mes?${q}`),
    api<Par[]>(`/api/funcionarios/vendas?${q}&resolveAll=true`),
    api<unknown[]>(`/api/vendas/ranking-produto/mes?${q}`),
    api<unknown[]>(`/api/vendas/ranking-subgrupo/mes?${q}`),
  ]);
  return { mes: primeiro, loja, metricas, caixa: limpar(caixa), vendedoras: limpar(vend), produtos: produtos ?? [], subgrupos: subgrupos ?? [], atualizado_em: new Date().toISOString() };
}

/* ---------- Fluxo: acumulado do mês (vendas por forma e por vendedora) ---------- */
function formaDoTipo(tipo: string): string {
  const t = tipo.toUpperCase();
  if (t.includes("PIX") && (t.includes("ABERTO") || t.includes("PARC"))) return "Pix em aberto";
  if (t.includes("PIX") || t.includes("TRANSF")) return "Pix";
  if (t.includes("LINK")) return "Link de pagamento";
  if (t.includes("DEBITO") || t.includes("DÉBITO")) return "Cartão de débito";
  if (t.includes("CART") || t.includes("CRED")) return "Cartão de crédito";
  if (t.includes("DINHEIRO")) return "Dinheiro";
  return tipo.toLowerCase().replace(/^\S/, (l) => l.toUpperCase());
}
const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
type Linha = { nome: string; valor: number };

/** Usa o nome que já está no Fluxo quando bate (ex.: "Cartão de Débito", "Millena"). */
function comNomesDoFluxo(novas: Linha[], antigas: Linha[], porPrimeiroNome: boolean): Linha[] {
  const usadas = new Set<number>();
  const primeiro = (s: string) => chave(s).split(/\s+/)[0];
  const saida = novas.map((n) => {
    const i = antigas.findIndex((a, j) => !usadas.has(j) && (chave(a.nome) === chave(n.nome) || (porPrimeiroNome && primeiro(a.nome) === primeiro(n.nome))));
    if (i < 0) return { nome: porPrimeiroNome ? n.nome.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()).split(" ")[0] : n.nome, valor: n.valor };
    usadas.add(i);
    return { nome: antigas[i].nome, valor: n.valor };
  });
  // Mantém na lista (zeradas) as vendedoras que já estavam no Fluxo e ainda não venderam no mês.
  if (porPrimeiroNome) antigas.forEach((a, j) => { if (!usadas.has(j)) saida.push({ nome: a.nome, valor: 0 }); });
  return saida;
}

async function atualizarFluxo(meses: string[], hoje: string) {
  for (const mes of meses) {
    const fim = `${mes.slice(0, 7)}-31`;
    const { data: dias } = await sb.from("hera_dias").select("caixa, vendedoras").gte("data", mes).lte("data", fim <= hoje ? fim : hoje);
    if (!dias?.length) continue;
    const formas = new Map<string, number>(), vend = new Map<string, number>();
    for (const d of dias as { caixa: Par[]; vendedoras: Par[] }[]) {
      for (const p of d.caixa ?? []) { const n = formaDoTipo(p.x); formas.set(n, (formas.get(n) ?? 0) + p.y); }
      for (const p of d.vendedoras ?? []) vend.set(p.x, (vend.get(p.x) ?? 0) + p.y);
    }
    const ordenar = (m: Map<string, number>) => [...m.entries()].map(([nome, valor]) => ({ nome, valor: r2(valor) })).filter((l) => l.valor !== 0).sort((a, b) => b.valor - a.valor);
    if (!formas.size && !vend.size) continue;
    const { data: atual } = await sb.from("fluxo_meses").select("vendas, vendedoras").eq("mes", mes).maybeSingle();
    const antigasF = ((atual?.vendas ?? []) as Linha[]), antigasV = ((atual?.vendedoras ?? []) as Linha[]);
    const vendas = comNomesDoFluxo(ordenar(formas), antigasF, false);
    const vendedoras = comNomesDoFluxo(ordenar(vend), antigasV, true);
    // Mantém a ordem que já estava no Fluxo.
    const pos = (l: Linha[], nome: string) => { const i = l.findIndex((x) => x.nome === nome); return i < 0 ? 999 : i; };
    vendas.sort((a, b) => pos(antigasF, a.nome) - pos(antigasF, b.nome));
    vendedoras.sort((a, b) => pos(antigasV, a.nome) - pos(antigasV, b.nome));
    const { error } = atual
      ? await sb.from("fluxo_meses").update({ vendas, vendedoras, atualizado_em: new Date().toISOString() }).eq("mes", mes)
      : await sb.from("fluxo_meses").insert({ mes, vendas, vendedoras });
    if (error) throw new Error(`Fluxo: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  const corpo = await req.json().catch(() => ({})) as { origem?: string; desde?: string; ate?: string };
  const origem = corpo.origem ?? "cron";
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const hoje = hojeSP();
  const desde = corpo.desde && iso.test(corpo.desde) ? corpo.desde : somarDias(hoje, -1);
  const ate = corpo.ate && iso.test(corpo.ate) && corpo.ate <= hoje ? corpo.ate : hoje;

  // Evita rodar duas vezes seguidas (o botão e o horário ao mesmo tempo).
  if (!corpo.desde) {
    const { data: ult } = await sb.from("hera_sincronizacoes").select("inicio, ok").order("inicio", { ascending: false }).limit(1).maybeSingle();
    if (ult && Date.now() - new Date(ult.inicio).getTime() < 2 * 60e3) return Response.json({ ok: true, pulado: "rodou há menos de 2 minutos" });
  }

  const { data: reg } = await sb.from("hera_sincronizacoes").insert({ origem }).select("id").single();
  const fechar = (ok: boolean, erro: string | null, resumo: unknown) =>
    sb.from("hera_sincronizacoes").update({ fim: new Date().toISOString(), ok, erro, resumo }).eq("id", reg!.id);

  try {
    cookie = await sessao();
    let user = await api<{ lojas: { id: number; nome: string }[] }>("/api/user");
    if (!user?.lojas?.length) { cookie = await entrar(); user = await api<{ lojas: { id: number; nome: string }[] }>("/api/user"); }
    const lojas = (user?.lojas ?? []).map((l) => l.id);
    if (!lojas.length) throw new Error("Não achei as lojas no HeraDash.");

    const dias: string[] = [];
    for (let d = desde; d <= ate && dias.length < 120; d = somarDias(d, 1)) dias.push(d);
    const meses = [...new Set(dias.map((d) => `${d.slice(0, 7)}-01`))];

    const linhasDia = [];
    for (const loja of lojas) for (const d of dias) linhasDia.push(await puxarDia(loja, d));
    const linhasMes = [];
    for (const loja of lojas) for (const m of meses) linhasMes.push(await puxarMes(loja, m));

    const e1 = (await sb.from("hera_dias").upsert(linhasDia)).error;
    const e2 = (await sb.from("hera_meses").upsert(linhasMes)).error;
    if (e1 || e2) throw new Error((e1 ?? e2)!.message);
    // Só o mês corrente e o anterior (nas cargas de histórico o Fluxo antigo fica como está).
    const mesAtual = `${hoje.slice(0, 7)}-01`, mesAnterior = `${somarDias(mesAtual, -1).slice(0, 7)}-01`;
    await atualizarFluxo(meses.filter((m) => m === mesAtual || m === mesAnterior), hoje);

    const resumo = { lojas, dias: dias.length, meses: meses.length, hoje: linhasDia.filter((l) => l.data === hoje).map((l) => ({ loja: l.loja, faturamento: l.faturamento })) };
    await fechar(true, null, resumo);
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fechar(false, msg, null);
    return Response.json({ ok: false, erro: msg }, { status: e instanceof SemLogin ? 200 : 500 });
  }
});

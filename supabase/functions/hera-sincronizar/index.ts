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
  const email = Deno.env.get("HERA_EMAIL"), senha = Deno.env.get("HERA_SENHA");
  if (!email || !senha) throw new SemLogin("Falta cadastrar HERA_EMAIL e HERA_SENHA nos segredos das Edge Functions.");
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

    const resumo = { lojas, dias: dias.length, meses: meses.length, hoje: linhasDia.filter((l) => l.data === hoje).map((l) => ({ loja: l.loja, faturamento: l.faturamento })) };
    await fechar(true, null, resumo);
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fechar(false, msg, null);
    return Response.json({ ok: false, erro: msg }, { status: e instanceof SemLogin ? 200 : 500 });
  }
});

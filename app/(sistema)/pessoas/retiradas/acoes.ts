"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

const uuid = /^[0-9a-f-]{36}$/i;
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Só a administração mexe nas retiradas.";
  return m.replace(/^.*?ERROR:\s*/, "");
}
function atualizar() {
  revalidatePath("/pessoas/retiradas");
  revalidatePath("/pessoas/folha");
}

const Nova = z.object({
  pessoa_id: z.string().regex(uuid, "Escolha a pessoa."),
  data,
  itens: z.array(z.object({
    descricao: z.string().trim().min(1, "Toda peça precisa de descrição.").max(200),
    preco: z.number().finite().min(0), desconto: z.number().min(0).max(1).nullable(), liquido: z.number().finite().min(0),
  })).min(1, "Inclua pelo menos uma peça.").max(60),
  abatimentos: z.array(z.object({ descricao: z.string().trim().min(1, "Descreva o abatimento.").max(120), valor: z.number().finite().min(0) })).max(20),
  desconto_extra: z.number().min(0).max(1),
  total_combinado: z.number().finite().min(0).nullable(),
  observacao: z.string().max(1000),
  parcelas: z.number().int().min(0).max(24),
  primeiro_vencimento: data.nullable(),
});

/** Registra a retirada com peças, abatimentos e parcelas. */
export async function registrarRetirada(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(texto(dados, "dados")); } catch { return { erro: "Não consegui ler a retirada." }; }
  const lido = Nova.safeParse(bruto);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  if (lido.data.parcelas > 0 && !lido.data.primeiro_vencimento) return { erro: "Informe o vencimento da primeira parcela." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_retirada", { p: lido.data });
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  return { ok: "Retirada registrada." };
}

/** Cria as parcelas de uma retirada que ainda não tinha (ex.: a da Jéssica). */
export async function definirParcelas(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(texto(dados, "id")), n = Number(texto(dados, "parcelas")), venc = texto(dados, "primeiro_vencimento");
  const total = Number(texto(dados, "total"));
  if (!Number.isInteger(id) || !Number.isInteger(n) || n < 1 || n > 24) return { erro: "Número de parcelas: de 1 a 24." };
  if (!data.safeParse(venc).success) return { erro: "Informe o vencimento da primeira parcela." };
  if (!(total >= 0)) return { erro: "Total inválido." };
  const supabase = await supabaseServidor();
  const { count } = await supabase.from("retirada_parcelas").select("id", { count: "exact", head: true }).eq("retirada_id", id);
  if (count) return { erro: "Essa retirada já tem parcelas." };
  const parcela = Math.floor((total / n) * 100) / 100;
  const [a, m, d] = venc.split("-").map(Number);
  const linhas = Array.from({ length: n }, (_, i) => ({
    retirada_id: id, numero: i + 1, de: n,
    vencimento: new Date(Date.UTC(a, m - 1 + i, d)).toISOString().slice(0, 10),
    valor: i === n - 1 ? Math.round((total - parcela * (n - 1)) * 100) / 100 : parcela,
  }));
  const { error } = await supabase.from("retirada_parcelas").insert(linhas);
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  return { ok: `${n} ${n === 1 ? "parcela criada" : "parcelas criadas"}.` };
}

/** Marca a parcela como paga (por fora), perdoada ou volta para em aberto. */
export async function mudarParcela(dados: FormData) {
  const id = Number(texto(dados, "id")), situacao = texto(dados, "situacao");
  if (!Number.isInteger(id) || !["aberta", "paga", "perdoada"].includes(situacao)) return;
  const supabase = await supabaseServidor();
  const { data: p } = await supabase.from("retirada_parcelas").select("folha_mes").eq("id", id).maybeSingle();
  // Descontada numa folha: volta tirando o lançamento da folha (o banco reabre a parcela).
  if (p?.folha_mes) await supabase.from("folha_itens").delete().eq("parcela_id", id);
  await supabase.from("retirada_parcelas").update({ situacao, folha_mes: null }).eq("id", id);
  atualizar();
}

/** Na folha: desconta a parcela no recibo da pessoa. */
export async function descontarParcela(dados: FormData) {
  const id = Number(texto(dados, "id")), mes = texto(dados, "mes"), parte = texto(dados, "parte");
  if (!Number.isInteger(id) || !/^\d{4}-\d{2}-01$/.test(mes) || !["comissao", "vt"].includes(parte)) return;
  const supabase = await supabaseServidor();
  await supabase.rpc("descontar_parcela", { p_parcela: id, p_mes: mes, p_parte: parte });
  atualizar();
}

export async function excluirRetirada(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(texto(dados, "id"));
  if (!Number.isInteger(id)) return { erro: "Retirada inválida." };
  const supabase = await supabaseServidor();
  const { count } = await supabase.from("retirada_parcelas").select("id", { count: "exact", head: true }).eq("retirada_id", id).not("folha_mes", "is", null);
  if (count) return { erro: "Tem parcela descontada na folha. Desfaça na folha antes de excluir." };
  const { error } = await supabase.from("retiradas").delete().eq("id", id);
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  return { ok: "Retirada excluída." };
}

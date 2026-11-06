"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Seu perfil não pode lançar peças para fotos.";
  if (m.includes("Saldo insuficiente")) return m.replace(/^.*?Saldo insuficiente/, "Saldo insuficiente");
  return m.replace(/^.*?ERROR:\s*/, "");
}
function atualizar() {
  revalidatePath("/marketing");
  revalidatePath("/estoque/saldos");
  revalidatePath("/estoque/movimentacoes");
}

const Saida = z.object({
  evento: z.string().trim().min(1, "Diga qual é o evento ou a sessão de fotos.").max(120),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da sessão."),
  observacao: z.string().trim().max(500),
  itens: z.array(z.object({
    peca: z.string().trim().min(1, "Toda peça precisa de nome.").max(120), cor: z.string().trim().max(60), tamanho: z.string().trim().max(20),
    quantidade: z.number().int().min(1).max(500),
  })).min(1, "Coloque pelo menos uma peça."),
});

/** Saída para fotos: cria a sessão (evento + data) com as peças digitadas. Não mexe no estoque. */
export async function registrarSaida(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("dados") ?? "")); } catch { return { erro: "Não consegui ler a saída." }; }
  const lido = Saida.safeParse(bruto);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_sessao_fotos", { p: lido.data });
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  const total = lido.data.itens.reduce((t, i) => t + i.quantidade, 0);
  return { ok: `${total} ${total === 1 ? "peça saiu" : "peças saíram"} para ${lido.data.evento}.` };
}

/** Situação de uma peça: com ela, devolvido (volta à Loja) ou deu (sai do estoque). */
export async function mudarItem(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(dados.get("id"));
  const situacao = String(dados.get("situacao") ?? "");
  const obs = String(dados.get("observacao") ?? "").trim() || null;
  if (!Number.isInteger(id) || !["com_ela", "devolvendo", "doando", "devolvido", "deu"].includes(situacao)) return { erro: "Situação inválida." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("mudar_item_fotos", { p_item: id, p_situacao: situacao, p_obs: obs });
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  const ok: Record<string, string> = { devolvendo: "Devolução avisada.", doando: "Doação avisada.", devolvido: "Devolução confirmada.", deu: "Doação confirmada.", com_ela: "Voltou para com ela." };
  return { ok: ok[situacao] };
}

/** Exclui uma peça ou uma sessão inteira (só a administração). Sessão sem peças some junto. */
export async function excluirFotos(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const item = Number(dados.get("item") ?? NaN);
  const sessao = Number(dados.get("sessao") ?? NaN);
  const supabase = await supabaseServidor();
  if (Number.isInteger(item)) {
    const { data, error } = await supabase.from("fotos_itens").delete().eq("id", item).select("sessao_id");
    if (error) return { erro: mensagem(error.message) };
    if (!data?.length) return { erro: "Só a administração pode excluir." };
    const sid = data[0].sessao_id as number;
    const { count } = await supabase.from("fotos_itens").select("id", { count: "exact", head: true }).eq("sessao_id", sid);
    if (!count) await supabase.from("fotos_sessoes").delete().eq("id", sid);
    atualizar();
    return { ok: "Peça excluída." };
  }
  if (Number.isInteger(sessao)) {
    const { data, error } = await supabase.from("fotos_sessoes").delete().eq("id", sessao).select("id");
    if (error) return { erro: mensagem(error.message) };
    if (!data?.length) return { erro: "Só a administração pode excluir." };
    atualizar();
    return { ok: "Sessão excluída." };
  }
  return { erro: "Nada para excluir." };
}

/** Corrige nome, cor, tamanho ou quantidade de uma peça (quem lança pode). */
export async function editarItem(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(dados.get("id"));
  const peca = String(dados.get("peca") ?? "").trim();
  const cor = String(dados.get("cor") ?? "").trim() || null;
  const tamanho = String(dados.get("tamanho") ?? "").trim().toUpperCase() || null;
  const quantidade = Math.floor(Number(dados.get("quantidade")));
  if (!Number.isInteger(id)) return { erro: "Peça inválida." };
  if (!peca) return { erro: "A peça precisa de nome." };
  if (!(quantidade >= 1 && quantidade <= 500)) return { erro: "Quantidade inválida." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.from("fotos_itens").update({ peca, cor, tamanho, quantidade, atualizado_em: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { erro: mensagem(error.message) };
  if (!data?.length) return { erro: "Seu perfil não pode editar." };
  atualizar();
  return { ok: "Peça atualizada." };
}

/** Corrige o evento, a data ou a anotação da sessão. */
export async function editarSessao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(dados.get("id"));
  const evento = String(dados.get("evento") ?? "").trim();
  const data = String(dados.get("data") ?? "");
  const observacao = String(dados.get("observacao") ?? "").trim() || null;
  if (!Number.isInteger(id)) return { erro: "Sessão inválida." };
  if (!evento) return { erro: "Informe o evento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data." };
  const supabase = await supabaseServidor();
  const { data: r, error } = await supabase.from("fotos_sessoes").update({ evento, data, observacao }).eq("id", id).select("id");
  if (error) return { erro: mensagem(error.message) };
  if (!r?.length) return { erro: "Seu perfil não pode editar." };
  atualizar();
  return { ok: "Sessão atualizada." };
}

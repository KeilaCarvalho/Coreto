"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
function mensagem(m: string) {
  if (m.includes("row-level security")) return "Seu perfil não pode lançar peças para fotos.";
  if (m.includes("Saldo insuficiente")) return m.replace(/^.*?Saldo insuficiente/, "Saldo insuficiente");
  return m;
}
function atualizar() {
  revalidatePath("/marketing");
  revalidatePath("/estoque/saldos");
  revalidatePath("/estoque/movimentacoes");
}
async function localMarketing() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("locais_estoque").select("id").eq("tipo", "marketing").is("arquivado_em", null).limit(1).maybeSingle();
  return { supabase, marketing: data?.id as string | undefined };
}

const Saida = z.object({
  origem: uuid,
  para: z.string().trim().min(1, "Diga para quê ou com quem as peças foram.").max(120),
  observacao: z.string().trim().max(500),
  itens: z.array(z.object({ variante_id: uuid, quantidade: z.number().int().min(1).max(500) })).min(1, "Escolha pelo menos uma peça."),
});

/** Saída de peças para fotos: sai do local escolhido e fica no local Marketing. */
export async function registrarSaida(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("dados") ?? "")); } catch { return { erro: "Não consegui ler a saída." }; }
  const lido = Saida.safeParse(bruto);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const { supabase, marketing } = await localMarketing();
  if (!marketing) return { erro: "Falta o local Marketing no estoque." };
  const obs = [lido.data.para, lido.data.observacao].filter(Boolean).join(" · ");
  const { error } = await supabase.from("movimentacoes_estoque").insert(lido.data.itens.map((i) => ({
    tipo: "emprestimo_marketing", variante_id: i.variante_id, quantidade: i.quantidade,
    local_origem_id: lido.data.origem, local_destino_id: marketing, observacao: obs,
  })));
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  const total = lido.data.itens.reduce((t, i) => t + i.quantidade, 0);
  return { ok: `${total} ${total === 1 ? "peça registrada" : "peças registradas"} saindo para fotos.` };
}

/** Devolução das fotos: volta do Marketing para o local escolhido. "brinde" = ficou com alguém (sai do estoque). */
export async function devolverPecas(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const variante = String(dados.get("variante_id") ?? "");
  const quantidade = Number(dados.get("quantidade"));
  const destino = String(dados.get("destino") ?? "");
  const obs = String(dados.get("observacao") ?? "").trim() || null;
  if (!uuid.safeParse(variante).success) return { erro: "Peça inválida." };
  if (!Number.isInteger(quantidade) || quantidade < 1) return { erro: "Quantidade inválida." };
  const { supabase, marketing } = await localMarketing();
  if (!marketing) return { erro: "Falta o local Marketing no estoque." };
  const brinde = destino === "brinde";
  if (brinde && !obs) return { erro: "Diga com quem a peça ficou (influencer, permuta…)." };
  if (!brinde && !uuid.safeParse(destino).success) return { erro: "Escolha para onde a peça volta." };
  const { error } = await supabase.from("movimentacoes_estoque").insert({
    tipo: brinde ? "brinde" : "devolucao_marketing", variante_id: variante, quantidade,
    local_origem_id: marketing, local_destino_id: brinde ? null : destino, observacao: obs,
  });
  if (error) return { erro: mensagem(error.message) };
  atualizar();
  return { ok: brinde ? "Registrado como brinde/permuta." : `${quantidade} ${quantidade === 1 ? "peça devolvida" : "peças devolvidas"}.` };
}

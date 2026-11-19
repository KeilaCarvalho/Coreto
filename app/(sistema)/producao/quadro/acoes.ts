"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";

type Resposta = { ok: true; id?: string } | { ok: false; erro: string };
const msg = (m: string) => (m.includes("row-level security") ? "Seu perfil não pode mexer no quadro." : m.replace(/^.*?ERROR:\s*/, ""));

const Op = z.object({
  id: z.string().uuid().optional(),
  numero: z.number().int().min(0).max(999999).nullable(),
  titulo: z.string().trim().min(1, "Escreva o modelo.").max(160),
  tecido: z.string().trim().max(80).nullable(),
  faccao: z.string().trim().max(80).nullable(),
  quantidade: z.number().int().min(0).max(100000).nullable(),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  etiqueta: z.string().max(20).nullable(),
  observacao: z.string().trim().max(2000).nullable(),
  coluna_id: z.string().min(1).max(40),
});

/** Cria ou edita uma OP. Cartão novo entra no fim da coluna. */
export async function salvarOp(dados: unknown): Promise<Resposta> {
  const lido = Op.safeParse(dados);
  if (!lido.success) return { ok: false, erro: lido.error.issues[0].message };
  const { id, ...op } = lido.data;
  const sb = await supabaseServidor();
  if (id) {
    const { coluna_id, ...resto } = op;
    void coluna_id;
    const { error } = await sb.from("producao_ops").update({ ...resto, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, erro: msg(error.message) };
    revalidatePath("/producao/quadro");
    return { ok: true, id };
  }
  const { data: ultimo } = await sb.from("producao_ops").select("ordem").eq("coluna_id", op.coluna_id).is("arquivado_em", null).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("producao_ops").insert({ ...op, ordem: (ultimo?.ordem ?? 0) + 1000 }).select("id").single();
  if (error) return { ok: false, erro: msg(error.message) };
  revalidatePath("/producao/quadro");
  return { ok: true, id: data.id };
}

/** Move o cartão para outra coluna ou posição. */
export async function moverOp(id: string, coluna: string, ordem: number): Promise<Resposta> {
  const sb = await supabaseServidor();
  const { error } = await sb.rpc("mover_op", { p_op: id, p_coluna: coluna, p_ordem: ordem });
  if (error) return { ok: false, erro: msg(error.message) };
  revalidatePath("/producao/quadro");
  return { ok: true };
}

/** Arquiva (tira do quadro sem apagar). */
export async function arquivarOp(id: string): Promise<Resposta> {
  const sb = await supabaseServidor();
  const { error } = await sb.from("producao_ops").update({ arquivado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, erro: msg(error.message) };
  revalidatePath("/producao/quadro");
  return { ok: true };
}

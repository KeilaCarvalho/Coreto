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

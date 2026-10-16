"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { LANCAMENTOS_MANUAIS } from "@/lib/estoque";
import type { EstadoAcao } from "@/components/form-acao";

function mensagemBanco(mensagem: string) {
  if (mensagem.includes("row-level security")) return "Seu perfil não pode registrar esse tipo de movimentação.";
  if (mensagem.includes("estorno_de_key")) return "Essa movimentação já foi estornada.";
  return mensagem;
}

export async function lancarMovimentacao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const tipo = String(dados.get("tipo") ?? "");
  const regra = LANCAMENTOS_MANUAIS.find((l) => l.tipo === tipo);
  if (!regra) return { erro: "Escolha o tipo de lançamento." };
  const codigo = String(dados.get("codigo") ?? "").trim().toUpperCase();
  const quantidade = Number(dados.get("quantidade"));
  const origem = String(dados.get("local_origem_id") ?? "") || null;
  const destino = String(dados.get("local_destino_id") ?? "") || null;
  const observacao = String(dados.get("observacao") ?? "").trim() || null;

  if (!codigo) return { erro: "Informe o SKU ou leia o código de barras." };
  if (!Number.isInteger(quantidade) || quantidade <= 0) return { erro: "A quantidade precisa ser um número inteiro maior que zero." };
  if (regra.origem && !origem) return { erro: "Escolha o local de onde as peças saem." };
  if (regra.destino && !destino) return { erro: "Escolha o local para onde as peças vão." };
  if (origem && destino && origem === destino) return { erro: "Origem e destino precisam ser diferentes." };
  if ((tipo.startsWith("ajuste") || tipo === "perda") && !observacao) return { erro: "Explique o motivo do ajuste ou da perda na observação." };

  const supabase = await supabaseServidor();
  const { data: variante } = await supabase.from("variantes").select("id, sku, ativa").or(`sku.eq.${codigo},codigo_barras.eq.${codigo}`).maybeSingle();
  if (!variante) return { erro: `Nenhuma variante com o código ${codigo}.` };
  if (!variante.ativa && regra.destino && !regra.origem) return { erro: `A variante ${variante.sku} está desativada.` };

  const { error } = await supabase.from("movimentacoes_estoque").insert({
    tipo, variante_id: variante.id, quantidade,
    local_origem_id: regra.origem ? origem : null,
    local_destino_id: regra.destino ? destino : null,
    observacao,
  });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque/saldos");
  return { ok: `${quantidade} ${quantidade === 1 ? "peça" : "peças"} de ${variante.sku} registradas.` };
}

export async function estornar(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = Number(dados.get("id"));
  const motivo = String(dados.get("motivo") ?? "").trim();
  if (!motivo) return { erro: "Informe o motivo do estorno." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("estornar_movimentacao", { p_id: id, p_motivo: motivo });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque/saldos");
  return { ok: "Movimentação estornada." };
}

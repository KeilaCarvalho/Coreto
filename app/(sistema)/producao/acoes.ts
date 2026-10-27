"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { lerGrade } from "@/lib/grade";
import type { EstadoAcao } from "@/components/form-acao";

const uuid = /^[0-9a-f-]{36}$/i;

function mensagemBanco(mensagem: string) {
  if (mensagem.includes("row-level security")) return "Seu perfil não pode fazer essa operação.";
  return mensagem.replace(/^.*?ERROR:\s*/, "");
}

function atualizar(id?: string) {
  revalidatePath("/producao/recebimentos");
  if (id) revalidatePath(`/producao/recebimentos/${id}`);
  revalidatePath("/estoque/saldos");
  revalidatePath("/");
}

export async function registrarRecebimento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const produto = String(dados.get("produto_id") ?? "");
  let parceiro = String(dados.get("parceiro_id") ?? "") || null;
  const data = String(dados.get("recebido_em") ?? "") || null;
  const observacao = String(dados.get("observacao") ?? "").trim() || null;
  if (!uuid.test(produto)) return { erro: "Escolha o modelo." };
  const grade = lerGrade(dados);
  if ("erro" in grade) return { erro: grade.erro };
  if (!grade.itens.length) return { erro: "Informe a quantidade de pelo menos uma cor e tamanho." };

  const supabase = await supabaseServidor();
  if (parceiro === "nova") {
    const nome = String(dados.get("faccao_nova") ?? "").trim();
    if (!nome) return { erro: "Digite o nome da facção nova." };
    const { data: criada, error: erroFaccao } = await supabase.from("parceiros").insert({ tipo: "faccao", nome }).select("id").single();
    if (erroFaccao) return { erro: erroFaccao.message.includes("row-level security") ? "Seu perfil não pode cadastrar facções. Peça para quem cuida dos cadastros." : mensagemBanco(erroFaccao.message) };
    parceiro = criada.id as string;
  } else if (parceiro && !uuid.test(parceiro)) return { erro: "Facção inválida." };
  const { data: id, error } = await supabase.rpc("registrar_recebimento", {
    p_recebimento: null, p_produto: produto, p_parceiro: parceiro, p_data: data, p_observacao: observacao, p_itens: grade.itens,
  });
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar();
  redirect(`/producao/recebimentos/${id}?registrado=1`);
}

export async function complementarRecebimento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const grade = lerGrade(dados);
  if ("erro" in grade) return { erro: grade.erro };
  if (!grade.itens.length) return { erro: "Informe as peças que chegaram." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_recebimento", {
    p_recebimento: id, p_produto: null, p_parceiro: null, p_data: null, p_observacao: null, p_itens: grade.itens,
  });
  if (error) return { erro: mensagemBanco(error.message) };
  const total = grade.itens.reduce((t, i) => t + i.quantidade, 0);
  atualizar(id);
  return { ok: `${total} ${total === 1 ? "peça somada" : "peças somadas"} ao lote.` };
}

export async function liberarRecebimento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const destino = String(dados.get("destino_id") ?? "");
  if (!uuid.test(destino)) return { erro: "Escolha para onde as peças vão." };
  const grade = lerGrade(dados);
  if ("erro" in grade) return { erro: grade.erro };
  if (!grade.itens.length) return { erro: "Informe quantas peças liberar." };
  const supabase = await supabaseServidor();
  const { data: total, error } = await supabase.rpc("liberar_recebimento", { p_recebimento: id, p_destino: destino, p_itens: grade.itens });
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar(id);
  return { ok: `${total} ${total === 1 ? "peça liberada" : "peças liberadas"} para venda.` };
}

export async function salvarPendencia(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const pendente = dados.get("pendente") === "1";
  const pendencia = String(dados.get("pendencia") ?? "").trim() || null;
  if (pendente && !pendencia) return { erro: "Escreva o que faltou para lembrar depois." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("recebimentos").update(pendente ? { pendente, pendencia } : { pendente }).eq("id", id);
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar(id);
  return { ok: pendente ? "Lote marcado como pendente." : "Pendência resolvida." };
}

export async function salvarObservacao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const observacao = String(dados.get("observacao") ?? "").trim().slice(0, 500) || null;
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("recebimentos").update({ observacao }).eq("id", id);
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar(id);
  return { ok: observacao ? "Observação salva." : "Observação apagada." };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { lerValor } from "@/lib/formatos";
import type { EstadoAcao } from "@/components/form-acao";

const opcional = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);

const Produto = z.object({
  referencia: z.string().trim().min(1, "Informe a referência.").max(30).regex(/^[A-Za-z0-9-]+$/, "A referência aceita só letras, números e hífen."),
  nome: z.string().trim().min(2, "Informe o nome do produto."),
  grade_id: z.string().uuid("Escolha a grade de tamanhos."),
  categoria_id: z.string().uuid().nullable(),
  colecao_id: z.string().uuid().nullable(),
  preco_venda: z.number().nonnegative("O preço não pode ser negativo.").nullable(),
  custo_previsto: z.number().nonnegative("O custo não pode ser negativo.").nullable(),
  ncm: z.string().regex(/^\d{8}$/, "O NCM tem 8 números.").nullable(),
  descricao: z.string().nullable(),
});

function lerProduto(dados: FormData) {
  return Produto.safeParse({
    referencia: String(dados.get("referencia") ?? "").toUpperCase(),
    nome: String(dados.get("nome") ?? ""),
    grade_id: String(dados.get("grade_id") ?? ""),
    categoria_id: opcional(dados.get("categoria_id")),
    colecao_id: opcional(dados.get("colecao_id")),
    preco_venda: lerValor(dados.get("preco_venda")),
    custo_previsto: lerValor(dados.get("custo_previsto")),
    ncm: opcional(dados.get("ncm"))?.replace(/\D/g, "") || null,
    descricao: opcional(dados.get("descricao")),
  });
}

function mensagemBanco(mensagem: string) {
  if (mensagem.includes("produtos_referencia_unica")) return "Já existe um produto com essa referência.";
  if (mensagem.includes("row-level security")) return "Seu perfil não pode fazer essa alteração.";
  return "Não foi possível salvar: " + mensagem;
}

export async function criarProduto(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const lido = lerProduto(dados);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const cores = dados.getAll("cores").map(String).filter(Boolean);
  if (!cores.length) return { erro: "Escolha pelo menos uma cor." };

  const supabase = await supabaseServidor();
  const { data: produto, error } = await supabase.from("produtos").insert(lido.data).select("id").single();
  if (error) return { erro: mensagemBanco(error.message) };

  const { error: erroCores } = await supabase.from("produto_cores").insert(cores.map((cor_id) => ({ produto_id: produto.id, cor_id })));
  if (erroCores) return { erro: mensagemBanco(erroCores.message) };
  const { error: erroGrade } = await supabase.rpc("gerar_variantes", { p_produto_id: produto.id });
  if (erroGrade) return { erro: mensagemBanco(erroGrade.message) };

  revalidatePath("/produto/catalogo");
  redirect(`/produto/catalogo/${produto.id}?criado=1`);
}

export async function salvarProduto(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const lido = lerProduto(dados);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const supabase = await supabaseServidor();
  // A grade não muda depois de criada: as variantes já existem com aqueles tamanhos.
  const { grade_id: _grade, ...campos } = lido.data;
  const { error } = await supabase.from("produtos").update(campos).eq("id", id);
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath(`/produto/catalogo/${id}`);
  return { ok: "Produto salvo." };
}

export async function salvarCoresDoProduto(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  const escolhidas = new Set(dados.getAll("cores").map(String));
  if (!escolhidas.size) return { erro: "O produto precisa de pelo menos uma cor." };
  const supabase = await supabaseServidor();
  const { data: atuais, error } = await supabase.from("produto_cores").select("cor_id").eq("produto_id", id);
  if (error) return { erro: mensagemBanco(error.message) };
  const jaTem = new Set((atuais ?? []).map((c) => c.cor_id as string));
  const incluir = [...escolhidas].filter((c) => !jaTem.has(c));
  const retirar = [...jaTem].filter((c) => !escolhidas.has(c));
  if (incluir.length) {
    const { error: e } = await supabase.from("produto_cores").insert(incluir.map((cor_id) => ({ produto_id: id, cor_id })));
    if (e) return { erro: mensagemBanco(e.message) };
  }
  if (retirar.length) {
    const { error: e } = await supabase.from("produto_cores").delete().eq("produto_id", id).in("cor_id", retirar);
    if (e) return { erro: mensagemBanco(e.message) };
  }
  const { data: criadas, error: e } = await supabase.rpc("gerar_variantes", { p_produto_id: id });
  if (e) return { erro: mensagemBanco(e.message) };
  revalidatePath(`/produto/catalogo/${id}`);
  const partes = [criadas ? `${criadas} variantes criadas` : null, retirar.length ? `${retirar.length} cor(es) desativada(s)` : null].filter(Boolean);
  return { ok: partes.length ? `Grade atualizada: ${partes.join(", ")}.` : "Nada mudou na grade." };
}

export async function arquivarProduto(dados: FormData) {
  const id = String(dados.get("id") ?? "");
  const arquivar = dados.get("arquivar") === "1";
  const supabase = await supabaseServidor();
  await supabase.from("produtos").update({ arquivado_em: arquivar ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/produto/catalogo");
  revalidatePath(`/produto/catalogo/${id}`);
}

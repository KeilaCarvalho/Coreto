"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const ouNulo = (v: string) => v || null;

function mensagemBanco(mensagem: string) {
  if (mensagem.includes("row-level security")) return "Seu perfil não pode fazer essa alteração.";
  if (mensagem.includes("duplicate key") || mensagem.includes("_unico") || mensagem.includes("_key")) return "Já existe um cadastro com esse nome ou código.";
  return mensagem;
}

/* ---------- Acessos ---------- */
export async function salvarAcesso(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = texto(dados, "id");
  const perfil = ouNulo(texto(dados, "perfil_id"));
  const ativo = dados.get("acesso_ativo") === "on";
  if (ativo && !perfil) return { erro: "Escolha um perfil antes de liberar o acesso." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("pessoas").update({ perfil_id: perfil, acesso_ativo: ativo }).eq("id", id);
  if (error) return { erro: error.message.includes("administrador") ? error.message : mensagemBanco(error.message) };
  revalidatePath("/configuracoes/acessos");
  return { ok: ativo ? "Acesso liberado." : "Acesso salvo como bloqueado." };
}

export async function preCadastrarAcesso(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nome = texto(dados, "nome");
  const email = texto(dados, "email").toLowerCase();
  const perfil = texto(dados, "perfil_id");
  if (!nome || !z.string().email().safeParse(email).success) return { erro: "Informe nome e um e-mail válido." };
  if (!perfil) return { erro: "Escolha o perfil." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("pessoas").insert({ nome, email, perfil_id: perfil, acesso_ativo: true, e_vendedora: perfil === "vendedora" });
  if (error) return { erro: error.message.includes("email") ? "Esse e-mail já está cadastrado." : mensagemBanco(error.message) };
  revalidatePath("/configuracoes/acessos");
  return { ok: `${nome} pode criar o login com ${email}. O perfil é aplicado automaticamente.` };
}

/* ---------- Cadastros auxiliares ---------- */
export async function criarCor(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nome = texto(dados, "nome");
  const codigo = texto(dados, "codigo").toUpperCase();
  const hex = texto(dados, "hex");
  if (!nome) return { erro: "Informe o nome da cor." };
  if (codigo && !/^[A-Z0-9]{2,4}$/.test(codigo)) return { erro: "O código da cor tem de 2 a 4 letras ou números." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("cores").insert({ nome, codigo: ouNulo(codigo), hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : null });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/configuracoes/cadastros");
  return { ok: `Cor ${nome} cadastrada.` };
}

export async function criarSimples(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const tabela = texto(dados, "tabela");
  if (tabela !== "categorias" && tabela !== "colecoes") return { erro: "Cadastro inválido." };
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome." };
  const registro: Record<string, string | null> = { nome };
  if (tabela === "categorias") registro.ncm = ouNulo(texto(dados, "ncm").replace(/\D/g, ""));
  if (tabela === "colecoes") registro.lancamento = ouNulo(texto(dados, "lancamento"));
  const supabase = await supabaseServidor();
  const { error } = await supabase.from(tabela).insert(registro);
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/configuracoes/cadastros");
  return { ok: `${nome} cadastrado.` };
}

export async function criarGrade(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nome = texto(dados, "nome");
  const tamanhos = texto(dados, "tamanhos").split(/[,;\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!nome) return { erro: "Informe o nome da grade." };
  if (!tamanhos.length) return { erro: "Informe os tamanhos, separados por vírgula." };
  if (new Set(tamanhos).size !== tamanhos.length) return { erro: "Há tamanhos repetidos." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.from("grades").insert({ nome }).select("id").single();
  if (error) return { erro: mensagemBanco(error.message) };
  const { error: e } = await supabase.from("grade_tamanhos").insert(tamanhos.map((tamanho, i) => ({ grade_id: data.id, tamanho, ordem: i + 1 })));
  if (e) return { erro: mensagemBanco(e.message) };
  revalidatePath("/configuracoes/cadastros");
  return { ok: `Grade ${nome} criada com ${tamanhos.length} tamanhos.` };
}

/* ---------- Parceiros ---------- */
export async function criarParceiro(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const tipo = texto(dados, "tipo");
  const nome = texto(dados, "nome");
  if (!["faccao", "cortador", "fornecedor", "fotografo", "modelo", "influenciadora", "outro"].includes(tipo)) return { erro: "Escolha o tipo de parceiro." };
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("parceiros").insert({
    tipo, nome,
    documento: ouNulo(texto(dados, "documento")), contato: ouNulo(texto(dados, "contato")),
    telefone: ouNulo(texto(dados, "telefone")), email: ouNulo(texto(dados, "email").toLowerCase()),
    cidade: ouNulo(texto(dados, "cidade")), pix: ouNulo(texto(dados, "pix")), observacao: ouNulo(texto(dados, "observacao")),
  });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/configuracoes/parceiros");
  return { ok: tipo === "faccao" ? `${nome} cadastrada. O local de estoque da facção foi criado.` : `${nome} cadastrado.` };
}

/* ---------- Equipe ---------- */
export async function criarPessoa(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("pessoas").insert({
    nome, apelido: ouNulo(texto(dados, "apelido")), cargo: ouNulo(texto(dados, "cargo")),
    telefone: ouNulo(texto(dados, "telefone")), e_vendedora: dados.get("e_vendedora") === "on", e_funcionaria: true,
  });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/pessoas/equipe");
  return { ok: `${nome} adicionada à equipe.` };
}

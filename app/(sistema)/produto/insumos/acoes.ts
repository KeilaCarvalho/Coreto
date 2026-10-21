"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EstadoAcao } from "@/components/form-acao";

const Item = z.object({
  nome: z.string().trim().min(1, "Todo item precisa de um nome.").max(120),
  tipo: z.enum(["tecido", "aviamento", "outro"]),
  unidade: z.string().trim().max(10),
  quantidade: z.number().positive("A quantidade precisa ser maior que zero."),
  valor_unitario: z.number().min(0, "O valor não pode ser negativo."),
});
const Nota = z.object({
  sem_nota: z.boolean(),
  numero: z.string().trim().max(40),
  fornecedor: z.string().trim().max(120),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da nota."),
  observacao: z.string().max(500),
  itens: z.array(Item).min(1, "Informe pelo menos um item da nota.").max(100),
});

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Seu perfil não pode lançar notas.";
  return m.replace(/^.*?ERROR:\s*/, "");
}

export async function registrarNota(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("nota") ?? "")); } catch { return { erro: "Não consegui ler a nota." }; }
  const lido = Nota.safeParse(bruto);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const n = lido.data;
  if (!n.sem_nota && !n.fornecedor) return { erro: "Informe o fornecedor da nota." };
  const supabase = await supabaseServidor();

  // PDF ou foto da nota: vai para o Storage antes de lançar.
  let caminho: string | null = null;
  const arquivo = dados.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > 10 * 1024 * 1024) return { erro: "O arquivo passa de 10 MB. Tire a foto com menos zoom ou mande o PDF." };
    const tipo = arquivo.type || "application/octet-stream";
    if (!/^(application\/pdf|image\/(jpeg|png|webp|heic))$/.test(tipo)) return { erro: "Mande a nota em PDF ou foto (JPG ou PNG)." };
    const ext = tipo === "application/pdf" ? "pdf" : tipo.split("/")[1].replace("jpeg", "jpg");
    caminho = `${n.data.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error: erroArquivo } = await supabase.storage.from("notas").upload(caminho, arquivo, { contentType: tipo });
    if (erroArquivo) return { erro: "Não consegui guardar o arquivo da nota: " + erroArquivo.message };
  }

  const { error } = await supabase.rpc("registrar_nota_compra", {
    p_nota: { numero: n.numero, fornecedor: n.fornecedor, data: n.data, observacao: n.observacao, sem_nota: n.sem_nota, arquivo: caminho },
    p_itens: n.itens,
  });
  if (error) {
    if (caminho) await supabase.storage.from("notas").remove([caminho]);
    return { erro: mensagem(error.message) };
  }
  revalidatePath("/produto/insumos");
  revalidatePath("/produto/precificacao");
  const qtd = `${n.itens.length} ${n.itens.length === 1 ? "item" : "itens"}`;
  return { ok: n.sem_nota ? `Preço salvo: ${qtd} sem nota.` : `Nota${n.numero ? ` nº ${n.numero}` : ""} lançada: ${qtd} com preço salvo.` };
}

export async function excluirNota(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "Nota inválida." };
  const supabase = await supabaseServidor();
  const { data: nota } = await supabase.from("notas_compra").select("arquivo").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("excluir_nota_compra", { p_nota: id });
  if (error) return { erro: mensagem(error.message) };
  if (nota?.arquivo) await supabase.storage.from("notas").remove([nota.arquivo]);
  revalidatePath("/produto/insumos");
  return { ok: "Nota apagada. Os preços voltaram para os da nota anterior." };
}

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const uuid = /^[0-9a-f-]{36}$/i;

/** Corrige uma nota lançada: dados da nota, itens e preços. Os preços dos itens afetados são recalculados. */
export async function editarNota(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!uuid.test(id)) return { erro: "Nota inválida." };
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("nota") ?? "")); } catch { return { erro: "Não consegui ler a nota." }; }
  const lido = Nota.safeParse(bruto);
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const n = lido.data;
  if (!n.sem_nota && !n.fornecedor) return { erro: "Informe o fornecedor da nota." };
  if (n.data > hojeSP()) return { erro: "A data da nota não pode ser no futuro." };
  const supabase = await supabaseServidor();

  const { data: atual } = await supabase.from("notas_compra").select("arquivo").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Nota não encontrada." };

  // Arquivo novo (opcional): troca o anterior.
  let caminho: string | null = null;
  const arquivo = dados.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > 10 * 1024 * 1024) return { erro: "O arquivo passa de 10 MB." };
    const tipo = arquivo.type || "application/octet-stream";
    if (!/^(application\/pdf|image\/(jpeg|png|webp|heic))$/.test(tipo)) return { erro: "Mande a nota em PDF ou foto (JPG ou PNG)." };
    caminho = `${n.data.slice(0, 7)}/${crypto.randomUUID()}.${tipo === "application/pdf" ? "pdf" : tipo.split("/")[1].replace("jpeg", "jpg")}`;
    const { error } = await supabase.storage.from("notas").upload(caminho, arquivo, { contentType: tipo });
    if (error) return { erro: "Não consegui guardar o arquivo da nota: " + error.message };
  }

  // Insumos: reaproveita pelo nome (sem diferenciar maiúsculas) ou cria.
  const { data: existentes } = await supabase.from("insumos").select("id, nome").is("arquivado_em", null);
  const porNome = new Map((existentes ?? []).map((i) => [i.nome.trim().toLowerCase(), i.id as string]));
  const novosItens: { nota_id: string; ordem: number; insumo_id: string; quantidade: number; unidade: string | null; valor_unitario: number }[] = [];
  for (const [k, item] of n.itens.entries()) {
    let insumo = porNome.get(item.nome.toLowerCase());
    if (!insumo) {
      const { data: criado, error } = await supabase.from("insumos").insert({ nome: item.nome, tipo: item.tipo, unidade: item.unidade || "un" }).select("id").single();
      if (error) return { erro: mensagem(error.message) };
      insumo = criado.id as string;
      porNome.set(item.nome.toLowerCase(), insumo);
    }
    novosItens.push({ nota_id: id, ordem: k + 1, insumo_id: insumo, quantidade: item.quantidade, unidade: item.unidade || null, valor_unitario: item.valor_unitario });
  }

  const { data: antigos } = await supabase.from("nota_compra_itens").select("id, insumo_id").eq("nota_id", id);
  const { error: erroNota } = await supabase.from("notas_compra").update({
    numero: n.sem_nota ? null : n.numero || null, fornecedor: n.fornecedor || null, emitida_em: n.data, observacao: n.observacao.trim() || null,
    sem_nota: n.sem_nota, valor_total: Math.round(n.itens.reduce((t, i) => t + i.quantidade * i.valor_unitario, 0) * 100) / 100,
    ...(caminho ? { arquivo: caminho } : {}),
  }).eq("id", id);
  if (erroNota) return { erro: mensagem(erroNota.message) };
  const { error: erroInserir } = await supabase.from("nota_compra_itens").insert(novosItens);
  if (erroInserir) return { erro: mensagem(erroInserir.message) };
  const idsAntigos = (antigos ?? []).map((a) => a.id as string);
  if (idsAntigos.length) {
    const { error } = await supabase.from("nota_compra_itens").delete().in("id", idsAntigos);
    if (error) return { erro: mensagem(error.message) };
  }
  const afetados = new Set([...(antigos ?? []).map((a) => a.insumo_id as string), ...novosItens.map((i) => i.insumo_id)]);
  for (const ins of afetados) await supabase.rpc("recalcular_insumo", { p_insumo: ins });
  if (caminho && atual.arquivo) await supabase.storage.from("notas").remove([atual.arquivo]);

  revalidatePath("/produto/insumos");
  revalidatePath("/produto/precificacao");
  return { ok: "Lançamento corrigido. Os preços dos itens foram atualizados." };
}

const InsumoEdicao = z.object({
  nome: z.string().trim().min(1, "Informe o nome do item.").max(120),
  tipo: z.enum(["tecido", "aviamento", "outro"]),
  unidade: z.string().trim().min(1, "Informe a unidade.").max(10),
});

/** Corrige nome, tipo ou unidade de um item. */
export async function editarInsumo(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!uuid.test(id)) return { erro: "Item inválido." };
  const lido = InsumoEdicao.safeParse({ nome: dados.get("nome"), tipo: dados.get("tipo"), unidade: dados.get("unidade") });
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.from("insumos").update(lido.data).eq("id", id).select("id");
  if (error) return { erro: error.message.includes("insumos_nome_unico") ? "Já existe outro item com esse nome." : mensagem(error.message) };
  if (!data?.length) return { erro: "Seu perfil não pode editar itens." };
  revalidatePath("/produto/insumos");
  revalidatePath("/produto/precificacao");
  return { ok: `Item “${lido.data.nome}” salvo.` };
}

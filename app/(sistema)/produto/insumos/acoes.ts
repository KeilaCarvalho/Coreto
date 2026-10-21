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

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
  numero: z.string().trim().max(40),
  fornecedor: z.string().trim().min(1, "Informe o fornecedor.").max(120),
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
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_nota_compra", {
    p_numero: n.numero, p_fornecedor: n.fornecedor, p_data: n.data, p_observacao: n.observacao, p_itens: n.itens,
  });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath("/produto/insumos");
  revalidatePath("/produto/precificacao");
  return { ok: `Nota${n.numero ? ` nº ${n.numero}` : ""} lançada: ${n.itens.length} ${n.itens.length === 1 ? "item" : "itens"} com preço salvo.` };
}

export async function excluirNota(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "Nota inválida." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("excluir_nota_compra", { p_nota: id });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath("/produto/insumos");
  return { ok: "Nota apagada. Os preços voltaram para os da nota anterior." };
}

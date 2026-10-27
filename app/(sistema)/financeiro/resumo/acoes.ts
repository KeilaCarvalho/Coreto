"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { lerValor } from "@/lib/formatos";
import type { EstadoAcao } from "@/components/form-acao";

const CAMINHO = "/financeiro/resumo";
const uuid = /^[0-9a-f-]{36}$/i;
const TIPOS = ["nota_fiscal", "cupom", "boleto", "fatura", "recibo", "outro"] as const;
const ORIGENS = ["whatsapp", "email", "papel", "outro"] as const;

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Seu perfil não pode mexer nos documentos do financeiro.";
  return m.replace(/^.*?ERROR:\s*/, "");
}

const Envio = z.object({
  arquivos: z.array(z.object({
    caminho: z.string().regex(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic|heif|xml)$/, "Arquivo inválido."),
    nome: z.string().max(200),
  })).min(1, "Escolha pelo menos um arquivo.").max(30),
  tipo: z.enum(TIPOS),
  origem: z.enum(ORIGENS),
});

/** Registra na caixa de entrada os arquivos que o navegador já mandou para o Storage. */
export async function registrarDocumentos(arquivos: { caminho: string; nome: string }[], tipo: string, origem: string): Promise<EstadoAcao> {
  const lido = Envio.safeParse({ arquivos, tipo, origem });
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("documentos_financeiros").insert(
    lido.data.arquivos.map((a) => ({ arquivo: a.caminho, nome_arquivo: a.nome || null, tipo: lido.data.tipo, origem: lido.data.origem })),
  );
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  const n = lido.data.arquivos.length;
  return { ok: n === 1 ? "Documento na caixa de entrada. Falta conferir." : `${n} documentos na caixa de entrada. Falta conferir.` };
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((v) => v || null);
const texto = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const Conferencia = z.object({
  tipo: z.enum(TIPOS),
  origem: z.enum(ORIGENS),
  situacao: z.enum(["entrada", "conferido", "descartado"]),
  fornecedor: texto(160),
  numero: texto(60),
  emitido_em: data,
  vence_em: data,
  categoria: texto(80),
  observacao: texto(800),
  link_drive: z.string().trim().max(500).refine((v) => !v || /^https:\/\//.test(v), "O link do Drive precisa começar com https://").transform((v) => v || null),
});

/** Conferência: completa os dados do documento e marca as etapas (Conta Azul, Drive, pagamento). */
export async function salvarDocumento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!uuid.test(id)) return { erro: "Documento inválido." };
  const campo = (n: string) => String(dados.get(n) ?? "");
  const lido = Conferencia.safeParse({
    tipo: campo("tipo"), origem: campo("origem"), situacao: campo("situacao"), fornecedor: campo("fornecedor"), numero: campo("numero"),
    emitido_em: campo("emitido_em"), vence_em: campo("vence_em"), categoria: campo("categoria"), observacao: campo("observacao"), link_drive: campo("link_drive"),
  });
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const valor = lerValor(dados.get("valor"));
  if (valor != null && valor < 0) return { erro: "O valor não pode ser negativo." };
  const marcado = (n: string) => dados.get(n) === "on";

  const supabase = await supabaseServidor();
  const { data: linhas, error } = await supabase.from("documentos_financeiros").update({
    ...lido.data,
    valor,
    lancado_conta_azul: marcado("lancado_conta_azul"),
    anexado_conta_azul: marcado("anexado_conta_azul"),
    salvo_drive: marcado("salvo_drive"),
    pago: marcado("pago"),
  }).eq("id", id).select("id");
  if (error) return { erro: mensagem(error.message) };
  if (!linhas?.length) return { erro: "Seu perfil não pode conferir documentos." };
  revalidatePath(CAMINHO);
  return { ok: `${lido.data.fornecedor ?? "Documento"} salvo.` };
}

const ETAPAS = { lancado: "lancado_conta_azul", anexado: "anexado_conta_azul", pago: "pago" } as const;

/** Botões rápidos das listas: "Lancei", "Anexei", "Paguei". */
export async function marcarEtapa(dados: FormData) {
  const id = String(dados.get("id") ?? "");
  const etapa = String(dados.get("etapa") ?? "") as keyof typeof ETAPAS;
  if (!uuid.test(id) || !(etapa in ETAPAS)) return;
  const supabase = await supabaseServidor();
  await supabase.from("documentos_financeiros").update({ [ETAPAS[etapa]]: dados.get("valor") !== "0" }).eq("id", id);
  revalidatePath(CAMINHO);
}

/** Apaga um documento jogado por engano (e o arquivo dele). */
export async function apagarDocumento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = String(dados.get("id") ?? "");
  if (!uuid.test(id)) return { erro: "Documento inválido." };
  const supabase = await supabaseServidor();
  const { data: doc } = await supabase.from("documentos_financeiros").select("arquivo").eq("id", id).maybeSingle();
  const { data: linhas, error } = await supabase.from("documentos_financeiros").delete().eq("id", id).select("id");
  if (error) return { erro: mensagem(error.message) };
  if (!linhas?.length) return { erro: "Seu perfil não pode apagar documentos." };
  if (doc?.arquivo) await supabase.storage.from("documentos").remove([doc.arquivo]);
  revalidatePath(CAMINHO);
  return { ok: "Documento apagado." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { AREAS, ATALHOS, PRIORIDADES, STATUS, hojeSP } from "@/lib/tarefas";
import type { EstadoAcao } from "@/components/form-acao";

const CAMINHO = "/tarefas";
const uuid = /^[0-9a-f-]{36}$/i;
const valores = <T extends readonly { valor: string }[]>(l: T) => l.map((x) => x.valor) as [string, ...string[]];

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Essa tarefa não é sua.";
  return m.replace(/^.*?ERROR:\s*/, "");
}

const Tarefa = z.object({
  titulo: z.string().trim().min(1, "Escreva o que precisa ser feito.").max(200),
  area: z.enum(valores(AREAS)),
  prioridade: z.enum(valores(PRIORIDADES)),
  status: z.enum(valores(STATUS)),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  repete: z.string().regex(/^(dias_uteis|diaria|semanal:[0-6]|mensal:([1-9]|[12][0-9]|3[01]))$/).nullable(),
  checklist: z.array(z.object({ texto: z.string().trim().min(1).max(200), feito: z.boolean() })).max(40),
  notas: z.string().trim().max(4000).nullable(),
  atalho: z.enum(valores(ATALHOS)).nullable(),
  esperando_quem: z.string().trim().max(120).nullable(),
});

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const ouNulo = (s: string) => (s ? s : null);

/** Inclui ou edita uma tarefa (janela lateral). */
export async function salvarTarefa(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = texto(dados, "id");
  let checklist: unknown = [];
  try { checklist = JSON.parse(texto(dados, "checklist") || "[]"); } catch { return { erro: "Não consegui ler o checklist." }; }
  const repete = texto(dados, "tipo") === "rotina" ? ouNulo(texto(dados, "repete")) : null;
  const lido = Tarefa.safeParse({
    titulo: texto(dados, "titulo"), area: texto(dados, "area") || "geral", prioridade: texto(dados, "prioridade") || "normal",
    status: texto(dados, "status") || "a_fazer", data: ouNulo(texto(dados, "data")), repete, checklist,
    notas: ouNulo(texto(dados, "notas")), atalho: ouNulo(texto(dados, "atalho")), esperando_quem: ouNulo(texto(dados, "esperando_quem")),
  });
  if (!lido.success) return { erro: lido.error.issues[0].message };
  const t = lido.data;
  if (t.repete && !t.data) t.data = hojeSP();
  if (t.repete && t.status === "feito") t.status = "a_fazer";
  if (t.status !== "esperando") t.esperando_quem = null;

  const supabase = await supabaseServidor();
  const { error } = uuid.test(id)
    ? await supabase.from("tarefas").update(t).eq("id", id)
    : await supabase.from("tarefas").insert(t);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: uuid.test(id) ? "Tarefa salva." : "Tarefa criada." };
}

/** Campo rápido "O que você precisa fazer?": entra para hoje (ou em Ideias). */
export async function adicionarRapida(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const titulo = texto(dados, "titulo");
  if (!titulo) return { erro: "Escreva a tarefa." };
  if (titulo.length > 200) return { erro: "Tarefa grande demais: use as anotações para os detalhes." };
  const ideia = texto(dados, "para") === "ideia";
  const area = valores(AREAS).includes(texto(dados, "area")) ? texto(dados, "area") : "geral";
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("tarefas").insert({
    titulo, area, status: ideia ? "ideia" : "a_fazer", data: ideia ? null : hojeSP(),
  });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: ideia ? "Anotado em Ideias/Futuro." : "Anotado para hoje." };
}

/** Marca como feita (rotina pula para a próxima data). */
export async function concluirTarefa(id: string): Promise<EstadoAcao> {
  if (!uuid.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("concluir_tarefa", { p_id: id });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: data ? `Feito! Volta em ${String(data).split("-").reverse().join("/")}.` : "Feito!" };
}

/** Desfaz: tarefa comum volta para "A fazer"; rotina volta para o dia em que foi marcada. */
export async function desfazerTarefa(id: string, rotina: boolean): Promise<EstadoAcao> {
  if (!uuid.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await supabaseServidor();
  const { error } = rotina
    ? await supabase.rpc("desfazer_rotina", { p_id: id })
    : await supabase.from("tarefas").update({ status: "a_fazer" }).eq("id", id);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Desfeito." };
}

/** Kanban: muda a coluna (arrastar o cartão ou escolher no celular). */
export async function moverTarefa(id: string, novo: string, ordem?: number): Promise<EstadoAcao> {
  if (!uuid.test(id) || !valores(STATUS).includes(novo)) return { erro: "Movimento inválido." };
  const supabase = await supabaseServidor();
  if (novo === "feito") {
    const { data: t } = await supabase.from("tarefas").select("repete").eq("id", id).maybeSingle();
    if (t?.repete) return concluirTarefa(id);
  }
  const mudancas: Record<string, unknown> = { status: novo };
  if (typeof ordem === "number" && Number.isFinite(ordem)) mudancas.ordem = ordem;
  const { error } = await supabase.from("tarefas").update(mudancas).eq("id", id);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Movida." };
}

/** Marca ou desmarca um passo do checklist direto no cartão. */
export async function marcarPasso(id: string, indice: number, feito: boolean): Promise<EstadoAcao> {
  if (!uuid.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await supabaseServidor();
  const { data: t } = await supabase.from("tarefas").select("checklist").eq("id", id).maybeSingle();
  const lista = Array.isArray(t?.checklist) ? (t.checklist as { texto: string; feito: boolean }[]) : [];
  if (!lista[indice]) return { erro: "Passo não encontrado." };
  lista[indice] = { ...lista[indice], feito };
  const { error } = await supabase.from("tarefas").update({ checklist: lista }).eq("id", id);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Salvo." };
}

export async function excluirTarefa(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = texto(dados, "id");
  if (!uuid.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("tarefas").delete().eq("id", id);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Tarefa excluída." };
}

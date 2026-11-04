"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { lerValor } from "@/lib/formatos";
import { TIPOS_ITEM, feriadosDoPeriodo, periodoPadrao } from "@/lib/folha";
import type { EstadoAcao } from "@/components/form-acao";

const CAMINHO = "/pessoas/folha";
const uuid = /^[0-9a-f-]{36}$/i;
const dataIso = /^\d{4}-\d{2}-\d{2}$/;
const mesOk = (m: string) => /^\d{4}-\d{2}-01$/.test(m);
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

function mensagem(m: string) {
  if (m.includes("row-level security")) return "Só a administração mexe na folha.";
  return m.replace(/^.*?ERROR:\s*/, "");
}

/** Começa a folha do mês com o período padrão do VT e os feriados nacionais. */
export async function criarFolha(dados: FormData) {
  const mes = texto(dados, "mes");
  if (!mesOk(mes)) return;
  const { inicio, fim } = periodoPadrao(mes);
  const supabase = await supabaseServidor();
  await supabase.from("folhas").insert({ mes, vt_inicio: inicio, vt_fim: fim, feriados: feriadosDoPeriodo(inicio, fim) });
  revalidatePath(CAMINHO);
  redirect(`${CAMINHO}?mes=${mes.slice(0, 7)}`);
}

/** "20/11, 25/12" ou "2026-11-20" → datas ISO dentro do período. */
function lerFeriados(bruto: string, inicio: string, fim: string) {
  const saida: string[] = [];
  for (const parte of bruto.split(/[,;\s]+/).filter(Boolean)) {
    let iso = "";
    if (dataIso.test(parte)) iso = parte;
    else {
      const m = parte.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (!m) return null;
      const dia = m[1].padStart(2, "0"), mes = m[2].padStart(2, "0");
      const anos = m[3] ? [m[3].length === 2 ? `20${m[3]}` : m[3]] : [inicio.slice(0, 4), fim.slice(0, 4)];
      iso = anos.map((a) => `${a}-${mes}-${dia}`).find((d) => d >= inicio && d <= fim) ?? `${anos[0]}-${mes}-${dia}`;
    }
    saida.push(iso);
  }
  return [...new Set(saida)].sort();
}

export async function salvarPeriodo(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const mes = texto(dados, "mes"), inicio = texto(dados, "vt_inicio"), fim = texto(dados, "vt_fim");
  if (!mesOk(mes) || !dataIso.test(inicio) || !dataIso.test(fim)) return { erro: "Informe o começo e o fim do período." };
  if (fim < inicio) return { erro: "O fim do período precisa ser depois do começo." };
  const feriados = lerFeriados(texto(dados, "feriados"), inicio, fim);
  if (!feriados) return { erro: "Escreva os feriados assim: 20/11, 25/12." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("folhas").update({ vt_inicio: inicio, vt_fim: fim, feriados }).eq("mes", mes);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Período do vale-transporte salvo." };
}

/** Regra de pagamento de uma pessoa (comissão, VT, ajuda de custo, bônus). */
export async function salvarRegra(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const pessoa = texto(dados, "pessoa_id");
  if (!uuid.test(pessoa)) return { erro: "Pessoa inválida." };
  const pct = lerValor(dados.get("comissao_percentual"));
  if (pct != null && (pct < 0 || pct > 100)) return { erro: "O percentual de comissão vai de 0 a 100." };
  const num = (k: string) => lerValor(dados.get(k));
  const regra = {
    pessoa_id: pessoa,
    ativo: dados.get("ativo") === "on",
    comissao_percentual: dados.get("vendedora") === "on" ? (pct ?? 0) / 100 : null,
    nome_no_fluxo: dados.get("vendedora") === "on" ? texto(dados, "nome_no_fluxo") || null : null,
    recebe_vt: dados.get("recebe_vt") === "on",
    vt_conta_sabado: dados.get("vt_conta_sabado") === "on",
    vt_tarifa: num("vt_tarifa") ?? 0,
    vt_desconta: dados.get("vt_desconta") === "on",
    salario_base: num("salario_base"),
    vt_desconto_valor: num("vt_desconto_valor"),
    ajuda_custo: num("ajuda_custo") ?? 0,
    bonus_fixo: num("bonus_fixo") ?? 0,
    observacao: texto(dados, "observacao") || null,
    atualizado_em: new Date().toISOString(),
  };
  if ([regra.vt_tarifa, regra.ajuda_custo, regra.bonus_fixo, regra.salario_base ?? 0, regra.vt_desconto_valor ?? 0].some((v) => v < 0)) return { erro: "Os valores não podem ser negativos." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("folha_regras").upsert(regra);
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Regra salva." };
}

/** Inclui na folha alguém da equipe ou uma pessoa nova. */
export async function incluirPessoa(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let pessoa = texto(dados, "pessoa_id");
  const nova = texto(dados, "nome_novo");
  const supabase = await supabaseServidor();
  if (pessoa === "nova") {
    if (nova.length < 2) return { erro: "Escreva o nome da pessoa." };
    const { data, error } = await supabase.from("pessoas").insert({ nome: nova }).select("id").single();
    if (error) return { erro: mensagem(error.message) };
    pessoa = data.id as string;
  }
  if (!uuid.test(pessoa)) return { erro: "Escolha a pessoa." };
  const { error } = await supabase.from("folha_regras").insert({ pessoa_id: pessoa });
  if (error) return { erro: error.message.includes("duplicate") ? "Essa pessoa já está na folha." : mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Pessoa incluída. Agora preencha a regra dela." };
}

/** Lançamento do mês: retirada, adiantamento, prêmio, desconto… */
export async function lancarItem(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const mes = texto(dados, "mes"), pessoa = texto(dados, "pessoa_id"), parte = texto(dados, "parte"), tipo = texto(dados, "tipo");
  if (!mesOk(mes) || !uuid.test(pessoa)) return { erro: "Folha inválida." };
  if (!["comissao", "vt"].includes(parte)) return { erro: "Escolha em qual parte entra." };
  const t = TIPOS_ITEM.find((x) => x.valor === tipo);
  if (!t) return { erro: "Escolha o tipo." };
  const bruto = lerValor(dados.get("valor"));
  if (!bruto) return { erro: "Informe o valor." };
  const sinal = t.sinal !== 0 ? t.sinal : texto(dados, "sinal") === "soma" ? 1 : -1;
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("folha_itens").insert({
    mes, pessoa_id: pessoa, parte, tipo, descricao: texto(dados, "descricao").slice(0, 200) || null, valor: Math.round(Math.abs(bruto) * sinal * 100) / 100,
  });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: `${t.rotulo} lançado.` };
}

export async function excluirItem(dados: FormData) {
  const id = Number(texto(dados, "id"));
  if (!Number.isInteger(id)) return;
  const supabase = await supabaseServidor();
  await supabase.from("folha_itens").delete().eq("id", id);
  revalidatePath(CAMINHO);
}

/** Ajuste do mês: realizado diferente da Equipe do fluxo, ou dias de VT diferentes (faltas, férias). */
export async function salvarAjuste(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const mes = texto(dados, "mes"), pessoa = texto(dados, "pessoa_id");
  if (!mesOk(mes) || !uuid.test(pessoa)) return { erro: "Folha inválida." };
  const realizado = texto(dados, "realizado") ? lerValor(dados.get("realizado")) : null;
  const diasTexto = texto(dados, "dias_vt");
  const dias = diasTexto ? Number(diasTexto) : null;
  if (dias != null && (!Number.isInteger(dias) || dias < 0 || dias > 31)) return { erro: "Dias de VT: um número de 0 a 31." };
  if (realizado != null && realizado < 0) return { erro: "O valor vendido não pode ser negativo." };
  const supabase = await supabaseServidor();
  const { error } = realizado == null && dias == null
    ? await supabase.from("folha_pessoas").delete().eq("mes", mes).eq("pessoa_id", pessoa)
    : await supabase.from("folha_pessoas").upsert({ mes, pessoa_id: pessoa, realizado, dias_vt: dias });
  if (error) return { erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: "Ajuste salvo." };
}

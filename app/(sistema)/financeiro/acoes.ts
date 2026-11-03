"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { diasDeVenda, inicioDoMes } from "@/lib/fluxo";
import type { EstadoAcao } from "@/components/form-acao";
import { lerValor } from "@/lib/formatos";

const valor = z.number().finite().min(-1e9).max(1e9);
const Linha = z.object({ nome: z.string().trim().min(1, "Toda linha precisa de um nome.").max(80), valor });
const Venda = Linha.extend({ dias: z.array(valor).max(3) });
const Fluxo = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendasDia: z.array(Venda).max(40),
  saldos: z.array(Linha).max(40),
  aReceber: z.array(Linha).max(60),
  vendasMes: z.array(Linha).max(40),
  vendedoras: z.array(Linha).max(40),
  contasAPagar: z.number().finite().min(0, "Contas a pagar não pode ser negativo."),
  contasPagas: z.number().finite().min(0, "Contas pagas não pode ser negativo."),
  observacao: z.string().max(2000),
  contasPadrao: z.array(z.string().trim().min(1).max(80)).max(40).nullable().optional(),
});

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function salvarFluxo(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("dados") ?? "")); } catch { return { erro: "Não consegui ler os lançamentos." }; }
  const lido = Fluxo.safeParse(bruto);
  if (!lido.success) return { erro: "Confira os valores: " + lido.error.issues[0].message };
  const f = lido.data;
  if (f.data > hojeSP()) return { erro: "Não dá para lançar um dia que ainda não chegou." };
  const periodo = diasDeVenda(f.data);
  if (!periodo.length) return { erro: "Sábado e domingo não têm lançamento: as vendas entram na segunda-feira." };

  // O total de cada forma é sempre a soma dos dias informados.
  const vendas = f.vendasDia.map((v) => {
    const dias = periodo.map((_, k) => Math.round((v.dias[k] ?? 0) * 100) / 100);
    return { nome: v.nome, valor: Math.round(dias.reduce((t, n) => t + n, 0) * 100) / 100, dias };
  });

  // Vendas e equipe vão para o mês das vendas (na segunda 2/11, outubro).
  // As contas vão para o mês do dia do lançamento (novembro), sem apagar o fechamento do mês anterior.
  const mesVendas = inicioDoMes(periodo[periodo.length - 1]);
  const mesContas = inicioDoMes(f.data);
  const contas = { contas_a_pagar: f.contasAPagar, contas_pagas: f.contasPagas };
  const supabase = await supabaseServidor();
  const [dia, mes, mesC] = await Promise.all([
    supabase.from("fluxo_dias").upsert({
      data: f.data, vendas, saldos: f.saldos, a_receber: f.aReceber, observacao: f.observacao.trim() || null,
    }).select("data"),
    supabase.from("fluxo_meses").upsert({
      mes: mesVendas, vendas: f.vendasMes, vendedoras: f.vendedoras, ...(mesVendas === mesContas ? contas : {}),
    }).select("mes"),
    mesVendas === mesContas ? Promise.resolve({ error: null }) : supabase.from("fluxo_meses").upsert({ mes: mesContas, ...contas }).select("mes"),
  ]);
  let erro: { message: string } | null = dia.error ?? mes.error ?? mesC.error;
  if (!erro && f.contasPadrao) {
    const r = await supabase.from("fluxo_config").update({ contas_padrao: [...new Set(f.contasPadrao)] }).eq("unico", true);
    erro = r.error;
  }
  if (erro) return { erro: erro.message.includes("row-level security") ? "Seu perfil não pode lançar no fluxo financeiro." : erro.message };
  revalidatePath("/financeiro/fluxo");
  return { ok: `Fluxo de ${f.data.slice(8, 10)}/${f.data.slice(5, 7)} salvo.${f.contasPadrao ? " As contas dos bancos ficaram guardadas como padrão." : ""}` };
}

/** Fechamento do mês: ajusta as contas pagas e a pagar do mês. */
export async function salvarContasDoMes(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const mes = String(dados.get("mes") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(mes)) return { erro: "Mês inválido." };
  const pagas = lerValor(dados.get("contas_pagas")) ?? 0;
  const aPagar = lerValor(dados.get("contas_a_pagar")) ?? 0;
  if (pagas < 0 || aPagar < 0) return { erro: "Os valores das contas não podem ser negativos." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("fluxo_meses").upsert({
    mes, contas_pagas: Math.round(pagas * 100) / 100, contas_a_pagar: Math.round(aPagar * 100) / 100,
  }).select("mes");
  if (error) return { erro: error.message.includes("row-level security") ? "Seu perfil não pode lançar no fluxo financeiro." : error.message };
  revalidatePath("/financeiro/fluxo");
  revalidatePath("/financeiro/fluxo/fechamento");
  return { ok: "Contas do mês salvas." };
}

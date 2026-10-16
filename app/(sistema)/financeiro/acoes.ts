"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { inicioDoMes } from "@/lib/fluxo";
import type { EstadoAcao } from "@/components/form-acao";

const Linha = z.object({ nome: z.string().trim().min(1).max(80), valor: z.number().finite().min(-1e9).max(1e9) });
const Fluxo = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendasDia: z.array(Linha).max(40),
  saldos: z.array(Linha).max(40),
  aReceber: z.array(Linha).max(60),
  vendasMes: z.array(Linha).max(40),
  vendedoras: z.array(Linha).max(40),
  contasAPagar: z.number().finite().min(0, "Contas a pagar não pode ser negativo."),
  contasPagas: z.number().finite().min(0, "Contas pagas não pode ser negativo."),
  observacao: z.string().max(2000),
});

export async function salvarFluxo(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  let bruto: unknown;
  try { bruto = JSON.parse(String(dados.get("dados") ?? "")); } catch { return { erro: "Não consegui ler os lançamentos." }; }
  const lido = Fluxo.safeParse(bruto);
  if (!lido.success) return { erro: "Confira os valores: " + lido.error.issues[0].message };
  const f = lido.data;

  const supabase = await supabaseServidor();
  const [dia, mes] = await Promise.all([
    supabase.from("fluxo_dias").upsert({
      data: f.data, vendas: f.vendasDia, saldos: f.saldos, a_receber: f.aReceber, observacao: f.observacao.trim() || null,
    }).select("data"),
    supabase.from("fluxo_meses").upsert({
      mes: inicioDoMes(f.data), vendas: f.vendasMes, vendedoras: f.vendedoras, contas_a_pagar: f.contasAPagar, contas_pagas: f.contasPagas,
    }).select("mes"),
  ]);
  const erro = dia.error ?? mes.error;
  if (erro) return { erro: erro.message.includes("row-level security") ? "Seu perfil não pode lançar no fluxo financeiro." : erro.message };
  revalidatePath("/financeiro/fluxo");
  return { ok: "Fluxo financeiro salvo." };
}

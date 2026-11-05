"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { lerXlsx } from "@/lib/xlsx-simples";
import { contasDaPlanilha } from "@/lib/contas-pagar";
import { reais } from "@/lib/formatos";
import type { EstadoAcao } from "@/components/form-acao";

/** Importa a "Visão Contas a Pagar" do Conta Azul e troca as contas do mesmo período. */
export async function importarContasPagar(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha a planilha exportada do Conta Azul." };
  let linhas: string[][];
  try { linhas = lerXlsx(new Uint8Array(await arquivo.arrayBuffer())); }
  catch (e) { return { erro: e instanceof Error ? e.message : "Não consegui abrir a planilha." }; }
  const { contas, erro } = contasDaPlanilha(linhas);
  if (erro) return { erro };
  const datas = contas.map((c) => c.vencimento).sort();
  const de = datas[0], ate = datas[datas.length - 1];
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("importar_contas_pagar", { p_de: de, p_ate: ate, p_contas: contas });
  if (error) return { erro: error.message.includes("permiss") ? "Seu perfil não pode importar contas." : error.message };
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  const aberto = contas.reduce((t, c) => t + c.em_aberto, 0);
  const br = (d: string) => d.split("-").reverse().join("/");
  return { ok: `${data ?? contas.length} contas importadas (vencimento de ${br(de)} a ${br(ate)}), ${reais(aberto)} em aberto.` };
}

/** "Já tenho a nota": tira a conta da lista de notas a pedir (fica guardado mesmo depois de importar de novo). */
export async function marcarNota(dados: FormData) {
  const chave = String(dados.get("chave") ?? "");
  if (!/^[0-9a-f]{32}$/.test(chave)) return;
  const supabase = await supabaseServidor();
  if (dados.get("desfazer")) await supabase.from("contas_pagar_nota_ok").delete().eq("chave", chave);
  else await supabase.from("contas_pagar_nota_ok").upsert({ chave });
  revalidatePath("/financeiro/contas");
}

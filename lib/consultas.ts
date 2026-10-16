import { supabaseServidor } from "@/lib/supabase/server";
import type { Cor, Opcao } from "@/components/campos-produto";

/** Listas usadas nos formulários de produto. */
export async function listasDoProduto() {
  const supabase = await supabaseServidor();
  const [grades, categorias, colecoes, cores] = await Promise.all([
    supabase.from("grades").select("id, nome").is("arquivado_em", null).order("nome"),
    supabase.from("categorias").select("id, nome").is("arquivado_em", null).order("nome"),
    supabase.from("colecoes").select("id, nome").is("arquivado_em", null).order("nome"),
    supabase.from("cores").select("id, nome, hex").is("arquivado_em", null).order("nome"),
  ]);
  return {
    grades: (grades.data ?? []) as Opcao[],
    categorias: (categorias.data ?? []) as Opcao[],
    colecoes: (colecoes.data ?? []) as Opcao[],
    cores: (cores.data ?? []) as Cor[],
  };
}

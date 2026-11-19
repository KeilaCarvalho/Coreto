import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Quadro, type Coluna, type Op } from "@/components/producao/quadro";

export const metadata = { title: "Quadro de produção" };

export default async function PaginaQuadro() {
  const sessao = await exigir("producao");
  const sb = await supabaseServidor();
  const [colunasR, opsR] = await Promise.all([
    sb.from("producao_colunas").select("id, nome, ordem, cor, final").order("ordem"),
    sb.from("producao_ops").select("id, numero, titulo, tecido, faccao, quantidade, prazo, etiqueta, observacao, coluna_id, ordem, movido_em, criado_em")
      .is("arquivado_em", null).order("ordem").limit(2000),
  ]);
  return (
    <Quadro
      colunas={(colunasR.data ?? []) as Coluna[]}
      ops={(opsR.data ?? []) as Op[]}
      podeCriar={sessao.pode("producao", "criar")}
      podeEditar={sessao.pode("producao", "editar")}
      podeArquivar={sessao.pode("producao", "aprovar")}
    />
  );
}

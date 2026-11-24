import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Quadro, type Coluna, type Op, type Pendencia } from "@/components/producao/quadro";

export const metadata = { title: "Quadro de produção" };

export default async function PaginaQuadro() {
  const sessao = await exigir("producao");
  const sb = await supabaseServidor();
  const [colunasR, opsR, pendR] = await Promise.all([
    sb.from("producao_colunas").select("id, nome, ordem, cor, final").order("ordem"),
    sb.from("producao_ops").select("id, numero, titulo, tecido, faccao, quantidade, prazo, etiqueta, observacao, coluna_id, ordem, movido_em, criado_em, data_corte, cortador, composicao, matriz, tamanhos, grade, entrega, pronta_em, conferida_em")
      .is("arquivado_em", null).order("ordem").limit(2000),
    sb.from("producao_pendencias").select("id, op_id, modelo, cor, tamanho, quantidade, criado_em, producao_ops(numero)").is("resolvido_em", null).order("criado_em"),
  ]);
  const pendencias = ((pendR.data ?? []) as unknown as (Omit<Pendencia, "numero"> & { producao_ops: { numero: number | null } | null })[])
    .map(({ producao_ops, ...p }) => ({ ...p, numero: producao_ops?.numero ?? null }));
  return (
    <Quadro
      colunas={(colunasR.data ?? []) as Coluna[]}
      ops={(opsR.data ?? []) as Op[]}
      pendencias={pendencias}
      podeCriar={sessao.pode("producao", "criar")}
      podeEditar={sessao.pode("producao", "editar")}
      podeArquivar={sessao.pode("producao", "aprovar")}
    />
  );
}

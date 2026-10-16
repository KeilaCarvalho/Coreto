import Link from "next/link";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { FichaCusto, type ItemFicha, type Taxas } from "@/components/ficha-custo";
import { quando, reais } from "@/lib/formatos";
import { salvarFicha } from "../../acoes";

type Produto = {
  id: string; referencia: string; nome: string; preco_venda: number | null;
  fichas_custo: { simples: number; cartao: number; comissao: number; despesas_fixas: number; lucro_desejado: number; observacao: string | null; atualizado_em: string } | null;
};
type Item = { tipo: ItemFicha["tipo"]; descricao: string; quantidade: number; unidade: string | null; valor_unitario: number };
type Historico = { id: number; preco: number; custo: number | null; margem: number | null; definido_em: string; quem: { nome: string } | null };

const campo = (v: number) => String(v).replace(".", ",");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("produtos").select("nome").eq("id", (await params).id).maybeSingle();
  return { title: data ? `Precificar ${data.nome}` : "Precificação" };
}

export default async function FichaProduto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  await exigir("produto", "editar");
  const { id } = await params;
  const { voltar } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServidor();
  const [{ data }, { data: itensR }, { data: cfg }, { data: histR }] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome, preco_venda, fichas_custo(simples, cartao, comissao, despesas_fixas, lucro_desejado, observacao, atualizado_em)").eq("id", id).maybeSingle(),
    supabase.from("ficha_custo_itens").select("tipo, descricao, quantidade, unidade, valor_unitario").eq("produto_id", id).order("ordem"),
    supabase.from("config_precificacao").select("simples, cartao, comissao, despesas_fixas, lucro_desejado").eq("id", 1).maybeSingle(),
    supabase.from("historico_precos").select("id, preco, custo, margem, definido_em, quem:pessoas!definido_por(nome)").eq("produto_id", id).order("definido_em", { ascending: false }).limit(20),
  ]);
  if (!data) notFound();
  const produto = data as unknown as Produto;
  const base = produto.fichas_custo ?? cfg ?? { simples: 0, cartao: 0, comissao: 0, despesas_fixas: 0, lucro_desejado: 30 };
  const taxas: Taxas = {
    simples: campo(base.simples), cartao: campo(base.cartao), comissao: campo(base.comissao),
    despesas_fixas: campo(base.despesas_fixas), lucro_desejado: campo(base.lucro_desejado),
  };
  const itens: ItemFicha[] = ((itensR ?? []) as Item[]).map((i) => ({
    tipo: i.tipo, descricao: i.descricao, quantidade: campo(Number(i.quantidade)), unidade: i.unidade ?? "", valor_unitario: campo(Number(i.valor_unitario)),
  }));
  const historico = (histR ?? []) as unknown as Historico[];
  const voltaLote = voltar && /^[0-9a-f-]{36}$/i.test(voltar) ? voltar : null;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Precificação", href: "/produto/precificacao" }]}
        titulo={produto.nome}
        descricao={`Referência ${produto.referencia}. ${produto.fichas_custo ? `Ficha atualizada em ${quando(produto.fichas_custo.atualizado_em)}.` : "Ainda sem ficha de custo."}`}
        acoes={<Link className="botao leve" href={voltaLote ? `/producao/recebimentos/${voltaLote}` : `/produto/catalogo/${produto.id}`}>{voltaLote ? "Voltar ao lote" : "Ver no catálogo"}</Link>}
      />
      {voltaLote && <p className="aviso alerta">Ao salvar com o preço, você volta para o lote e já pode liberar as peças.</p>}

      <section className="painel">
        <div className="painel-topo"><div><h2>Ficha de custo</h2><p>Tudo o que vai em uma peça: tecido, aviamentos, facção, corte, embalagem.</p></div></div>
        <div className="painel-corpo">
          <FormAcao acao={salvarFicha}>
            <input type="hidden" name="produto_id" value={produto.id} />
            {voltaLote && <input type="hidden" name="voltar" value={voltaLote} />}
            <FichaCusto itensIniciais={itens} taxasIniciais={taxas} precoAtual={produto.preco_venda} />
            <div className="campo" style={{ marginTop: 16 }}>
              <label htmlFor="observacao">Observação</label>
              <input id="observacao" name="observacao" defaultValue={produto.fichas_custo?.observacao ?? ""} placeholder="Ex.: consumo de tecido medido no piloto" />
            </div>
            <div className="formulario-rodape"><BotaoEnviar>Salvar ficha e preço</BotaoEnviar></div>
          </FormAcao>
        </div>
      </section>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2>Histórico de preços</h2><p>Cada mudança de preço fica registrada com o custo e o lucro daquele momento.</p></div></div>
        {historico.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Quando</th><th className="num">Preço</th><th className="num">Custo</th><th className="num">Lucro real</th><th>Quem</th></tr></thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td className="mini">{quando(h.definido_em)}</td>
                    <td className="num"><strong>{reais(h.preco)}</strong></td>
                    <td className="num">{reais(h.custo)}</td>
                    <td className="num">{h.margem != null ? `${String(h.margem).replace(".", ",")}%` : "—"}</td>
                    <td>{h.quem?.nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="painel-corpo mini">Nenhum preço definido por aqui ainda.</p>}
      </section>
    </>
  );
}

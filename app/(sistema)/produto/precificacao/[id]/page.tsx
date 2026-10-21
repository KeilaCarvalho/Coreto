import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { AvisoDaUrl } from "@/components/janela-lateral";
import { JanelaFicha } from "@/components/precificacao/janela-ficha";
import { quando, reais } from "@/lib/formatos";

type Produto = {
  id: string; referencia: string; nome: string; preco_venda: number | null; custo_previsto: number | null;
  fichas_custo: { simples: number; cartao: number; comissao: number; despesas_fixas: number; lucro_desejado: number; observacao: string | null; atualizado_em: string } | null;
};
type Item = { tipo: "material" | "mao_de_obra" | "outro"; descricao: string; quantidade: number; unidade: string | null; valor_unitario: number };
type Historico = { id: number; preco: number; custo: number | null; margem: number | null; definido_em: string; quem: { nome: string } | null };

const TIPO = { material: "Tecido e aviamentos", mao_de_obra: "Mão de obra", outro: "Outros custos" } as const;
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("produtos").select("nome").eq("id", (await params).id).maybeSingle();
  return { title: data ? `Precificação · ${data.nome}` : "Precificação" };
}

export default async function FichaProduto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string; precificar?: string }> }) {
  await exigir("produto", "editar");
  const { id } = await params;
  const { voltar, precificar } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (voltar && /^[0-9a-f-]{36}$/i.test(voltar)) redirect(`/producao/recebimentos/${voltar}?acao=precificar`);
  const supabase = await supabaseServidor();
  const [{ data }, { data: itensR }, { data: histR }] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome, preco_venda, custo_previsto, fichas_custo(simples, cartao, comissao, despesas_fixas, lucro_desejado, observacao, atualizado_em)").eq("id", id).maybeSingle(),
    supabase.from("ficha_custo_itens").select("tipo, descricao, quantidade, unidade, valor_unitario").eq("produto_id", id).order("ordem"),
    supabase.from("historico_precos").select("id, preco, custo, margem, definido_em, quem:pessoas!definido_por(nome)").eq("produto_id", id).order("definido_em", { ascending: false }).limit(20),
  ]);
  if (!data) notFound();
  const produto = data as unknown as Produto;
  const f = produto.fichas_custo;
  const itens = (itensR ?? []) as Item[];
  const historico = (histR ?? []) as unknown as Historico[];
  const taxas = f ? f.simples + f.cartao + f.comissao + f.despesas_fixas : null;
  const lucro = produto.preco_venda && produto.custo_previsto != null && taxas != null
    ? ((produto.preco_venda * (1 - taxas / 100) - produto.custo_previsto) / produto.preco_venda) * 100 : null;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Precificação", href: "/produto/precificacao" }]}
        titulo={produto.nome}
        descricao={`Referência ${produto.referencia}. ${f ? `Ficha atualizada em ${quando(f.atualizado_em)}.` : "Ainda não foi precificado."}`}
        acoes={<>
          <Link className="botao leve" href={`/produto/catalogo/${produto.id}`}>Ver no catálogo</Link>
          <Link className="botao" href={`/produto/precificacao/${produto.id}?precificar=1`} scroll={false}><Icone nome={f ? "lapis" : "cifrao"} />{f ? "Editar precificação" : "Precificar"}</Link>
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <section className="painel" style={{ marginBottom: 16 }}>
        <div className="painel-topo"><div><h2>Resumo</h2><p>{f?.observacao ?? "Custo, preço e quanto sobra por peça"}</p></div></div>
        <div className="ficha-resumo">
          <div><span>Custo da peça</span><b>{reais(produto.custo_previsto)}</b></div>
          <div><span>Impostos e taxas</span><b>{taxas != null ? pct(taxas) : "—"}</b></div>
          <div><span>Preço de venda</span><b>{reais(produto.preco_venda)}</b></div>
          <div><span>Lucro real</span><b>{lucro != null ? pct(Math.round(lucro * 100) / 100) : "—"}</b></div>
        </div>
      </section>

      {itens.length > 0 && (
        <section className="painel" style={{ marginBottom: 16 }}>
          <div className="painel-topo"><div><h2>Custo da peça</h2><p>Pela ficha da facção e pelas notas fiscais</p></div></div>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Item</th><th>Tipo</th><th className="num">Qtd.</th><th className="num">Valor</th><th className="num">Total</th></tr></thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={k}>
                    <td><strong>{i.descricao}</strong></td>
                    <td className="mini">{TIPO[i.tipo]}</td>
                    <td className="num">{String(i.quantidade).replace(".", ",")} {i.unidade}</td>
                    <td className="num">{reais(Number(i.valor_unitario))}</td>
                    <td className="num"><strong>{reais(Number(i.quantidade) * Number(i.valor_unitario))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="painel">
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

      {precificar && <Suspense><JanelaFicha produtoId={produto.id} param="precificar" valor="1" /></Suspense>}
    </>
  );
}

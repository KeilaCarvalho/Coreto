import { notFound } from "next/navigation";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { listasDoProduto } from "@/lib/consultas";
import { Cabecalho } from "@/components/cabecalho";
import { CamposProduto, EscolhaCores } from "@/components/campos-produto";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { numero, reais } from "@/lib/formatos";
import { arquivarProduto, salvarCoresDoProduto, salvarProduto } from "../../acoes";

type Produto = {
  id: string; referencia: string; nome: string; grade_id: string; categoria_id: string | null; colecao_id: string | null;
  preco_venda: number | null; custo_previsto: number | null; ncm: string | null; descricao: string | null; arquivado_em: string | null;
  grades: { nome: string; grade_tamanhos: { tamanho: string; ordem: number }[] } | null;
  produto_cores: { cor_id: string }[];
  variantes: { id: string; cor_id: string; tamanho: string; sku: string; codigo_barras: string | null; ativa: boolean; cores: { nome: string; hex: string | null } | null }[];
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("produtos").select("referencia, nome").eq("id", (await params).id).maybeSingle();
  return { title: data ? `${data.referencia} ${data.nome}` : "Produto" };
}

export default async function DetalheProduto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const sessao = await exigir("produto");
  const { id } = await params;
  const { criado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("produtos")
    .select("id, referencia, nome, grade_id, categoria_id, colecao_id, preco_venda, custo_previsto, ncm, descricao, arquivado_em, grades(nome, grade_tamanhos(tamanho, ordem)), produto_cores(cor_id), variantes(id, cor_id, tamanho, sku, codigo_barras, ativa, cores(nome, hex))")
    .eq("id", id).maybeSingle();
  if (!data) notFound();
  const produto = data as unknown as Produto;
  const listas = await listasDoProduto();

  const veEstoque = sessao.pode("estoque");
  const saldo = new Map<string, number>();
  if (veEstoque && produto.variantes.length) {
    const { data: saldos } = await supabase.from("saldos_estoque").select("variante_id, saldo").in("variante_id", produto.variantes.map((v) => v.id));
    for (const s of saldos ?? []) saldo.set(s.variante_id, (saldo.get(s.variante_id) ?? 0) + s.saldo);
  }

  const tamanhos = [...(produto.grades?.grade_tamanhos ?? [])].sort((a, b) => a.ordem - b.ordem).map((t) => t.tamanho);
  const coresDaGrade = new Map<string, { nome: string; hex: string | null; ativa: boolean }>();
  for (const v of produto.variantes) {
    if (!v.cores) continue;
    const atual = coresDaGrade.get(v.cor_id);
    coresDaGrade.set(v.cor_id, { nome: v.cores.nome, hex: v.cores.hex, ativa: (atual?.ativa ?? false) || v.ativa });
  }
  const linhas = [...coresDaGrade.entries()].sort((a, b) => Number(b[1].ativa) - Number(a[1].ativa) || a[1].nome.localeCompare(b[1].nome));
  const celula = (cor: string, tam: string) => produto.variantes.find((v) => v.cor_id === cor && v.tamanho === tam);
  const totalTamanho = (tam: string) => produto.variantes.filter((v) => v.tamanho === tam).reduce((t, v) => t + (saldo.get(v.id) ?? 0), 0);
  const total = produto.variantes.reduce((t, v) => t + (saldo.get(v.id) ?? 0), 0);
  const podeEditar = sessao.pode("produto", "editar");
  const margem = produto.preco_venda && produto.custo_previsto ? 1 - produto.custo_previsto / produto.preco_venda : null;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Catálogo", href: "/produto/catalogo" }]}
        titulo={produto.nome}
        descricao={[`Referência ${produto.referencia}`, produto.grades?.nome ? `grade ${produto.grades.nome}` : null, produto.preco_venda != null ? reais(produto.preco_venda) : null].filter(Boolean).join(", ")}
        acoes={<>
          {podeEditar && (
            <form action={arquivarProduto}>
              <input type="hidden" name="id" value={produto.id} />
              <input type="hidden" name="arquivar" value={produto.arquivado_em ? "0" : "1"} />
              <button className="botao leve" type="submit">{produto.arquivado_em ? "Reativar" : "Arquivar"}</button>
            </form>
          )}
          {sessao.pode("estoque", "criar") && <Link className="botao" href="/estoque/movimentacoes"><Icone nome="entrada" />Registrar entrada</Link>}
        </>}
      />
      {criado && <p className="aviso ok" role="status"><Icone nome="certo" />Produto criado com {numero(produto.variantes.length)} variantes. Cada uma já tem SKU e código de barras.</p>}
      {produto.arquivado_em && <p className="aviso alerta">Este produto está arquivado e não aparece no catálogo nem no caixa.</p>}

      <div className="kpis">
        <Kpi destaque titulo="Em estoque" valor={veEstoque ? numero(total) : "—"} nota="peças somando todos os locais" />
        <Kpi titulo="Preço de venda" valor={reais(produto.preco_venda)} nota={produto.custo_previsto != null ? `custo previsto ${reais(produto.custo_previsto)}` : "custo ainda não informado"} />
        <Kpi titulo="Margem prevista" valor={margem != null ? `${Math.round(margem * 100)}%` : "—"} nota="antes de impostos e taxas" />
        <Kpi titulo="Variantes" valor={numero(produto.variantes.filter((v) => v.ativa).length)} nota={`${linhas.filter(([, c]) => c.ativa).length} cores × ${tamanhos.length} tamanhos`} />
      </div>

      <section className="painel">
        <div className="painel-topo">
          <div><h2>Grade</h2><p>{veEstoque ? "Peças em estoque somando todos os locais" : "Variantes de cor e tamanho"}</p></div>
          {veEstoque && <strong>{numero(total)} peças</strong>}
        </div>
        <div className="tabela-rolagem">
          <table className="matriz">
            <thead><tr><th scope="col" style={{ textAlign: "left" }}>Cor</th>{tamanhos.map((t) => <th scope="col" key={t}>{t}</th>)}</tr></thead>
            <tbody>
              {linhas.map(([corId, cor]) => (
                <tr key={corId}>
                  <th scope="row"><i className="amostra" style={{ background: cor.hex ?? "#fff", marginRight: 8 }} />{cor.nome}{!cor.ativa && <span className="etiqueta neutra" style={{ marginLeft: 8 }}>desativada</span>}</th>
                  {tamanhos.map((t) => {
                    const v = celula(corId, t);
                    if (!v) return <td key={t} className="inativa">—</td>;
                    const qtd = saldo.get(v.id) ?? 0;
                    return (
                      <td key={t} className={!v.ativa || !qtd ? "vazia" : qtd >= 8 ? "cheia" : undefined} title={v.codigo_barras ? `Código de barras ${v.codigo_barras}` : undefined}>
                        <span className="qtd">{veEstoque ? numero(qtd) : "•"}</span>
                        <span className="codigo">{v.sku}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {veEstoque && <tfoot><tr><th scope="row" style={{ textAlign: "left" }}>Total</th>{tamanhos.map((t) => <td key={t}>{numero(totalTamanho(t))}</td>)}</tr></tfoot>}
          </table>
        </div>
      </section>

      {podeEditar && (
        <div className="grade-lateral" style={{ marginTop: 16 }}>
          <section className="painel">
            <div className="painel-topo"><div><h2>Dados do produto</h2></div></div>
            <div className="painel-corpo">
              <FormAcao acao={salvarProduto}>
                <input type="hidden" name="id" value={produto.id} />
                <CamposProduto grades={listas.grades} categorias={listas.categorias} colecoes={listas.colecoes} valores={produto} gradeFixa />
                <div className="formulario-rodape"><BotaoEnviar>Salvar alterações</BotaoEnviar></div>
              </FormAcao>
            </div>
          </section>
          <section className="painel">
            <div className="painel-topo"><div><h2>Cores</h2><p>Cor nova cria variantes; cor retirada é desativada, sem perder o histórico.</p></div></div>
            <div className="painel-corpo">
              <FormAcao acao={salvarCoresDoProduto}>
                <input type="hidden" name="id" value={produto.id} />
                <EscolhaCores cores={listas.cores} marcadas={produto.produto_cores.map((c) => c.cor_id)} />
                <div className="formulario-rodape"><BotaoEnviar>Atualizar grade</BotaoEnviar></div>
              </FormAcao>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { Icone } from "@/components/icone";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { numero, reais } from "@/lib/formatos";

export const metadata = { title: "Catálogo" };

type Linha = {
  id: string; referencia: string; nome: string; preco_venda: number | null; arquivado_em: string | null;
  categorias: { nome: string } | null; colecoes: { nome: string } | null;
  produto_cores: { cores: { nome: string; hex: string | null } | null }[];
  variantes: { id: string; ativa: boolean }[];
};

export default async function Catalogo({ searchParams }: { searchParams: Promise<{ q?: string; arquivados?: string }> }) {
  const sessao = await exigir("produto");
  const { q = "", arquivados } = await searchParams;
  const supabase = await supabaseServidor();

  let consulta = supabase.from("produtos")
    .select("id, referencia, nome, preco_venda, arquivado_em, categorias(nome), colecoes(nome), produto_cores(cores(nome, hex)), variantes(id, ativa)")
    .order("referencia");
  consulta = arquivados ? consulta.not("arquivado_em", "is", null) : consulta.is("arquivado_em", null);
  const termo = q.trim().replace(/[%,()]/g, "");
  if (termo) consulta = consulta.or(`referencia.ilike.%${termo}%,nome.ilike.%${termo}%`);
  const { data } = await consulta;
  const produtos = (data ?? []) as unknown as Linha[];

  const saldoPorVariante = new Map<string, number>();
  if (sessao.pode("estoque") && produtos.length) {
    const { data: saldos } = await supabase.from("saldos_estoque").select("variante_id, saldo");
    for (const s of saldos ?? []) saldoPorVariante.set(s.variante_id, (saldoPorVariante.get(s.variante_id) ?? 0) + s.saldo);
  }
  const podeCriar = sessao.pode("produto", "criar");

  return (
    <>
      <Cabecalho
        titulo="Catálogo"
        descricao="Cada modelo com sua grade de cores e tamanhos. É daqui que estoque, produção e caixa leem o produto."
        acoes={podeCriar && <Link className="botao" href="/produto/catalogo/novo"><Icone nome="mais" />Novo produto</Link>}
      />
      <section className="painel">
        <div className="painel-topo">
          <form role="search" className="filtros">
            <input className="entrada" name="q" defaultValue={q} placeholder="Buscar por referência ou nome" aria-label="Buscar produto" />
            {arquivados && <input type="hidden" name="arquivados" value="1" />}
            <button className="botao leve pequeno" type="submit"><Icone nome="busca" />Buscar</button>
          </form>
          <Link className="botao leve pequeno" href={arquivados ? "/produto/catalogo" : "/produto/catalogo?arquivados=1"}>{arquivados ? "Ver produtos ativos" : "Ver arquivados"}</Link>
        </div>
        {produtos.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Referência</th><th>Produto</th><th>Cores</th><th className="num">Variantes</th>{sessao.pode("estoque") && <th className="num">Em estoque</th>}<th className="num">Preço</th></tr></thead>
              <tbody>
                {produtos.map((p) => {
                  const ativas = p.variantes.filter((v) => v.ativa);
                  const estoque = p.variantes.reduce((t, v) => t + (saldoPorVariante.get(v.id) ?? 0), 0);
                  return (
                    <tr key={p.id}>
                      <td><Link className="linha-link" href={`/produto/catalogo/${p.id}`}>{p.referencia}</Link></td>
                      <td><div className="item"><span className="marcador"><Icone nome="catalogo" /></span><div><strong>{p.nome}</strong><span>{[p.categorias?.nome, p.colecoes?.nome].filter(Boolean).join(", ") || "Sem categoria"}</span></div></div></td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          {p.produto_cores.map((pc, i) => pc.cores && <i key={i} className="amostra" title={pc.cores.nome} style={{ background: pc.cores.hex ?? "#fff" }} />)}
                        </span>
                      </td>
                      <td className="num">{numero(ativas.length)}</td>
                      {sessao.pode("estoque") && <td className="num">{numero(estoque)}</td>}
                      <td className="num"><strong>{reais(p.preco_venda)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : termo ? (
          <Vazio titulo="Nada encontrado" texto={`Nenhum produto com “${termo}” na referência ou no nome.`} />
        ) : (
          <Vazio titulo={arquivados ? "Nenhum produto arquivado" : "O catálogo está vazio"} texto={arquivados ? "Produtos arquivados aparecem aqui." : "Cadastre o primeiro modelo. O sistema cria sozinho as variantes de cor e tamanho, com SKU e código de barras."}>
            {podeCriar && !arquivados && <Link className="botao" href="/produto/catalogo/novo"><Icone nome="mais" />Novo produto</Link>}
          </Vazio>
        )}
      </section>
    </>
  );
}

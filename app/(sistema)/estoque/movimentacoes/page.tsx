import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { FormMovimentacao } from "@/components/form-movimentacao";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { ROTULO_TIPO } from "@/lib/estoque";
import { numero, quando } from "@/lib/formatos";
import { estornar, lancarMovimentacao } from "../acoes";

export const metadata = { title: "Movimentações de estoque" };

type Mov = {
  id: number; tipo: string; quantidade: number; ocorrido_em: string; observacao: string | null; estorno_de: number | null;
  variantes: { sku: string; produtos: { nome: string } | null } | null;
  origem: { nome: string } | null; destino: { nome: string } | null; quem: { nome: string } | null;
};

export default async function Movimentacoes({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sessao = await exigir("estoque");
  const { tipo } = await searchParams;
  const supabase = await supabaseServidor();
  let consulta = supabase.from("movimentacoes_estoque")
    .select("id, tipo, quantidade, ocorrido_em, observacao, estorno_de, variantes(sku, produtos(nome)), origem:locais_estoque!local_origem_id(nome), destino:locais_estoque!local_destino_id(nome), quem:pessoas!registrado_por(nome)")
    .order("ocorrido_em", { ascending: false }).limit(150);
  if (tipo && ROTULO_TIPO[tipo]) consulta = consulta.eq("tipo", tipo);
  const [{ data }, { data: locais }] = await Promise.all([
    consulta,
    supabase.from("locais_estoque").select("id, nome").is("arquivado_em", null).order("tipo").order("nome"),
  ]);
  const movimentos = (data ?? []) as unknown as Mov[];
  const { data: estornos } = movimentos.length
    ? await supabase.from("movimentacoes_estoque").select("estorno_de").in("estorno_de", movimentos.map((m) => m.id))
    : { data: [] };
  const estornadas = new Set((estornos ?? []).map((e) => e.estorno_de as number));
  const podeLancar = sessao.pode("estoque", "criar");
  const podeEstornar = sessao.pode("estoque", "aprovar");

  return (
    <>
      <Cabecalho titulo="Movimentações" descricao="O livro de estoque: toda entrada e saída de peça, com quem registrou. Nada é apagado; um erro se corrige com estorno." />
      <div className={podeLancar ? "grade-lateral" : undefined}>
        <section className="painel">
          <div className="painel-topo">
            <form className="filtros">
              <label htmlFor="filtro-tipo" style={{ fontSize: 13.5, fontWeight: 600 }}>Tipo</label>
              <select id="filtro-tipo" name="tipo" className="entrada" defaultValue={tipo ?? ""} style={{ width: 230 }}>
                <option value="">Todos</option>
                {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
              <button className="botao leve pequeno" type="submit">Filtrar</button>
            </form>
          </div>
          {movimentos.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Quando</th><th>Movimentação</th><th>Peça</th><th className="num">Qtd.</th><th>De → para</th>{podeEstornar && <th />}</tr></thead>
                <tbody>
                  {movimentos.map((m) => (
                    <tr key={m.id}>
                      <td className="mini">{quando(m.ocorrido_em)}<div>{m.quem?.nome ?? "Sistema"}</div></td>
                      <td>
                        {ROTULO_TIPO[m.tipo] ?? m.tipo}
                        {m.estorno_de && <div className="mini">desfaz o lançamento nº {m.estorno_de}</div>}
                        {estornadas.has(m.id) && <div><span className="etiqueta neutra">estornada</span></div>}
                        {m.observacao && <div className="mini">{m.observacao}</div>}
                      </td>
                      <td>{m.variantes?.produtos?.nome}<div className="mini">{m.variantes?.sku}</div></td>
                      <td className="num">{numero(m.quantidade)}</td>
                      <td className="mini">{m.origem?.nome ?? "Entrada"} → {m.destino?.nome ?? "Saída"}</td>
                      {podeEstornar && (
                        <td>
                          {m.tipo !== "estorno" && !estornadas.has(m.id) && (
                            <details>
                              <summary className="botao-link" style={{ fontSize: 13.5 }}>Estornar</summary>
                              <FormAcao acao={estornar} className="campos" >
                                <input type="hidden" name="id" value={m.id} />
                                <input className="entrada" name="motivo" placeholder="Motivo" required aria-label="Motivo do estorno" style={{ marginTop: 8, minWidth: 180 }} />
                                <BotaoEnviar className="botao perigo pequeno" enviando="Estornando…">Confirmar estorno</BotaoEnviar>
                              </FormAcao>
                            </details>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nenhuma movimentação" texto={tipo ? "Nenhum lançamento desse tipo ainda." : "Registre a primeira entrada de peças ao lado."} />}
        </section>
        {podeLancar && (
          <section className="painel">
            <div className="painel-topo"><div><h2>Registrar</h2><p>Vendas, facções e marketing lançam pelos próprios módulos.</p></div></div>
            <div className="painel-corpo"><FormMovimentacao acao={lancarMovimentacao} locais={(locais ?? []) as { id: string; nome: string }[]} /></div>
          </section>
        )}
      </div>
    </>
  );
}

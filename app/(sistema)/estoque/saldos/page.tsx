import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { numero } from "@/lib/formatos";

export const metadata = { title: "Saldos de estoque" };

type Variante = { id: string; sku: string; tamanho: string; produtos: { id: string; referencia: string; nome: string } | null; cores: { nome: string; hex: string | null } | null };

export default async function Saldos({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const sessao = await exigir("estoque");
  const { local } = await searchParams;
  const supabase = await supabaseServidor();
  const [{ data: locais }, { data: saldos }] = await Promise.all([
    supabase.from("locais_estoque").select("id, nome, tipo").is("arquivado_em", null).order("tipo").order("nome"),
    supabase.from("saldos_estoque").select("variante_id, local_id, saldo"),
  ]);
  const listaLocais = (locais ?? []) as { id: string; nome: string; tipo: string }[];
  const colunas = local ? listaLocais.filter((l) => l.id === local) : listaLocais.filter((l) => (saldos ?? []).some((s) => s.local_id === l.id));
  const ids = [...new Set((saldos ?? []).filter((s) => !local || s.local_id === local).map((s) => s.variante_id as string))];
  const { data: variantes } = ids.length
    ? await supabase.from("variantes").select("id, sku, tamanho, produtos(id, referencia, nome), cores(nome, hex)").in("id", ids).order("sku")
    : { data: [] };
  const linhas = (variantes ?? []) as unknown as Variante[];
  const valor = (v: string, l: string) => (saldos ?? []).find((s) => s.variante_id === v && s.local_id === l)?.saldo ?? 0;
  const totalLocal = (l: string) => (saldos ?? []).filter((s) => s.local_id === l).reduce((t, s) => t + s.saldo, 0);

  return (
    <>
      <Cabecalho titulo="Saldos de estoque" descricao="Quantas peças existem em cada lugar agora, calculado a partir de todas as movimentações."
        acoes={sessao.pode("estoque", "criar") && <Link className="botao" href="/estoque/movimentacoes">Registrar movimentação</Link>} />
      <section className="painel">
        <div className="painel-topo">
          <form className="filtros">
            <label htmlFor="local" style={{ fontSize: 13.5, fontWeight: 600 }}>Local</label>
            <select id="local" name="local" className="entrada" defaultValue={local ?? ""} style={{ width: 240 }}>
              <option value="">Todos os locais</option>
              {listaLocais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <button className="botao leve pequeno" type="submit">Filtrar</button>
          </form>
          <span style={{ color: "var(--suave)", fontSize: 14 }}>{numero(linhas.length)} variantes com saldo</span>
        </div>
        {linhas.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Produto</th><th>Cor</th><th>Tamanho</th>{colunas.map((l) => <th key={l.id} className="num">{l.nome}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {linhas.map((v) => {
                  const total = colunas.reduce((t, l) => t + valor(v.id, l.id), 0);
                  return (
                    <tr key={v.id}>
                      <td><Link className="linha-link" href={`/produto/catalogo/${v.produtos?.id}`}>{v.produtos?.referencia}</Link> {v.produtos?.nome}<div className="mini">{v.sku}</div></td>
                      <td><i className="amostra" style={{ background: v.cores?.hex ?? "#fff", marginRight: 6 }} />{v.cores?.nome}</td>
                      <td>{v.tamanho}</td>
                      {colunas.map((l) => <td key={l.id} className="num">{numero(valor(v.id, l.id)) }</td>)}
                      <td className="num"><strong>{numero(total)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}><strong>Total</strong></td>{colunas.map((l) => <td key={l.id} className="num"><strong>{numero(totalLocal(l.id))}</strong></td>)}<td className="num"><strong>{numero(colunas.reduce((t, l) => t + totalLocal(l.id), 0))}</strong></td></tr></tfoot>
            </table>
          </div>
        ) : (
          <Vazio titulo="Nenhuma peça em estoque" texto="O saldo aparece aqui quando a primeira entrada de produção ou ajuste de inventário for registrada.">
            {sessao.pode("estoque", "criar") && <Link className="botao" href="/estoque/movimentacoes">Registrar entrada</Link>}
          </Vazio>
        )}
      </section>
    </>
  );
}

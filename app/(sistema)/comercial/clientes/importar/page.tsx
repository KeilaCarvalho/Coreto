import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { ImportarClientes } from "@/components/importar-clientes";
import { TIPOS_RELATORIO } from "@/lib/clientes";
import { numero, quando } from "@/lib/formatos";
import { desfazerImportacao, importarClientes } from "../../acoes";

export const metadata = { title: "Importar clientes" };

type Importacao = { id: string; arquivo: string; tipo: string; mes: string | null; registros: number; ignorados: number; criado_em: string; quem: { nome: string } | null };

export default async function Importar() {
  await exigir("comercial", "aprovar");
  const supabase = await supabaseServidor();
  const [{ data }, { count: semVendedora }, { data: nomesSoltos }] = await Promise.all([
    supabase.from("importacoes_clientes").select("id, arquivo, tipo, mes, registros, ignorados, criado_em, quem:pessoas!criado_por(nome)").order("criado_em", { ascending: false }).limit(50),
    supabase.from("clientes").select("id", { count: "exact", head: true }).is("vendedora_id", null).is("arquivado_em", null),
    supabase.from("clientes").select("vendedora_nome").is("vendedora_id", null).not("vendedora_nome", "is", null).limit(1000),
  ]);
  const importacoes = (data ?? []) as unknown as Importacao[];
  const soltos = [...new Set((nomesSoltos ?? []).map((n) => n.vendedora_nome as string))].sort();

  return (
    <>
      <Cabecalho trilha={[{ rotulo: "Clientes", href: "/comercial/clientes" }]} titulo="Importar clientes"
        descricao="Os mesmos relatórios do sistema de vendas que você já usava. O sistema reconhece o modelo sozinho e mostra uma prévia antes de gravar." />

      {soltos.length > 0 && (
        <p className="aviso alerta">
          {numero(semVendedora ?? 0)} clientes estão sem vendedora porque estes nomes dos relatórios ainda não foram ligados a ninguém da equipe: {soltos.join(", ")}. Ligue em Equipe, no campo “Nome nos relatórios”.
        </p>
      )}

      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo"><div><h2>Novo arquivo</h2><p>Importar de novo o mesmo relatório não duplica: as clientes são atualizadas pelo código e as vendas pelo número.</p></div></div>
          <div className="painel-corpo"><ImportarClientes importar={importarClientes} /></div>
        </section>
        <section className="painel">
          <div className="painel-topo"><div><h2>Ordem recomendada</h2></div></div>
          <ol className="painel-corpo" style={{ paddingLeft: 40, display: "grid", gap: 10, fontSize: 13.5 }}>
            <li><strong>Carteira do sistema antigo</strong> (CSV), uma vez, para trazer etapas e retornos já marcados.</li>
            <li><strong>Clientes · primeira compra</strong>: cria as clientes novas na carteira da vendedora.</li>
            <li><strong>Aniversariantes</strong>: completa CPF, nascimento e telefones.</li>
            <li><strong>Vendas por vendedor</strong>: atualiza última compra, número de compras e total.</li>
          </ol>
        </section>
      </div>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2>Importações feitas</h2><p>Desfazer remove as vendas daquele arquivo. Os cadastros das clientes ficam.</p></div></div>
        {importacoes.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Arquivo</th><th>Tipo</th><th className="num">Linhas</th><th>Quando</th><th /></tr></thead>
              <tbody>
                {importacoes.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.arquivo}</strong>{i.mes && <div className="mini">período {i.mes.split("-").reverse().join("/")}</div>}</td>
                    <td>{TIPOS_RELATORIO[i.tipo] ?? i.tipo}</td>
                    <td className="num">{numero(i.registros)}{i.ignorados ? <div className="mini">{numero(i.ignorados)} ignoradas</div> : null}</td>
                    <td className="mini">{quando(i.criado_em)}{i.quem ? `, ${i.quem.nome}` : ""}</td>
                    <td className="num">
                      {i.tipo === "vendas_vendedora" && (
                        <form action={desfazerImportacao}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="botao perigo pequeno" type="submit">Desfazer</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="painel-corpo mini">Nenhuma importação ainda.</p>}
      </section>
    </>
  );
}

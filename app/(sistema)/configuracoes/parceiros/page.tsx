import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarParceiro } from "../acoes";

export const metadata = { title: "Parceiros" };

const TIPOS: Record<string, string> = { faccao: "Facção", cortador: "Cortador", fornecedor: "Fornecedor", fotografo: "Fotógrafo", modelo: "Modelo", influenciadora: "Influenciadora", outro: "Outro" };

export default async function Parceiros({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sessao = await exigir("configuracoes");
  const { tipo } = await searchParams;
  const supabase = await supabaseServidor();
  let consulta = supabase.from("parceiros").select("id, tipo, nome, contato, telefone, cidade").is("arquivado_em", null).order("nome");
  if (tipo && TIPOS[tipo]) consulta = consulta.eq("tipo", tipo);
  const { data } = await consulta;
  const podeCriar = sessao.pode("configuracoes", "editar") || sessao.pode("producao", "criar");

  return (
    <>
      <Cabecalho titulo="Parceiros" descricao="Facções, fornecedores e quem trabalha com o marketing. Cada facção ganha um local de estoque para acompanhar as peças que estão com ela." />
      <div className={podeCriar ? "grade-lateral" : undefined}>
        <section className="painel">
          <div className="painel-topo">
            <nav className="filtros" aria-label="Filtrar por tipo">
              <a className={`botao pequeno${tipo ? " leve" : ""}`} href="/configuracoes/parceiros">Todos</a>
              {Object.entries(TIPOS).map(([valor, rotulo]) => (
                <a key={valor} className={`botao pequeno${tipo === valor ? "" : " leve"}`} href={`/configuracoes/parceiros?tipo=${valor}`}>{rotulo}</a>
              ))}
            </nav>
          </div>
          {data?.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Contato</th><th>Cidade</th></tr></thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nome}</strong></td>
                      <td>{TIPOS[p.tipo]}</td>
                      <td>{p.contato}<div className="mini">{p.telefone}</div></td>
                      <td>{p.cidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nenhum parceiro" texto="Comece pelas facções: elas serão usadas nas ordens de produção da Fase 2." />}
        </section>
        {podeCriar && (
          <section className="painel">
            <div className="painel-topo"><div><h2>Novo parceiro</h2></div></div>
            <div className="painel-corpo">
              <FormAcao acao={criarParceiro} className="campos" limparAoSalvar>
                <div className="campo">
                  <label htmlFor="tipo">Tipo</label>
                  <select id="tipo" name="tipo" defaultValue={tipo ?? "faccao"} required>
                    {Object.entries(TIPOS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                  </select>
                </div>
                <div className="campo"><label htmlFor="nome">Nome</label><input id="nome" name="nome" required /></div>
                <div className="campo"><label htmlFor="contato">Pessoa de contato</label><input id="contato" name="contato" /></div>
                <div className="campo"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" inputMode="tel" /></div>
                <div className="campo"><label htmlFor="cidade">Cidade</label><input id="cidade" name="cidade" defaultValue="Goiânia" /></div>
                <div className="campo"><label htmlFor="documento">CPF ou CNPJ</label><input id="documento" name="documento" /></div>
                <div className="campo"><label htmlFor="pix">Chave Pix</label><input id="pix" name="pix" /></div>
                <BotaoEnviar>Cadastrar parceiro</BotaoEnviar>
              </FormAcao>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

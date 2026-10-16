import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarPessoa } from "../../configuracoes/acoes";
import { salvarNomeVendas } from "../../comercial/acoes";

export const metadata = { title: "Equipe" };

export default async function Equipe() {
  const sessao = await exigir("pessoas");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("pessoas")
    .select("id, nome, apelido, cargo, telefone, e_vendedora, nome_vendas, acesso_ativo, perfis(nome)")
    .eq("e_funcionaria", true).is("arquivado_em", null).order("nome");
  type Pessoa = { id: string; nome: string; apelido: string | null; cargo: string | null; telefone: string | null; e_vendedora: boolean; nome_vendas: string | null; acesso_ativo: boolean; perfis: { nome: string } | null };
  const equipe = (data ?? []) as unknown as Pessoa[];
  const podeCriar = sessao.pode("pessoas", "criar");
  const podeEditar = sessao.pode("pessoas", "editar") || sessao.pode("configuracoes", "editar");

  return (
    <>
      <Cabecalho titulo="Equipe" descricao="Um cadastro único por pessoa. Vendas, comissões, retiradas e folha passam a apontar para cá, não para o nome digitado." />
      <div className={podeCriar ? "grade-lateral" : undefined}>
        <section className="painel">
          {equipe.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Cargo</th><th>Telefone</th><th>Nome nos relatórios</th><th>No sistema</th></tr></thead>
                <tbody>
                  {equipe.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nome}</strong>{p.e_vendedora && <> <span className="etiqueta ok" style={{ marginLeft: 6 }}>vendedora</span></>}</td>
                      <td>{p.cargo ?? "—"}</td>
                      <td>{p.telefone ?? "—"}</td>
                      <td>
                        {podeEditar ? (
                          <FormAcao acao={salvarNomeVendas} className="filtros">
                            <input type="hidden" name="id" value={p.id} />
                            <input className="entrada" name="nome_vendas" defaultValue={p.nome_vendas ?? ""} placeholder="Como sai no relatório" aria-label={`Nome de ${p.nome} nos relatórios`} style={{ minWidth: 150, minHeight: 36, padding: "6px 12px" }} />
                            <BotaoEnviar className="botao leve pequeno">Ligar</BotaoEnviar>
                          </FormAcao>
                        ) : <span className="mini">{p.nome_vendas ?? "—"}</span>}
                      </td>
                      <td className="mini">{p.acesso_ativo ? p.perfis?.nome : "Sem login"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Equipe vazia" texto="Cadastre quem trabalha na Coreto." />}
        </section>
        {podeCriar && (
          <section className="painel">
            <div className="painel-topo"><div><h2>Adicionar pessoa</h2><p>Login e perfil são definidos em Configurações, Acessos.</p></div></div>
            <div className="painel-corpo">
              <FormAcao acao={criarPessoa} className="campos" limparAoSalvar>
                <div className="campo"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required /></div>
                <div className="campo"><label htmlFor="apelido">Como é chamada</label><input id="apelido" name="apelido" /></div>
                <div className="campo"><label htmlFor="cargo">Cargo</label><input id="cargo" name="cargo" placeholder="Vendedora, costureira, conferente…" /></div>
                <div className="campo"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" inputMode="tel" /></div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name="e_vendedora" />Vende na loja (entra no ranking e na comissão)</label>
                <div className="campo"><label htmlFor="nome_vendas">Nome nos relatórios de venda</label><input id="nome_vendas" name="nome_vendas" placeholder="Ex.: BRUNA S" /><span className="ajuda">Como ela aparece no sistema de vendas. Liga a carteira de clientes a ela.</span></div>
                <BotaoEnviar>Adicionar</BotaoEnviar>
              </FormAcao>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

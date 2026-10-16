import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarCor, criarGrade, criarSimples } from "../acoes";

export const metadata = { title: "Cadastros" };

export default async function Cadastros() {
  const sessao = await exigir("configuracoes");
  const supabase = await supabaseServidor();
  const [cores, grades, categorias, colecoes] = await Promise.all([
    supabase.from("cores").select("id, nome, codigo, hex").is("arquivado_em", null).order("nome"),
    supabase.from("grades").select("id, nome, grade_tamanhos(tamanho, ordem)").is("arquivado_em", null).order("nome"),
    supabase.from("categorias").select("id, nome, ncm").is("arquivado_em", null).order("nome"),
    supabase.from("colecoes").select("id, nome, lancamento").is("arquivado_em", null).order("nome"),
  ]);
  const pode = sessao.pode("produto", "criar");

  return (
    <>
      <Cabecalho titulo="Cadastros" descricao="As listas que todos os produtos usam. Cadastre uma vez e escolha nos formulários, sem digitar de novo." />
      <div className="grade-2">
        <section className="painel">
          <div className="painel-topo"><div><h2>Cores</h2><p>O código curto entra no SKU (ex.: VL001-VAG-M).</p></div></div>
          <ul className="lista-simples">
            {(cores.data ?? []).map((c) => (
              <li key={c.id}><span><i className="amostra" style={{ background: c.hex ?? "#fff", marginRight: 8 }} />{c.nome}</span><span className="mini" style={{ color: "var(--suave)" }}>{c.codigo ?? "sem código"}</span></li>
            ))}
            {!cores.data?.length && <li style={{ color: "var(--suave)" }}>Nenhuma cor ainda.</li>}
          </ul>
          {pode && (
            <div className="painel-corpo" style={{ borderTop: "1px solid var(--linha)" }}>
              <FormAcao acao={criarCor} limparAoSalvar>
                <div className="campos tres">
                  <div className="campo"><label htmlFor="cor-nome">Nome</label><input id="cor-nome" name="nome" placeholder="Verde água" required /></div>
                  <div className="campo"><label htmlFor="cor-codigo">Código</label><input id="cor-codigo" name="codigo" placeholder="VAG" maxLength={4} style={{ textTransform: "uppercase" }} /></div>
                  <div className="campo"><label htmlFor="cor-hex">Amostra</label><input id="cor-hex" name="hex" type="color" defaultValue="#46d7ac" style={{ width: "100%", height: 42, border: "1px solid var(--linha-forte)", borderRadius: 8, padding: 4, background: "#fff" }} /></div>
                </div>
                <div className="formulario-rodape"><BotaoEnviar>Adicionar cor</BotaoEnviar></div>
              </FormAcao>
            </div>
          )}
        </section>

        <section className="painel">
          <div className="painel-topo"><div><h2>Grades de tamanho</h2><p>A ordem dos tamanhos é a ordem das colunas na grade.</p></div></div>
          <ul className="lista-simples">
            {(grades.data ?? []).map((g) => (
              <li key={g.id}><span>{g.nome}</span><span className="mini" style={{ color: "var(--suave)" }}>{[...g.grade_tamanhos].sort((a, b) => a.ordem - b.ordem).map((t) => t.tamanho).join(", ")}</span></li>
            ))}
          </ul>
          {pode && (
            <div className="painel-corpo" style={{ borderTop: "1px solid var(--linha)" }}>
              <FormAcao acao={criarGrade} limparAoSalvar>
                <div className="campos duas">
                  <div className="campo"><label htmlFor="grade-nome">Nome</label><input id="grade-nome" name="nome" placeholder="Plus size" required /></div>
                  <div className="campo"><label htmlFor="grade-tam">Tamanhos</label><input id="grade-tam" name="tamanhos" placeholder="G1, G2, G3" required /><span className="ajuda">Separados por vírgula, na ordem.</span></div>
                </div>
                <div className="formulario-rodape"><BotaoEnviar>Criar grade</BotaoEnviar></div>
              </FormAcao>
            </div>
          )}
        </section>

        <section className="painel">
          <div className="painel-topo"><div><h2>Categorias</h2><p>O NCM da categoria vira o padrão dos produtos dela.</p></div></div>
          <ul className="lista-simples">
            {(categorias.data ?? []).map((c) => <li key={c.id}><span>{c.nome}</span><span className="mini" style={{ color: "var(--suave)" }}>{c.ncm ? `NCM ${c.ncm}` : "sem NCM"}</span></li>)}
            {!categorias.data?.length && <li style={{ color: "var(--suave)" }}>Nenhuma categoria ainda.</li>}
          </ul>
          {pode && (
            <div className="painel-corpo" style={{ borderTop: "1px solid var(--linha)" }}>
              <FormAcao acao={criarSimples} limparAoSalvar>
                <input type="hidden" name="tabela" value="categorias" />
                <div className="campos duas">
                  <div className="campo"><label htmlFor="cat-nome">Nome</label><input id="cat-nome" name="nome" placeholder="Vestidos" required /></div>
                  <div className="campo"><label htmlFor="cat-ncm">NCM</label><input id="cat-ncm" name="ncm" inputMode="numeric" placeholder="Opcional" /></div>
                </div>
                <div className="formulario-rodape"><BotaoEnviar>Adicionar categoria</BotaoEnviar></div>
              </FormAcao>
            </div>
          )}
        </section>

        <section className="painel">
          <div className="painel-topo"><div><h2>Coleções</h2></div></div>
          <ul className="lista-simples">
            {(colecoes.data ?? []).map((c) => <li key={c.id}><span>{c.nome}</span><span className="mini" style={{ color: "var(--suave)" }}>{c.lancamento ? new Date(c.lancamento + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span></li>)}
            {!colecoes.data?.length && <li style={{ color: "var(--suave)" }}>Nenhuma coleção ainda.</li>}
          </ul>
          {pode && (
            <div className="painel-corpo" style={{ borderTop: "1px solid var(--linha)" }}>
              <FormAcao acao={criarSimples} limparAoSalvar>
                <input type="hidden" name="tabela" value="colecoes" />
                <div className="campos duas">
                  <div className="campo"><label htmlFor="col-nome">Nome</label><input id="col-nome" name="nome" placeholder="Verão 2027" required /></div>
                  <div className="campo"><label htmlFor="col-data">Lançamento</label><input id="col-data" name="lancamento" type="date" /></div>
                </div>
                <div className="formulario-rodape"><BotaoEnviar>Adicionar coleção</BotaoEnviar></div>
              </FormAcao>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

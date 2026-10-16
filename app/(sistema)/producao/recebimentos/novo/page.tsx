import Link from "next/link";
import { redirect } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { GradeQuantidades } from "@/components/grade-quantidades";
import { montarGrade, ordenarTamanhos, type VarianteGrade } from "@/lib/grade";
import { reais } from "@/lib/formatos";
import { registrarRecebimento } from "../../acoes";

export const metadata = { title: "Registrar chegada" };

type Produto = {
  id: string; referencia: string; nome: string; preco_venda: number | null;
  grades: { grade_tamanhos: { tamanho: string; ordem: number }[] } | null;
  variantes: VarianteGrade[];
};

export default async function NovoRecebimento({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const sessao = await exigir("producao");
  if (!sessao.pode("producao", "criar") && !sessao.pode("estoque", "criar")) redirect("/producao/recebimentos");
  const { produto: produtoId } = await searchParams;
  const supabase = await supabaseServidor();

  const [{ data: produtos }, { data: faccoes }] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome").is("arquivado_em", null).order("referencia"),
    supabase.from("parceiros").select("id, nome").eq("tipo", "faccao").is("arquivado_em", null).order("nome"),
  ]);

  let produto: Produto | null = null;
  if (produtoId && /^[0-9a-f-]{36}$/i.test(produtoId)) {
    const { data } = await supabase.from("produtos")
      .select("id, referencia, nome, preco_venda, grades(grade_tamanhos(tamanho, ordem)), variantes(id, cor_id, tamanho, ativa, cores(nome, hex))")
      .eq("id", produtoId).maybeSingle();
    produto = data as unknown as Produto | null;
  }
  const podeCriarProduto = sessao.pode("produto", "criar");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Cabecalho trilha={[{ rotulo: "Chegada da facção", href: "/producao/recebimentos" }]} titulo="Registrar chegada"
        descricao="Escolha o modelo e conte as peças por cor e tamanho. Elas ficam aguardando liberação até você liberar." />

      <section className="painel" style={{ marginBottom: 16 }}>
        <div className="painel-topo"><div><h2>1. Modelo</h2><p>O modelo precisa estar no catálogo, com as cores que a facção produziu.</p></div></div>
        <div className="painel-corpo">
          {(produtos ?? []).length ? (
            <form className="filtros">
              <select name="produto" className="entrada" defaultValue={produto?.id ?? ""} aria-label="Modelo" required style={{ minWidth: 300 }}>
                <option value="" disabled>Escolha o modelo</option>
                {(produtos ?? []).map((p) => <option key={p.id} value={p.id}>{p.referencia} · {p.nome}</option>)}
              </select>
              <button className="botao leve pequeno" type="submit">Usar este modelo</button>
              {podeCriarProduto && <Link className="botao-link" href="/produto/catalogo/novo?voltar=recebimento">ou cadastrar um modelo novo</Link>}
            </form>
          ) : (
            <Vazio titulo="Nenhum modelo no catálogo" texto="Cadastre o modelo com a grade de cores e tamanhos antes de registrar a chegada.">
              {podeCriarProduto && <Link className="botao" href="/produto/catalogo/novo?voltar=recebimento"><Icone nome="mais" />Cadastrar modelo</Link>}
            </Vazio>
          )}
        </div>
      </section>

      {produto && (() => {
        const tamanhos = ordenarTamanhos(produto.grades?.grade_tamanhos);
        const { linhas, celulas } = montarGrade(produto.variantes);
        return (
          <section className="painel">
            <div className="painel-topo">
              <div><h2>2. Contagem · {produto.nome}</h2><p>Deixe em branco o que não chegou. {produto.preco_venda == null ? "Este modelo ainda não tem preço: o lote vai aguardar a precificação." : `Preço atual ${reais(produto.preco_venda)}.`}</p></div>
              {sessao.pode("produto", "editar") && <Link className="botao leve pequeno" href={`/produto/catalogo/${produto.id}`}>Faltou uma cor? Edite o modelo</Link>}
            </div>
            <div className="painel-corpo">
              <FormAcao acao={registrarRecebimento}>
                <input type="hidden" name="produto_id" value={produto.id} />
                <div className="campos tres" style={{ marginBottom: 18 }}>
                  <div className="campo">
                    <label htmlFor="parceiro_id">Facção</label>
                    <select id="parceiro_id" name="parceiro_id" defaultValue="">
                      <option value="">Não informar</option>
                      {(faccoes ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    {!(faccoes ?? []).length && <span className="ajuda">Cadastre as facções em Configurações → Parceiros.</span>}
                  </div>
                  <div className="campo">
                    <label htmlFor="recebido_em">Data da chegada</label>
                    <input id="recebido_em" name="recebido_em" type="date" defaultValue={hoje} max={hoje} required />
                  </div>
                  <div className="campo">
                    <label htmlFor="observacao">Observação</label>
                    <input id="observacao" name="observacao" placeholder="Opcional" />
                  </div>
                </div>
                {linhas.length
                  ? <GradeQuantidades linhas={linhas} tamanhos={tamanhos} celulas={celulas} />
                  : <p className="aviso alerta">Este modelo não tem cores ativas. Edite o modelo e escolha as cores.</p>}
                <div className="formulario-rodape"><BotaoEnviar enviando="Registrando…">Registrar chegada</BotaoEnviar></div>
              </FormAcao>
            </div>
          </section>
        );
      })()}
    </>
  );
}

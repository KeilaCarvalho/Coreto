import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { listasDoProduto } from "@/lib/consultas";
import { Cabecalho } from "@/components/cabecalho";
import { CamposProduto, EscolhaCores } from "@/components/campos-produto";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { criarProduto } from "../../acoes";

export const metadata = { title: "Novo produto" };

export default async function NovoProduto({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  await exigir("produto", "criar");
  const { voltar } = await searchParams;
  const listas = await listasDoProduto();
  return (
    <>
      <Cabecalho titulo="Novo produto" trilha={[{ rotulo: "Catálogo", href: "/produto/catalogo" }]}
        descricao="Ao salvar, o sistema cria uma variante para cada cor e tamanho, com SKU e código de barras próprios." />
      <section className="painel">
        <div className="painel-corpo">
          <FormAcao acao={criarProduto}>
            {voltar === "recebimento" && <input type="hidden" name="voltar" value="recebimento" />}
            <CamposProduto grades={listas.grades} categorias={listas.categorias} colecoes={listas.colecoes} valores={{ grade_id: listas.grades[0]?.id }} />
            <div style={{ marginTop: 22 }}>
              {listas.cores.length ? <EscolhaCores cores={listas.cores} /> : (
                <p className="aviso alerta">Nenhuma cor cadastrada ainda. <Link href="/configuracoes/cadastros">Cadastre as cores</Link> antes de criar produtos.</p>
              )}
            </div>
            <div className="formulario-rodape">
              <Link className="botao secundario" href={voltar === "recebimento" ? "/producao/recebimentos/novo" : "/produto/catalogo"}>Cancelar</Link>
              <BotaoEnviar enviando="Criando grade…">Criar produto</BotaoEnviar>
            </div>
          </FormAcao>
        </div>
      </section>
    </>
  );
}

import { supabaseServidor } from "@/lib/supabase/server";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { FichaCusto, type ItemFicha, type Taxas } from "@/components/ficha-custo";
import type { InsumoSalvo } from "@/components/insumos/lancar-nota";
import { CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { quando } from "@/lib/formatos";
import { salvarFicha } from "@/app/(sistema)/produto/acoes";

type Produto = {
  id: string; referencia: string; nome: string; preco_venda: number | null;
  fichas_custo: { simples: number; cartao: number; comissao: number; despesas_fixas: number; lucro_desejado: number; observacao: string | null; atualizado_em: string } | null;
};
type Item = { tipo: ItemFicha["tipo"]; descricao: string; quantidade: number; unidade: string | null; valor_unitario: number };
const campo = (v: number) => String(v).replace(".", ",");

/** Janela lateral "Precificar": custo da peça, percentuais e preço de venda de um modelo. */
export async function JanelaFicha({ produtoId, param, valor, limpar }: { produtoId: string; param: string; valor: string; limpar?: string[] }) {
  const supabase = await supabaseServidor();
  const [{ data }, { data: itensR }, { data: cfg }, { data: insR }] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome, preco_venda, fichas_custo(simples, cartao, comissao, despesas_fixas, lucro_desejado, observacao, atualizado_em)").eq("id", produtoId).maybeSingle(),
    supabase.from("ficha_custo_itens").select("tipo, descricao, quantidade, unidade, valor_unitario").eq("produto_id", produtoId).order("ordem"),
    supabase.from("config_precificacao").select("simples, cartao, comissao, despesas_fixas, lucro_desejado, itens_padrao").eq("id", 1).maybeSingle(),
    supabase.from("insumos").select("nome, tipo, unidade, ultimo_preco, ultimo_preco_em").is("arquivado_em", null).order("nome"),
  ]);
  if (!data) return null;
  const produto = data as unknown as Produto;
  const base = produto.fichas_custo ?? cfg ?? { simples: 0, cartao: 0, comissao: 0, despesas_fixas: 0, lucro_desejado: 30 };
  const taxas: Taxas = {
    simples: campo(base.simples), cartao: campo(base.cartao), comissao: campo(base.comissao),
    despesas_fixas: campo(base.despesas_fixas), lucro_desejado: campo(base.lucro_desejado),
  };
  const paraCampo = (i: Item): ItemFicha => ({
    tipo: i.tipo, descricao: i.descricao, quantidade: campo(Number(i.quantidade)), unidade: i.unidade ?? "", valor_unitario: campo(Number(i.valor_unitario)),
  });
  // Itens padrão (mão de obra e outros custos que se repetem): já vêm preenchidos na primeira precificação do modelo.
  const padrao = (Array.isArray((cfg as { itens_padrao?: unknown } | null)?.itens_padrao) ? (cfg as { itens_padrao: Item[] }).itens_padrao : []).map(paraCampo);
  const salvos = ((itensR ?? []) as Item[]).map(paraCampo);
  const itens: ItemFicha[] = salvos.length ? salvos : padrao.length ? [{ tipo: "material", descricao: "", quantidade: "1", unidade: "m", valor_unitario: "" }, ...padrao] : [];
  const sub = `${produto.referencia} · ${produto.fichas_custo ? `ficha atualizada em ${quando(produto.fichas_custo.atualizado_em)}` : "primeira precificação"}`;

  return (
    <JanelaLateral param={param} valor={valor} limpar={limpar} larga titulo={`Precificar ${produto.nome}`} subtitulo={sub}>
      <FormAcao acao={salvarFicha}>
        <input type="hidden" name="produto_id" value={produto.id} />
        <FichaCusto itensIniciais={itens} taxasIniciais={taxas} precoAtual={produto.preco_venda} insumos={(insR ?? []) as InsumoSalvo[]} temPadrao={padrao.length > 0} veioDoPadrao={!salvos.length && padrao.length > 0} />
        <div className="bloco-janela">
          <div className="campo">
            <label htmlFor="observacao">Observação</label>
            <input id="observacao" name="observacao" defaultValue={produto.fichas_custo?.observacao ?? ""} placeholder="Ex.: preços das notas de outubro" />
          </div>
        </div>
        <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar preço</BotaoEnviar></div>
      </FormAcao>
    </JanelaLateral>
  );
}

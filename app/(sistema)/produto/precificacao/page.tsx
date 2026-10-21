import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { Kpi } from "@/components/painel";
import { Suspense } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { JanelaFicha } from "@/components/precificacao/janela-ficha";
import { numero, reais } from "@/lib/formatos";
import { salvarPercentuaisPadrao } from "../acoes";

export const metadata = { title: "Precificação" };

type Linha = {
  id: string; referencia: string; nome: string; preco_venda: number | null; custo_previsto: number | null;
  fichas_custo: { simples: number; cartao: number; comissao: number; despesas_fixas: number; preco_sugerido: number | null } | null;
};
type Config = { simples: number; cartao: number; comissao: number; despesas_fixas: number; lucro_desejado: number };

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const campo = (v: number) => String(v).replace(".", ",");

export default async function Precificacao({ searchParams }: { searchParams: Promise<{ ver?: string; precificar?: string; padrao?: string }> }) {
  const sessao = await exigir("produto", "editar");
  const { ver = "todos", precificar } = await searchParams;
  const supabase = await supabaseServidor();
  const [{ data }, { data: cfg }, { data: aguardando }] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome, preco_venda, custo_previsto, fichas_custo(simples, cartao, comissao, despesas_fixas, preco_sugerido)").is("arquivado_em", null).order("referencia"),
    supabase.from("config_precificacao").select("simples, cartao, comissao, despesas_fixas, lucro_desejado").eq("id", 1).maybeSingle(),
    supabase.from("recebimentos_resumo").select("produto_id, aguardando").eq("situacao", "sem_preco"),
  ]);
  const config = (cfg ?? { simples: 0, cartao: 0, comissao: 0, despesas_fixas: 0, lucro_desejado: 30 }) as Config;
  const esperando = new Map<string, number>();
  for (const a of aguardando ?? []) esperando.set(a.produto_id, (esperando.get(a.produto_id) ?? 0) + a.aguardando);

  const produtos = ((data ?? []) as unknown as Linha[]).map((p) => {
    const f = p.fichas_custo;
    const taxas = f ? f.simples + f.cartao + f.comissao + f.despesas_fixas : config.simples + config.cartao + config.comissao + config.despesas_fixas;
    const margem = p.preco_venda && p.custo_previsto != null ? ((p.preco_venda * (1 - taxas / 100) - p.custo_previsto) / p.preco_venda) * 100 : null;
    return { ...p, margem, esperando: esperando.get(p.id) ?? 0 };
  }).sort((a, b) => b.esperando - a.esperando || Number(a.preco_venda != null) - Number(b.preco_venda != null) || a.referencia.localeCompare(b.referencia));

  const semPreco = produtos.filter((p) => p.preco_venda == null);
  const semFicha = produtos.filter((p) => !p.fichas_custo);
  const abaixo = produtos.filter((p) => p.margem != null && p.margem < config.lucro_desejado);
  const lista = ver === "sem_preco" ? semPreco : ver === "sem_ficha" ? semFicha : ver === "abaixo" ? abaixo : produtos;
  const podePadrao = sessao.pode("configuracoes", "editar") || sessao.pode("financeiro", "editar");

  return (
    <>
      <Cabecalho titulo="Precificação" descricao="Custo de cada peça e o preço que cobre impostos, taxas, despesas e o lucro que você quer."
        acoes={podePadrao && <Link className="botao leve" href={`/produto/precificacao?ver=${ver}&padrao=1`} scroll={false}><Icone nome="lapis" />Percentuais padrão</Link>} />
      <Suspense><AvisoDaUrl /></Suspense>
      <div className="kpis">
        <Kpi destaque titulo="Sem preço" valor={numero(semPreco.length)} nota={esperando.size ? `${esperando.size} com peças esperando` : "modelos sem preço de venda"} href="/produto/precificacao?ver=sem_preco" />
        <Kpi titulo="Sem ficha de custo" valor={numero(semFicha.length)} nota="custo ainda não calculado" href="/produto/precificacao?ver=sem_ficha" />
        <Kpi titulo="Lucro abaixo da meta" valor={numero(abaixo.length)} nota={`menos de ${pct(config.lucro_desejado)} limpo`} href="/produto/precificacao?ver=abaixo" />
        <Kpi titulo="Taxas padrão" valor={pct(config.simples + config.cartao + config.comissao + config.despesas_fixas)} nota={`+ ${pct(config.lucro_desejado)} de lucro`} />
      </div>

      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo">
            <nav className="abas" aria-label="Filtrar produtos">
              {[["todos", "Todos"], ["sem_preco", "Sem preço"], ["sem_ficha", "Sem ficha"], ["abaixo", "Lucro abaixo da meta"]].map(([v, r]) => (
                <Link key={v} href={`/produto/precificacao?ver=${v}`} className={ver === v ? "ativa" : undefined} aria-current={ver === v ? "page" : undefined}>{r}</Link>
              ))}
            </nav>
          </div>
          {lista.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Produto</th><th className="num">Custo</th><th className="num">Sugerido</th><th className="num">Preço</th><th className="num">Lucro real</th><th /></tr></thead>
                <tbody>
                  {lista.map((p) => (
                    <LinhaClicavel key={p.id} href={`/produto/precificacao?ver=${ver}&precificar=${p.id}`}>
                      <td>
                        <Link className="linha-link" href={`/produto/precificacao?ver=${ver}&precificar=${p.id}`} scroll={false}>{p.nome}</Link>
                        <div className="mini">{p.referencia}{p.esperando ? ` · ${numero(p.esperando)} peças esperando preço` : ""}</div>
                      </td>
                      <td className="num">{p.fichas_custo ? reais(p.custo_previsto) : <span className="etiqueta neutra">sem ficha</span>}</td>
                      <td className="num mini">{reais(p.fichas_custo?.preco_sugerido)}</td>
                      <td className="num">{p.preco_venda != null ? <strong>{reais(p.preco_venda)}</strong> : <span className="etiqueta alerta">sem preço</span>}</td>
                      <td className="num">{p.margem != null ? <span className={`etiqueta ${p.margem < 0 ? "erro" : p.margem < config.lucro_desejado ? "alerta" : "ok"}`}>{pct(p.margem)}</span> : "—"}</td>
                      <td className="num"><Link className={`botao pequeno${p.preco_venda != null ? " leve" : ""}`} href={`/produto/precificacao?ver=${ver}&precificar=${p.id}`} scroll={false}><Icone nome={p.preco_venda != null ? "lapis" : "cifrao"} />{p.preco_venda != null ? "Editar" : "Precificar"}</Link></td>
                    </LinhaClicavel>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nada aqui" texto={ver === "todos" ? "Cadastre produtos no catálogo para precificar." : "Nenhum produto nesta situação."} />}
        </section>

        <section className="painel">
          <div className="painel-topo"><div><h2>Percentuais padrão</h2><p>Usados em toda ficha nova. Cada ficha pode ter os seus.</p></div></div>
          <div className="painel-corpo">
            <ul className="lista-simples">
              <li>Simples Nacional <strong>{pct(config.simples)}</strong></li>
              <li>Taxa do cartão <strong>{pct(config.cartao)}</strong></li>
              <li>Comissão <strong>{pct(config.comissao)}</strong></li>
              <li>Despesas fixas <strong>{pct(config.despesas_fixas)}</strong></li>
              <li>Lucro desejado <strong>{pct(config.lucro_desejado)}</strong></li>
            </ul>
            <p className="mini" style={{ marginTop: 14 }}><Icone nome="alerta" tamanho={14} /> Confirme a alíquota do Simples e o percentual de despesas fixas com a contabilidade.</p>
          </div>
        </section>
      </div>

      {precificar && /^[0-9a-f-]{36}$/i.test(precificar) && (
        <Suspense><JanelaFicha produtoId={precificar} param="precificar" valor={precificar} /></Suspense>
      )}
      {podePadrao && (
        <Suspense>
          <JanelaLateral param="padrao" titulo="Percentuais padrão" subtitulo="Vêm preenchidos em toda precificação nova. Cada modelo pode ter os seus.">
            <FormAcao acao={salvarPercentuaisPadrao}>
              <div className="bloco-janela">
                <div className="ficha-taxas" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  {([["simples", "Simples Nacional"], ["cartao", "Taxa do cartão"], ["comissao", "Comissão"], ["despesas_fixas", "Despesas fixas"], ["lucro_desejado", "Lucro desejado"]] as const).map(([k, r]) => (
                    <label key={k}><span>{r}</span><div className="ficha-pct"><input className="fx-in valor" name={k} inputMode="decimal" defaultValue={campo(config[k])} /><i>%</i></div></label>
                  ))}
                </div>
                <p className="mini" style={{ marginTop: 12 }}>Confirme a alíquota do Simples e o percentual de despesas fixas com a contabilidade.</p>
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar percentuais</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

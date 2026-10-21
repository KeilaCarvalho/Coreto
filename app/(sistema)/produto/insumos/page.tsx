import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { CamposNota, type InsumoSalvo } from "@/components/insumos/lancar-nota";
import { dataCurta, numero, quando, reais } from "@/lib/formatos";
import { excluirNota, registrarNota } from "./acoes";

export const metadata = { title: "Notas e insumos" };

type Insumo = InsumoSalvo & { id: string; ultimo_fornecedor: string | null };
type Nota = { id: string; numero: string | null; fornecedor: string | null; sem_nota: boolean; arquivo: string | null; emitida_em: string; valor_total: number; observacao: string | null; criado_em: string; nota_compra_itens: { count: number }[] };
type ItemHist = { quantidade: number; unidade: string | null; valor_unitario: number; notas_compra: { numero: string | null; fornecedor: string | null; sem_nota: boolean; emitida_em: string } | null };
type ItemNota = { quantidade: number; unidade: string | null; valor_unitario: number; insumos: { nome: string } | null };

const TIPO = { tecido: "Tecido", aviamento: "Aviamento", outro: "Outro" } as const;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const uuid = /^[0-9a-f-]{36}$/i;

export default async function Insumos({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; lancar?: string; insumo?: string; nota?: string }> }) {
  const sessao = await exigir("produto", "editar");
  const { ver = "insumos", q = "", insumo: insumoId, nota: notaId } = await searchParams;
  const supabase = await supabaseServidor();

  const [{ data: insR, error: erroTabela }, { data: notasR }] = await Promise.all([
    supabase.from("insumos").select("id, nome, tipo, unidade, ultimo_preco, ultimo_preco_em, ultimo_fornecedor").is("arquivado_em", null).order("nome"),
    supabase.from("notas_compra").select("id, numero, fornecedor, sem_nota, arquivo, emitida_em, valor_total, observacao, criado_em, nota_compra_itens(count)").order("emitida_em", { ascending: false }).order("criado_em", { ascending: false }).limit(200),
  ]);
  const insumos = (insR ?? []) as Insumo[];
  const notas = (notasR ?? []) as unknown as Nota[];
  const termo = q.trim().toLowerCase();
  const insumosVisiveis = termo ? insumos.filter((i) => i.nome.toLowerCase().includes(termo) || (i.ultimo_fornecedor ?? "").toLowerCase().includes(termo)) : insumos;
  const notasVisiveis = termo ? notas.filter((n) => (n.fornecedor ?? "sem nota").toLowerCase().includes(termo) || (n.numero ?? "").includes(termo)) : notas;
  const mes = hojeSP().slice(0, 7);
  const gastoMes = notas.filter((n) => n.emitida_em.startsWith(mes)).reduce((t, n) => t + Number(n.valor_total), 0);

  // janela de um insumo: histórico de preços
  let insumoAberto: Insumo | undefined;
  let historico: ItemHist[] = [];
  if (insumoId && uuid.test(insumoId)) {
    insumoAberto = insumos.find((i) => i.id === insumoId);
    const { data } = await supabase.from("nota_compra_itens").select("quantidade, unidade, valor_unitario, notas_compra(numero, fornecedor, sem_nota, emitida_em)").eq("insumo_id", insumoId).limit(100);
    historico = ((data ?? []) as unknown as ItemHist[]).sort((a, b) => (b.notas_compra?.emitida_em ?? "").localeCompare(a.notas_compra?.emitida_em ?? ""));
  }
  // janela de uma nota: itens
  let notaAberta: Nota | undefined;
  let itensNota: ItemNota[] = [];
  let linkArquivo: string | null = null;
  if (notaId && uuid.test(notaId)) {
    notaAberta = notas.find((n) => n.id === notaId);
    if (notaAberta?.arquivo) {
      const { data: assinado } = await supabase.storage.from("notas").createSignedUrl(notaAberta.arquivo, 600);
      linkArquivo = assinado?.signedUrl ?? null;
    }
    const { data } = await supabase.from("nota_compra_itens").select("quantidade, unidade, valor_unitario, insumos(nome)").eq("nota_id", notaId).order("ordem");
    itensNota = (data ?? []) as unknown as ItemNota[];
  }
  const base = `/produto/insumos?ver=${ver}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const podeApagar = sessao.pode("produto", "editar");

  return (
    <>
      <Cabecalho
        titulo="Notas e insumos"
        descricao="Lance as notas de tecido e aviamentos. O último preço pago de cada item aparece sozinho na precificação."
        acoes={<Link className="botao" href={`${base}&lancar=1`} scroll={false}><Icone nome="mais" />Lançar compra</Link>}
      />
      <Suspense><AvisoDaUrl /></Suspense>
      {erroTabela && <p className="aviso alerta"><Icone nome="alerta" />Esta parte ainda está sendo ativada no banco de dados. Volte em alguns minutos.</p>}

      <div className="kpis">
        <Kpi destaque titulo="Itens com preço" valor={numero(insumos.filter((i) => i.ultimo_preco != null).length)} nota="tecidos, aviamentos e outros" />
        <Kpi titulo="Notas lançadas" valor={numero(notas.length)} nota="todas as notas de compra" href="/produto/insumos?ver=notas" />
        <Kpi titulo="Comprado no mês" valor={reais(gastoMes)} nota="soma das notas deste mês" />
        <Kpi titulo="Tecidos" valor={numero(insumos.filter((i) => i.tipo === "tecido").length)} nota={`${numero(insumos.filter((i) => i.tipo === "aviamento").length)} aviamentos`} />
      </div>

      <section className="painel">
        <div className="painel-topo">
          <nav className="abas" aria-label="Ver">
            <Link href={`/produto/insumos?ver=insumos${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={ver === "insumos" ? "ativa" : undefined}>Itens e preços</Link>
            <Link href={`/produto/insumos?ver=notas${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={ver === "notas" ? "ativa" : undefined}>Notas lançadas</Link>
          </nav>
          <form className="filtros">
            <input type="hidden" name="ver" value={ver} />
            <input className="entrada" name="q" defaultValue={q} placeholder={ver === "notas" ? "Buscar fornecedor ou número" : "Buscar item ou fornecedor"} aria-label="Buscar" />
            <button className="botao leve pequeno" type="submit"><Icone nome="busca" />Buscar</button>
          </form>
        </div>

        {ver === "notas" ? (
          notasVisiveis.length ? (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Fornecedor</th><th>Nota</th><th className="num">Itens</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {notasVisiveis.map((n) => (
                    <tr key={n.id}>
                      <td>{dataCurta(n.emitida_em)}</td>
                      <td><Link className="linha-link" href={`${base}&nota=${n.id}`} scroll={false}>{n.fornecedor ?? "Sem nota"}</Link>{n.observacao && <div className="mini">{n.observacao}</div>}</td>
                      <td>{n.sem_nota ? <span className="etiqueta neutra">sem nota</span> : n.numero ? `nº ${n.numero}` : <span className="mini">sem número</span>}{n.arquivo && <span className="etiqueta info" style={{ marginLeft: 6 }}>anexo</span>}</td>
                      <td className="num">{numero(n.nota_compra_itens?.[0]?.count ?? 0)}</td>
                      <td className="num"><strong>{reais(Number(n.valor_total))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nenhuma nota" texto={termo ? "Nada encontrado com essa busca." : "Lance a primeira nota de tecido ou aviamento."} />
        ) : insumosVisiveis.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Item</th><th>Tipo</th><th className="num">Último preço</th><th>Comprado em</th><th>Fornecedor</th></tr></thead>
              <tbody>
                {insumosVisiveis.map((i) => (
                  <tr key={i.id}>
                    <td><Link className="linha-link" href={`${base}&insumo=${i.id}`} scroll={false}>{i.nome}</Link></td>
                    <td><span className="etiqueta neutra">{TIPO[i.tipo]}</span></td>
                    <td className="num"><strong>{i.ultimo_preco != null ? reais(Number(i.ultimo_preco)) : "—"}</strong> <span className="mini">/ {i.unidade}</span></td>
                    <td>{dataCurta(i.ultimo_preco_em)}</td>
                    <td>{i.ultimo_fornecedor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vazio titulo="Nenhum item ainda" texto={termo ? "Nada encontrado com essa busca." : "Os itens aparecem aqui quando você lança a primeira nota."}>
          {!termo && <Link className="botao" href={`${base}&lancar=1`} scroll={false}><Icone nome="mais" />Lançar nota</Link>}
        </Vazio>}
      </section>

      <Suspense>
        <JanelaLateral param="lancar" titulo="Lançar compra" subtitulo="Tecido, aviamento ou outro insumo, com ou sem nota" larga>
          <FormAcao acao={registrarNota}>
            <CamposNota insumos={insumos} hoje={hojeSP()} />
            <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Salvando…">Salvar</BotaoEnviar></div>
          </FormAcao>
        </JanelaLateral>
      </Suspense>

      {insumoAberto && (
        <Suspense>
          <JanelaLateral param="insumo" valor={insumoAberto.id} titulo={insumoAberto.nome} subtitulo={`${TIPO[insumoAberto.tipo]} · preço por ${insumoAberto.unidade}`}>
            <div className="bloco-janela">
              <h3>Último preço pago</h3>
              <p>{insumoAberto.ultimo_preco_em ? `Nota de ${dataCurta(insumoAberto.ultimo_preco_em)} · ${insumoAberto.ultimo_fornecedor}` : "Ainda sem nota"}</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "var(--tinta)", letterSpacing: "-.02em" }}>{insumoAberto.ultimo_preco != null ? reais(Number(insumoAberto.ultimo_preco)) : "—"}<span className="mini"> / {insumoAberto.unidade}</span></p>
            </div>
            <div className="bloco-janela">
              <h3>Todas as compras</h3>
              <p>Da mais recente para a mais antiga</p>
              <ul className="lista-simples">
                {historico.map((h, k) => (
                  <li key={k}>
                    <span>{dataCurta(h.notas_compra?.emitida_em)} · {h.notas_compra?.fornecedor ?? "Sem nota"}{h.notas_compra?.sem_nota && h.notas_compra.fornecedor ? " (sem nota)" : ""}{h.notas_compra?.numero ? ` · nº ${h.notas_compra.numero}` : ""}<br /><span className="mini">{String(h.quantidade).replace(".", ",")} {h.unidade ?? insumoAberto!.unidade}</span></span>
                    <strong>{reais(Number(h.valor_unitario))}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </JanelaLateral>
        </Suspense>
      )}

      {notaAberta && (
        <Suspense>
          <JanelaLateral param="nota" valor={notaAberta.id} titulo={`${notaAberta.fornecedor ?? "Sem nota"}${notaAberta.numero ? ` · nota nº ${notaAberta.numero}` : ""}`} subtitulo={`${notaAberta.sem_nota ? "Compra sem nota" : "Nota"} de ${dataCurta(notaAberta.emitida_em)} · lançada em ${quando(notaAberta.criado_em)}`}>
            {linkArquivo && (
              <a className="anexo-nota" href={linkArquivo} target="_blank" rel="noopener noreferrer">
                <Icone nome="arquivo" /><span><b>Ver {notaAberta.arquivo?.endsWith(".pdf") ? "o PDF" : "a foto"} da nota</b><small>Abre em outra aba</small></span>
              </a>
            )}
            <div className="bloco-janela">
              <h3>Itens</h3>
              <ul className="lista-simples">
                {itensNota.map((i, k) => (
                  <li key={k}>
                    <span><b>{i.insumos?.nome}</b><br /><span className="mini">{String(i.quantidade).replace(".", ",")} {i.unidade ?? ""} × {reais(Number(i.valor_unitario))}</span></span>
                    <strong>{reais(Number(i.quantidade) * Number(i.valor_unitario))}</strong>
                  </li>
                ))}
              </ul>
              <div className="fx-subtotal"><span>Total da nota</span><span>{reais(Number(notaAberta.valor_total))}</span></div>
            </div>
            {podeApagar && (
              <FormAcao acao={excluirNota}>
                <input type="hidden" name="id" value={notaAberta.id} />
                <div className="bloco-janela">
                  <h3>Lançou errado?</h3>
                  <p>Apagar a nota tira os itens (e o arquivo anexado) e volta o preço de cada um para o da nota anterior. Depois é só lançar de novo.</p>
                  <BotaoEnviar className="botao perigo" enviando="Apagando…">Apagar esta nota</BotaoEnviar>
                </div>
              </FormAcao>
            )}
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

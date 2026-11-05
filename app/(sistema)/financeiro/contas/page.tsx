import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { BANCOS_COBRADOS, FILTRO_BANCOS, faltaNota, bancoCobrado, diasPara, prazo, type Banco, type ContaPagar } from "@/lib/contas-pagar";
import { hojeSP } from "@/lib/tarefas";
import { dataCurta, quando, reais } from "@/lib/formatos";
import { importarContasPagar } from "./acoes";
import { AnaliseContas } from "./analise";

export const metadata = { title: "Contas a pagar" };

type Saldo = { nome: string; valor: number };

export default async function ContasPagar({ searchParams }: { searchParams: Promise<{ ver?: string; aba?: string; mes?: string }> }) {
  const sessao = await exigir("financeiro");
  const { ver, aba, mes: mesParam } = await searchParams;
  const supabase = await supabaseServidor();
  const hoje = hojeSP();
  const analise = aba !== "cobranca";
  const mes = /^\d{4}-\d{2}-01$/.test(mesParam ?? "") ? mesParam! : `${hoje.slice(0, 7)}-01`;
  // Todas as contas (o Supabase entrega no máximo 1000 por vez).
  const todas: ContaPagar[] = [];
  for (let de = 0; analise && de < 50000; de += 1000) {
    const { data } = await supabase.from("contas_pagar").select("*").order("vencimento").order("id").range(de, de + 999);
    todas.push(...((data ?? []) as ContaPagar[]));
    if (!data || data.length < 1000) break;
  }
  const notasR = !analise
    ? await supabase.from("contas_pagar").select("*").or(FILTRO_BANCOS).is("nota_fiscal", null).order("vencimento")
    : { data: [] };
  const semNota = ((notasR.data ?? []) as ContaPagar[]).filter(faltaNota);
  const [cobradasR, outrasR, fluxoR, ultimaR] = await Promise.all([
    supabase.from("contas_pagar").select("*").or(FILTRO_BANCOS).gt("em_aberto", 0).order("vencimento").order("fornecedor"),
    supabase.from("contas_pagar").select("conta, em_aberto, vencimento").gt("em_aberto", 0).not("conta", "ilike", "%santander%").not("conta", "ilike", "%caixa%"),
    supabase.from("fluxo_dias").select("data, saldos").lte("data", hoje).order("data", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("contas_pagar").select("importado_em").order("importado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const cobradas = (cobradasR.data ?? []) as ContaPagar[];
  const outras = (outrasR.data ?? []) as Pick<ContaPagar, "conta" | "em_aberto" | "vencimento">[];
  const saldos = ((fluxoR.data?.saldos ?? []) as Saldo[]);
  const saldoDe = (b: Banco) => saldos.find((s) => s.nome.toLowerCase() === b.toLowerCase())?.valor ?? null;
  const soma = (l: { em_aberto: number }[]) => l.reduce((t, c) => t + Number(c.em_aberto), 0);

  const porBanco = BANCOS_COBRADOS.map((b) => {
    const lista = cobradas.filter((c) => bancoCobrado(c.conta) === b);
    const atrasadas = lista.filter((c) => diasPara(c.vencimento, hoje) < 0);
    const semana = lista.filter((c) => { const d = diasPara(c.vencimento, hoje); return d >= 0 && d <= 7; });
    const saldo = b === "Cartão Caixa" ? null : saldoDe(b);
    const precisa = soma(atrasadas) + soma(semana);
    return { b, lista, atrasadas, semana, saldo, precisa, sobra: saldo == null ? null : saldo - precisa };
  });
  const atrasadas = cobradas.filter((c) => diasPara(c.vencimento, hoje) < 0);
  const lista = ver === "todas" ? cobradas : cobradas.filter((c) => diasPara(c.vencimento, hoje) <= 7);
  const ultima = ultimaR.data?.importado_em as string | undefined;
  const dataFluxo = fluxoR.data?.data as string | undefined;
  const podeImportar = sessao.pode("financeiro", "criar");

  return (
    <>
      <Cabecalho
        titulo="Contas a pagar"
        descricao={`Todas as contas do Conta Azul, dos meses passados e futuros. ${ultima ? `Última importação do Conta Azul: ${quando(ultima)}.` : "Ainda não tem importação do Conta Azul."}`}
        trilha={[{ rotulo: "Financeiro", href: "/financeiro/fluxo" }]}
        acoes={podeImportar && <Link className="botao" href="?importar=1" scroll={false}><Icone nome="entrada" />Importar do Conta Azul</Link>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      {ultima && (
        <nav className="abas cp-abas" aria-label="Visão">
          <Link href="/financeiro/contas" className={analise ? "ativa" : undefined}>Análise</Link>
          <Link href="/financeiro/contas?aba=cobranca" className={!analise ? "ativa" : undefined}>Cobrança</Link>
        </nav>
      )}

      {ultima && analise ? (
        <AnaliseContas contas={todas} mes={mes} hoje={hoje} />
      ) : !ultima ? (
        <section className="painel"><Vazio titulo="Importe as contas do Conta Azul" texto="No Conta Azul, em Contas a pagar, exporte a visão (todas as situações) e importe aqui. Repita sempre que lançar conta nova." /></section>
      ) : (
        <>
          <section className="painel" style={{ marginBottom: 16 }}>
            <div className="painel-topo"><div><h2>Falta pedir nota fiscal</h2><p>Contas do Santander e da Caixa sem nota no Conta Azul. Facção, folha, impostos e tarifas ficam de fora.</p></div>{semNota.length > 0 && <span className="etiqueta alerta">{semNota.length}</span>}</div>
            {semNota.length ? (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Categoria</th><th>Banco</th><th className="num">Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {semNota.map((c) => (
                      <tr key={c.id}>
                        <td data-rotulo="Vencimento">{dataCurta(c.vencimento)}</td>
                        <td data-rotulo="Fornecedor"><b>{c.fornecedor || "—"}</b><div className="mini">{c.descricao}</div></td>
                        <td data-rotulo="Categoria" className="mini">{c.categoria ?? "—"}</td>
                        <td data-rotulo="Banco">{bancoCobrado(c.conta)}</td>
                        <td data-rotulo="Valor" className="num">{reais(Number(c.valor))}</td>
                        <td data-rotulo="Situação"><span className={`etiqueta ${Number(c.em_aberto) > 0 ? "neutra" : "ok"}`}>{Number(c.em_aberto) > 0 ? "Em aberto" : "Paga"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="painel-corpo mini">Nenhuma conta do Santander ou da Caixa sem nota.</p>}
          </section>

          <div className="kpis fx-kpis fx-fechamento">
            <Kpi destaque titulo="Atrasadas" valor={reais(soma(atrasadas))} nota={atrasadas.length ? `${atrasadas.length} ${atrasadas.length === 1 ? "conta" : "contas"} no Santander e na Caixa` : "nenhuma atrasada"} />
            {porBanco.map((p) => (
              <Kpi key={p.b} titulo={`${p.b}: vence em 7 dias`} valor={reais(p.precisa)}
                nota={p.b === "Cartão Caixa" ? `${p.lista.length} em aberto · paga na fatura`
                  : p.saldo == null ? "sem saldo no Fluxo"
                  : `saldo ${reais(p.saldo)}${dataFluxo ? ` em ${dataCurta(dataFluxo).slice(0, 5)}` : ""} · ${p.sobra! >= 0 ? `sobra ${reais(p.sobra)}` : `faltam ${reais(-p.sobra!)}`}`}
                chip={p.sobra != null && p.sobra < 0 ? "Saldo não cobre " : undefined} />
            ))}
          </div>

          <section className="painel">
            <div className="painel-topo">
              <div><h2>Vencimentos</h2><p>Só Santander, Caixa e cartão Caixa. Some daqui quando for baixada no Conta Azul e você importar de novo.</p></div>
              <nav className="abas" aria-label="Filtrar">
                <Link href="/financeiro/contas?aba=cobranca" className={ver !== "todas" ? "ativa" : undefined}>Atrasadas e 7 dias</Link>
                <Link href="/financeiro/contas?aba=cobranca&ver=todas" className={ver === "todas" ? "ativa" : undefined}>Todas em aberto</Link>
              </nav>
            </div>
            {lista.length ? (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th>Banco</th><th className="num">Em aberto</th><th>Prazo</th></tr></thead>
                  <tbody>
                    {lista.map((c) => {
                      const pz = prazo(c.vencimento, hoje);
                      return (
                        <tr key={c.id}>
                          <td data-rotulo="Vencimento">{dataCurta(c.vencimento)}</td>
                          <td data-rotulo="Fornecedor"><b>{c.fornecedor || "—"}</b></td>
                          <td data-rotulo="Descrição" className="mini">{c.descricao}</td>
                          <td data-rotulo="Categoria" className="mini">{c.categoria ?? "—"}</td>
                          <td data-rotulo="Banco">{bancoCobrado(c.conta)}</td>
                          <td data-rotulo="Em aberto" className="num"><b>{reais(Number(c.em_aberto))}</b></td>
                          <td data-rotulo="Prazo"><span className={`etiqueta ${pz.classe}`}>{pz.rotulo}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="painel-corpo mini">Nada atrasado nem vencendo nos próximos 7 dias no Santander e na Caixa.</p>}
            {outras.length > 0 && (
              <p className="painel-corpo mini">Outros bancos (sem cobrança): {outras.length} contas em aberto, {reais(soma(outras))}.</p>
            )}
          </section>
        </>
      )}

      <Suspense>
        <JanelaLateral param="importar" titulo="Importar do Conta Azul" subtitulo="Visão Contas a Pagar (.xls ou .xlsx)">
          <FormAcao acao={importarContasPagar}>
            <div className="bloco-janela">
              <p>No Conta Azul: <b>Financeiro → Contas a pagar</b>, deixe a situação em <b>todas</b>, escolha o período e exporte. As contas com vencimento dentro do período do arquivo são trocadas pelas novas.</p>
              <div className="campo"><label htmlFor="cp-arquivo">Planilha</label><input id="cp-arquivo" name="arquivo" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></div>
            </div>
            <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Importando…">Importar contas</BotaoEnviar></div>
          </FormAcao>
        </JanelaLateral>
      </Suspense>
    </>
  );
}

import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { ImportarRelatorios } from "@/components/importar-relatorios";
import { NOMES } from "@/lib/relatorios-nomes";
import { numero, quando } from "@/lib/formatos";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { desfazerImportacao, importarRelatorio, ligarVendedoraDoRelatorio } from "../acoes";

export const metadata = { title: "Importar relatórios" };

type ImpCliente = { id: string; arquivo: string; tipo: string; mes: string | null; registros: number; ignorados: number; criado_em: string; quem: { nome: string } | null };
type ImpVenda = { id: string; arquivo: string | null; tipo: string; mes: string | null; linhas: number; importado_em: string; quem: { nome: string } | null };
type Linha = { id: string; arquivo: string; tipo: string; mes: string | null; linhas: number; ignorados: number; quando: string; quem: string | null; desfazer: boolean };

const LISTA = [
  ["Clientes – primeira compra", "cria as clientes novas na carteira de cada vendedora", "Clientes"],
  ["Relatório de clientes (aniversariantes)", "completa nascimento, CPF, telefone e cidade", "Clientes"],
  ["Desconto/acréscimo de vendas por vendedor", "compras de cada cliente e ranking das vendedoras", "Vendas"],
  ["Resumo de comissão vendedor", "comissão, vendas e ticket de cada vendedora", "Vendas"],
  ["Curva ABC de produtos", "os modelos que mais venderam no mês", "Vendas"],
  ["Evolução de vendas por mês", "o gráfico das vendas do ano", "Vendas"],
  ["Venda de produtos por data", "cada peça vendida, com desconto", "Vendas"],
];

export default async function Relatorios() {
  const sessao = await exigir("comercial");
  if (!sessao.pode("comercial", "aprovar") && !sessao.pode("financeiro", "editar")) await exigir("comercial", "aprovar");
  const supabase = await supabaseServidor();
  const [{ data: cli }, { data: ven }, { count: semVendedora }, { data: nomesSoltos }, { data: equipeR }] = await Promise.all([
    supabase.from("importacoes_clientes").select("id, arquivo, tipo, mes, registros, ignorados, criado_em, quem:pessoas!criado_por(nome)").order("criado_em", { ascending: false }).limit(60),
    supabase.from("relatorios_importados").select("id, arquivo, tipo, mes, linhas, importado_em, quem:pessoas!importado_por(nome)").order("importado_em", { ascending: false }).limit(60),
    supabase.from("clientes").select("id", { count: "exact", head: true }).is("vendedora_id", null).is("arquivado_em", null),
    supabase.from("clientes").select("vendedora_nome").is("vendedora_id", null).not("vendedora_nome", "is", null).is("arquivado_em", null).limit(5000),
    supabase.from("pessoas").select("id, nome, nome_vendas").is("arquivado_em", null).order("nome"),
  ]);
  const equipe = (equipeR ?? []) as { id: string; nome: string; nome_vendas: string | null }[];
  const historico: Linha[] = [
    ...((cli ?? []) as unknown as ImpCliente[]).map((i) => ({ id: i.id, arquivo: i.arquivo, tipo: i.tipo, mes: i.mes, linhas: i.registros, ignorados: i.ignorados, quando: i.criado_em, quem: i.quem?.nome ?? null, desfazer: i.tipo === "vendas_vendedora" })),
    ...((ven ?? []) as unknown as ImpVenda[]).map((i) => ({ id: i.id, arquivo: i.arquivo ?? "", tipo: i.tipo, mes: i.mes?.slice(0, 7) ?? null, linhas: i.linhas, ignorados: 0, quando: i.importado_em, quem: i.quem?.nome ?? null, desfazer: false })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 60);
  const contagem = new Map<string, number>();
  for (const n of nomesSoltos ?? []) contagem.set(n.vendedora_nome as string, (contagem.get(n.vendedora_nome as string) ?? 0) + 1);
  const soltos = [...contagem.keys()].sort();
  const titulo = (nome: string) => nome.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase()).replace(/\s(De|Da|Do|Dos|Das|E)\s/g, (m) => m.toLowerCase());

  return (
    <>
      <Cabecalho titulo="Importar relatórios"
        descricao="Todo mês, jogue aqui os PDFs do sistema de vendas da loja. O sistema reconhece cada relatório sozinho e manda os dados para o lugar certo." />

      {soltos.length > 0 && (
        <section className="painel" style={{ marginBottom: 16 }}>
          <div className="painel-topo">
            <div>
              <h2>Quem é cada vendedora dos relatórios?</h2>
              <p>{numero(semVendedora ?? 0)} clientes estão esperando: nos relatórios as vendedoras aparecem com o nome do sistema antigo. Diga quem é cada uma e as clientes entram na carteira dela.</p>
            </div>
          </div>
          <ul className="lista-simples ligar-vendedoras">
            {soltos.map((nome) => (
              <li key={nome}>
                <span><b>{nome}</b><br /><span className="mini">{numero(contagem.get(nome) ?? 0)} {contagem.get(nome) === 1 ? "cliente" : "clientes"} esperando</span></span>
                <FormAcao acao={ligarVendedoraDoRelatorio} className="ligar-form">
                  <input type="hidden" name="nome_relatorio" value={nome} />
                  <select name="pessoa" defaultValue="nova" aria-label={`Quem é ${nome}`}>
                    <option value="nova">Cadastrar como vendedora nova: {titulo(nome)}</option>
                    {equipe.filter((p) => !p.nome_vendas).map((p) => <option key={p.id} value={p.id}>É a {p.nome} (já está na equipe)</option>)}
                  </select>
                  <BotaoEnviar className="botao pequeno" enviando="Ligando…">Ligar</BotaoEnviar>
                </FormAcao>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo"><div><h2>Novos relatórios</h2><p>Importar de novo o mesmo mês não duplica: clientes são atualizadas pelo código e os relatórios de vendas substituem o mês.</p></div></div>
          <div className="painel-corpo"><ImportarRelatorios importar={importarRelatorio} /></div>
        </section>
        <section className="painel">
          <div className="painel-topo"><div><h2>Relatórios que o sistema lê</h2><p>Gere no sistema de vendas, salve em PDF e envie aqui.</p></div></div>
          <ul className="lista-simples">
            {LISTA.map(([nome, faz, onde]) => <li key={nome}><span><b>{nome}</b><br /><span className="mini">{faz}</span></span><span className="etiqueta neutra">{onde}</span></li>)}
            <li><span><b>Carteira do sistema antigo (CSV)</b><br /><span className="mini">uma vez só, para trazer etapas e retornos</span></span><span className="etiqueta neutra">Clientes</span></li>
          </ul>
        </section>
      </div>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2>Importações feitas</h2><p>As mais recentes primeiro.</p></div></div>
        {historico.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Relatório</th><th>Mês</th><th className="num">Linhas</th><th>Quando</th><th>Onde ver</th><th /></tr></thead>
              <tbody>
                {historico.map((i) => (
                  <tr key={i.tipo + i.id}>
                    <td><strong>{NOMES[i.tipo]?.nome ?? i.tipo}</strong><div className="mini">{i.arquivo}</div></td>
                    <td>{i.mes ? i.mes.split("-").reverse().join("/") : "—"}</td>
                    <td className="num">{numero(i.linhas)}{i.ignorados ? <div className="mini">{numero(i.ignorados)} ignoradas</div> : null}</td>
                    <td className="mini">{quando(i.quando)}{i.quem ? `, ${i.quem}` : ""}</td>
                    <td>{NOMES[i.tipo] && <Link className="botao leve pequeno" href={`${NOMES[i.tipo].href}${i.mes && NOMES[i.tipo].href === "/comercial/vendas" ? `?mes=${i.mes.slice(0, 7)}` : ""}`}>{NOMES[i.tipo].onde} →</Link>}</td>
                    <td className="num">
                      {i.desfazer && (
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

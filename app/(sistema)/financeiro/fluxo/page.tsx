import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { FluxoFinanceiro } from "@/components/fluxo-financeiro";
import { FORMAS_PAGAMENTO, inicioDoMes, lerLinhas, somar, type DadosFluxo } from "@/lib/fluxo";
import { dataCurta, quando, reais } from "@/lib/formatos";
import { salvarFluxo } from "../acoes";

export const metadata = { title: "Fluxo financeiro" };

type Dia = { data: string; vendas: unknown; saldos: unknown; a_receber: unknown; observacao: string | null; atualizado_em: string; quem: { nome: string } | null };
type Mes = { mes: string; vendas: unknown; vendedoras: unknown; contas_a_pagar: number; contas_pagas: number };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sessao = await exigir("financeiro");
  const { data: pedida } = await searchParams;
  const hoje = hojeSP();
  const data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoje ? pedida : hoje;
  const supabase = await supabaseServidor();

  const [{ data: diaR }, { data: mesR }, { data: anteriorR }, { data: historicoR }, { data: vendedorasR }] = await Promise.all([
    supabase.from("fluxo_dias").select("data, vendas, saldos, a_receber, observacao, atualizado_em, quem:pessoas!atualizado_por(nome)").eq("data", data).maybeSingle(),
    supabase.from("fluxo_meses").select("mes, vendas, vendedoras, contas_a_pagar, contas_pagas").eq("mes", inicioDoMes(data)).maybeSingle(),
    supabase.from("fluxo_dias").select("saldos, a_receber").lt("data", data).order("data", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fluxo_dias").select("data, vendas, saldos, atualizado_em").order("data", { ascending: false }).limit(31),
    supabase.from("pessoas").select("nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome"),
  ]);
  const dia = diaR as unknown as Dia | null;
  const mes = mesR as unknown as Mes | null;

  // Dia novo: repete os nomes das contas e das referências do último dia preenchido, com valores em branco.
  const nomesAnteriores = (bruto: unknown) => lerLinhas(bruto).map((l) => ({ nome: l.nome, valor: 0 }));
  const inicial: DadosFluxo = {
    data,
    vendasDia: dia ? lerLinhas(dia.vendas) : FORMAS_PAGAMENTO.map((nome) => ({ nome, valor: 0 })),
    saldos: dia ? lerLinhas(dia.saldos) : nomesAnteriores(anteriorR?.saldos),
    aReceber: dia ? lerLinhas(dia.a_receber) : lerLinhas(anteriorR?.a_receber),
    observacao: dia?.observacao ?? "",
    vendasMes: mes ? lerLinhas(mes.vendas) : FORMAS_PAGAMENTO.map((nome) => ({ nome, valor: 0 })),
    vendedoras: mes ? lerLinhas(mes.vendedoras) : (vendedorasR ?? []).map((v) => ({ nome: v.apelido || v.nome, valor: 0 })),
    contasAPagar: Number(mes?.contas_a_pagar ?? 0),
    contasPagas: Number(mes?.contas_pagas ?? 0),
  };
  // Linhas com valor zero aparecem no formulário para preencher.
  if (dia && !inicial.vendasDia.length) inicial.vendasDia = FORMAS_PAGAMENTO.map((nome) => ({ nome, valor: 0 }));

  const historico = (historicoR ?? []) as { data: string; vendas: unknown; saldos: unknown; atualizado_em: string }[];
  const editavel = sessao.pode("financeiro", dia ? "editar" : "criar");

  return (
    <>
      <Cabecalho
        titulo="Fluxo financeiro"
        descricao="Lance o fechamento do dia e o acumulado do mês. O PDF sai pronto para mandar para a Deborah."
        acoes={
          <form className="filtros">
            <input className="entrada" type="date" name="data" defaultValue={data} max={hoje} aria-label="Data do fluxo" />
            <button className="botao leve pequeno" type="submit">Abrir dia</button>
            {data !== hoje && <Link className="botao-link" href="/financeiro/fluxo">Hoje</Link>}
          </form>
        }
      />
      {!dia && <p className="aviso alerta">Este dia ainda não foi lançado.{anteriorR ? " As contas e referências do último dia preenchido já estão na lista; falta só pôr os valores." : ""}</p>}

      <FluxoFinanceiro
        key={data + (dia?.atualizado_em ?? "")}
        inicial={inicial}
        editavel={editavel}
        salvar={salvarFluxo}
        rodape={dia ? `Atualizado em ${quando(dia.atualizado_em)}${dia.quem ? ` por ${dia.quem.nome}` : ""}` : undefined}
      />

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo"><div><h2>Dias lançados</h2><p>Abra um dia para consultar, corrigir ou gerar o PDF de novo.</p></div></div>
        {historico.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Dia</th><th className="num">Vendas do dia anterior</th><th className="num">Saldo total</th><th>Atualizado</th><th /></tr></thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.data}>
                    <td><strong>{dataCurta(h.data)}</strong></td>
                    <td className="num">{reais(somar(lerLinhas(h.vendas)))}</td>
                    <td className="num">{reais(somar(lerLinhas(h.saldos)))}</td>
                    <td className="mini">{quando(h.atualizado_em)}</td>
                    <td className="num">{h.data === data ? <span className="etiqueta ok">aberto</span> : <Link className="botao leve pequeno" href={`/financeiro/fluxo?data=${h.data}`}>Abrir</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="painel-corpo mini">Nenhum dia lançado ainda.</p>}
      </section>
    </>
  );
}

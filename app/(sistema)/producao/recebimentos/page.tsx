import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { SITUACAO } from "@/lib/grade";
import { dataCurta, numero } from "@/lib/formatos";

export const metadata = { title: "Chegada da facção" };

type Lote = {
  id: string; numero: number; recebido_em: string; referencia: string; produto_nome: string; faccao_nome: string | null;
  recebido: number; liberado: number; aguardando: number; situacao: string; pendente: boolean; pendencia: string | null;
};

const FILTROS = [
  { valor: "abertos", rotulo: "Em aberto" },
  { valor: "sem_preco", rotulo: "Aguardando preço" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "pronto", rotulo: "Prontos para liberar" },
  { valor: "concluido", rotulo: "Liberados" },
];

export default async function Recebimentos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sessao = await exigir("producao");
  const { ver = "abertos" } = await searchParams;
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("recebimentos_resumo")
    .select("id, numero, recebido_em, referencia, produto_nome, faccao_nome, recebido, liberado, aguardando, situacao, pendente, pendencia")
    .order("recebido_em", { ascending: false }).order("numero", { ascending: false }).limit(300);
  const todos = (data ?? []) as Lote[];
  const abertos = todos.filter((l) => ["sem_preco", "pendente", "pronto"].includes(l.situacao));
  const lista = ver === "abertos" ? abertos : todos.filter((l) => l.situacao === ver);
  const conta = (s: string) => todos.filter((l) => l.situacao === s).length;
  const podeRegistrar = sessao.pode("producao", "criar") || sessao.pode("estoque", "criar");

  return (
    <>
      <Cabecalho
        titulo="Chegada da facção"
        descricao="Conte as peças que chegaram, precifique o modelo e libere para a loja. Até a liberação, nada aparece para venda."
        acoes={podeRegistrar && <Link className="botao" href="/producao/recebimentos/novo"><Icone nome="entrada" />Registrar chegada</Link>}
      />
      <div className="kpis">
        <Kpi destaque titulo="Peças aguardando" valor={numero(abertos.reduce((t, l) => t + l.aguardando, 0))} nota="contadas, ainda fora da loja" />
        <Kpi titulo="Aguardando preço" valor={numero(conta("sem_preco"))} nota="lotes de modelos sem preço" href="/producao/recebimentos?ver=sem_preco" />
        <Kpi titulo="Pendentes" valor={numero(conta("pendente"))} nota="faltou peça da facção" href="/producao/recebimentos?ver=pendente" />
        <Kpi titulo="Prontos para liberar" valor={numero(conta("pronto"))} nota="com preço e nada pendente" href="/producao/recebimentos?ver=pronto" />
      </div>
      <section className="painel">
        <div className="painel-topo">
          <nav className="abas" aria-label="Filtrar lotes">
            {FILTROS.map((f) => (
              <Link key={f.valor} href={`/producao/recebimentos?ver=${f.valor}`} className={ver === f.valor ? "ativa" : undefined} aria-current={ver === f.valor ? "page" : undefined}>{f.rotulo}</Link>
            ))}
          </nav>
        </div>
        {lista.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Lote</th><th>Modelo</th><th>Facção</th><th className="num">Chegou</th><th className="num">Aguardando</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((l) => {
                  const s = SITUACAO[l.situacao] ?? SITUACAO.vazio;
                  return (
                    <tr key={l.id}>
                      <td><Link className="linha-link" href={`/producao/recebimentos/${l.id}`}>nº {l.numero}</Link><div className="mini">{dataCurta(l.recebido_em)}</div></td>
                      <td><strong>{l.produto_nome}</strong><div className="mini">{l.referencia}</div></td>
                      <td>{l.faccao_nome ?? <span className="mini">Não informada</span>}</td>
                      <td className="num">{numero(l.recebido)}</td>
                      <td className="num"><strong>{numero(l.aguardando)}</strong></td>
                      <td>
                        <span className={`etiqueta ${s.classe}`}>{s.rotulo}</span>
                        {l.pendente && l.pendencia && <div className="mini" style={{ marginTop: 4 }}>{l.pendencia}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo={ver === "abertos" ? "Nenhum lote em aberto" : "Nenhum lote aqui"} texto={ver === "abertos" ? "Quando a facção entregar, registre a chegada contando por cor e tamanho." : "Nenhum lote nesta situação."}>
            {podeRegistrar && ver === "abertos" && <Link className="botao" href="/producao/recebimentos/novo"><Icone nome="entrada" />Registrar chegada</Link>}
          </Vazio>
        )}
      </section>
    </>
  );
}

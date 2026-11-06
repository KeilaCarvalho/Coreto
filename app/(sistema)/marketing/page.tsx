import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { AvisoDaUrl, JanelaLateral } from "@/components/janela-lateral";
import { FormSaidaFotos } from "@/components/marketing/form-saida";
import { SituacaoItem } from "@/components/marketing/situacao-item";
import { ROTULO } from "@/lib/fotos";
import { hojeSP } from "@/lib/tarefas";
import { dataCurta } from "@/lib/formatos";

export const metadata = { title: "Peças para fotos" };

type Sessao = { id: number; evento: string; data: string; observacao: string | null };
type Item = { id: number; sessao_id: number; peca: string | null; cor: string | null; tamanho: string | null; quantidade: number; situacao: string; observacao: string | null };

export default async function PecasParaFotos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sessao = await exigir("marketing");
  const { ver } = await searchParams;
  const kanban = ver === "kanban";
  const supabase = await supabaseServidor();
  const hoje = hojeSP();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const [{ data: sessoesR }, { data: itensR }] = await Promise.all([
    supabase.from("fotos_sessoes").select("id, evento, data, observacao").order("data", { ascending: false }).order("id", { ascending: false }).limit(80),
    supabase.from("fotos_itens").select("id, sessao_id, peca, cor, tamanho, quantidade, situacao, observacao").order("id").limit(3000),
  ]);
  const sessoes = (sessoesR ?? []) as Sessao[];
  const itens = ((itensR ?? []) as Item[]).filter((i) => sessoes.some((s) => s.id === i.sessao_id));
  const modeloDe = (i: Item) => (i.peca ?? "Peça").trim();
  const detalhe = (i: Item) => [i.cor, i.tamanho].filter(Boolean).join(" · ") || "—";

  const soma = (l: Item[]) => l.reduce((t, i) => t + i.quantidade, 0);
  const comEla = itens.filter((i) => i.situacao === "com_ela");
  const sessoesMes = sessoes.filter((s) => s.data >= inicioMes);
  const itensMes = itens.filter((i) => sessoesMes.some((s) => s.id === i.sessao_id));
  const pode = sessao.pode("marketing", "editar");
  const sessaoDe = (id: number) => sessoes.find((s) => s.id === id);

  const Peca = ({ i, comSessao = false }: { i: Item; comSessao?: boolean }) => {
    const s = sessaoDe(i.sessao_id);
    return (
      <div className="mf-peca">
        <div className="mf-peca-topo">
          <div className="mf-item-nome">
            <b>{comSessao ? modeloDe(i) : detalhe(i)}</b>
            <span>{comSessao ? `${detalhe(i)}${s ? ` · ${s.evento} (${dataCurta(s.data).slice(0, 5)})` : ""}` : i.observacao ?? ""}</span>
          </div>
          {i.quantidade > 1 && <span className="mf-item-qtd">{i.quantidade}</span>}
        </div>
        {comSessao && i.observacao && <span className="mini">{i.observacao}</span>}
        <SituacaoItem id={i.id} situacao={i.situacao} pode={pode} />
      </div>
    );
  };

  return (
    <>
      <Cabecalho titulo="Peças para fotos" descricao="Cada saída é uma sessão de fotos, com as peças que foram e a situação de cada uma."
        acoes={sessao.pode("marketing", "criar") && <Link className="botao" href="?saida=1" scroll={false}><Icone nome="fotos" />Nova saída para fotos</Link>} />
      <Suspense><AvisoDaUrl /></Suspense>

      <div className="kpis">
        <Kpi destaque titulo="Com ela agora" valor={String(soma(comEla))} nota={`${comEla.length} ${comEla.length === 1 ? "item" : "itens"} para devolver`} />
        <Kpi titulo="Sessões no mês" valor={String(sessoesMes.length)} nota={`${soma(itensMes)} peças saíram`} />
        <Kpi titulo="Devolvidas no mês" valor={String(soma(itensMes.filter((i) => i.situacao === "devolvido")))} nota={`${soma(itensMes.filter((i) => i.situacao === "deu"))} foram dadas`} />
      </div>

      <nav className="abas cp-abas" aria-label="Visualização">
        <Link href="/marketing" className={!kanban ? "ativa" : undefined}>Lista</Link>
        <Link href="/marketing?ver=kanban" className={kanban ? "ativa" : undefined}>Kanban</Link>
      </nav>

      {!itens.length ? (
        <section className="painel"><Vazio titulo="Nenhuma saída para fotos ainda" texto="Toque em “Nova saída para fotos”, diga o evento e escreva as peças." /></section>
      ) : kanban ? (
        <div className="mf-kanban">
          {(["com_ela", "devolvido", "deu"] as const).map((sit) => {
            const col = itens.filter((i) => i.situacao === sit).sort((a, b) => b.id - a.id).slice(0, sit === "com_ela" ? 500 : 40);
            return (
              <section key={sit} className={`mf-coluna ${sit}`}>
                <header><b>{ROTULO[sit]}</b><span>{soma(col)}</span></header>
                {col.length ? col.map((i) => <Peca key={i.id} i={i} comSessao />) : <p className="mini" style={{ padding: "4px 2px" }}>Nada aqui.</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mf-sessoes">
          {sessoes.filter((s) => itens.some((i) => i.sessao_id === s.id)).map((s) => {
            const doEvento = itens.filter((i) => i.sessao_id === s.id);
            const modelos = [...new Set(doEvento.map((i) => modeloDe(i)))].sort((a, b) => a.localeCompare(b));
            const fora = soma(doEvento.filter((i) => i.situacao === "com_ela"));
            return (
              <section key={s.id} className="painel mf-sessao">
                <div className="painel-topo">
                  <div><h2>{s.evento}</h2><p>{dataCurta(s.data)} · {soma(doEvento)} {soma(doEvento) === 1 ? "peça" : "peças"}{s.observacao ? ` · ${s.observacao}` : ""}</p></div>
                  <span className={`etiqueta ${fora ? "alerta" : "ok"}`}>{fora ? `${fora} com ela` : "Tudo resolvido"}</span>
                </div>
                <div className="mf-modelos-lista">
                  {modelos.map((m) => (
                    <div key={m} className="mf-modelo-bloco">
                      <h3>{m}</h3>
                      {doEvento.filter((i) => modeloDe(i) === m).map((i) => <Peca key={i.id} i={i} />)}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {sessao.pode("marketing", "criar") && (
        <Suspense>
          <JanelaLateral param="saida" titulo="Nova saída para fotos" subtitulo="Evento, data e as peças que foram" larga>
            <FormSaidaFotos hoje={hoje} />
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { AvisoDaUrl, JanelaLateral } from "@/components/janela-lateral";
import { FormSaidaFotos, type VarianteFoto } from "@/components/marketing/form-saida";
import { SituacaoItem } from "@/components/marketing/situacao-item";
import { ROTULO } from "@/lib/fotos";
import { hojeSP } from "@/lib/tarefas";
import { dataCurta } from "@/lib/formatos";

export const metadata = { title: "Peças para fotos" };

type Var = { id: string; tamanho: string; produtos: { referencia: string; nome: string } | null; cores: { nome: string; hex: string | null } | null };
type Sessao = { id: number; evento: string; data: string; observacao: string | null };
type Item = { id: number; sessao_id: number; variante_id: string; quantidade: number; situacao: string; observacao: string | null };

export default async function PecasParaFotos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sessao = await exigir("marketing");
  const { ver } = await searchParams;
  const kanban = ver === "kanban";
  const supabase = await supabaseServidor();
  const hoje = hojeSP();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const [{ data: locaisR }, { data: saldosR }, { data: sessoesR }, { data: itensR }] = await Promise.all([
    supabase.from("locais_estoque").select("id, tipo").is("arquivado_em", null),
    supabase.rpc("saldos_para_fotos"),
    supabase.from("fotos_sessoes").select("id, evento, data, observacao").order("data", { ascending: false }).order("id", { ascending: false }).limit(60),
    supabase.from("fotos_itens").select("id, sessao_id, variante_id, quantidade, situacao, observacao").order("id").limit(2000),
  ]);
  const loja = ((locaisR ?? []) as { id: string; tipo: string }[]).find((l) => l.tipo === "loja")?.id;
  const saldosLoja = ((saldosR ?? []) as { variante_id: string; local_id: string; saldo: number }[]).filter((s) => s.local_id === loja);
  const sessoes = (sessoesR ?? []) as Sessao[];
  const itens = ((itensR ?? []) as Item[]).filter((i) => sessoes.some((s) => s.id === i.sessao_id) || i.situacao === "com_ela");

  const ids = [...new Set([...saldosLoja.map((s) => s.variante_id), ...itens.map((i) => i.variante_id)])];
  const { data: varsR } = ids.length ? await supabase.from("variantes").select("id, tamanho, produtos(referencia, nome), cores(nome, hex)").in("id", ids) : { data: [] };
  const vars = new Map(((varsR ?? []) as unknown as Var[]).map((v) => [v.id, v]));
  const modeloDe = (id: string) => { const v = vars.get(id); return `${v?.produtos?.referencia ?? ""} ${v?.produtos?.nome ?? ""}`.trim(); };

  const variantes: VarianteFoto[] = saldosLoja.map((s) => {
    const v = vars.get(s.variante_id);
    return { id: s.variante_id, produto: v?.produtos?.nome ?? "", referencia: v?.produtos?.referencia ?? "", cor: v?.cores?.nome ?? "", hex: v?.cores?.hex ?? null, tamanho: v?.tamanho ?? "", disponivel: s.saldo };
  });

  const soma = (l: Item[]) => l.reduce((t, i) => t + i.quantidade, 0);
  const comEla = itens.filter((i) => i.situacao === "com_ela");
  const sessoesMes = sessoes.filter((s) => s.data >= inicioMes);
  const itensMes = itens.filter((i) => sessoesMes.some((s) => s.id === i.sessao_id));
  const pode = sessao.pode("marketing", "editar");
  const sessaoDe = (id: number) => sessoes.find((s) => s.id === id);

  const Peca = ({ i, comSessao = false }: { i: Item; comSessao?: boolean }) => {
    const v = vars.get(i.variante_id);
    const s = sessaoDe(i.sessao_id);
    return (
      <div className="mf-peca">
        <div className="mf-peca-topo">
          <span className="amostra" style={{ background: v?.cores?.hex ?? "#ccc" }} />
          <div className="mf-item-nome">
            <b>{comSessao ? modeloDe(i.variante_id) : `${v?.cores?.nome ?? ""} · ${v?.tamanho ?? ""}`}</b>
            <span>{comSessao ? `${v?.cores?.nome ?? ""} · ${v?.tamanho ?? ""}${s ? ` · ${s.evento} (${dataCurta(s.data).slice(0, 5)})` : ""}` : i.observacao ?? ""}</span>
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
      <Cabecalho titulo="Peças para fotos" descricao="Cada saída é uma sessão de fotos. As peças saem da Loja e voltam para ela."
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
        <section className="painel"><Vazio titulo="Nenhuma saída para fotos ainda" texto="Toque em “Nova saída para fotos”, diga o evento e escolha as peças." /></section>
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
            const modelos = [...new Set(doEvento.map((i) => modeloDe(i.variante_id)))].sort();
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
                      {doEvento.filter((i) => modeloDe(i.variante_id) === m).map((i) => <Peca key={i.id} i={i} />)}
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
          <JanelaLateral param="saida" titulo="Nova saída para fotos" subtitulo="Evento, data e as peças que estão saindo da loja" larga>
            <FormSaidaFotos variantes={variantes} hoje={hoje} />
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

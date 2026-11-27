import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { CartaoTarefa } from "@/components/tarefas/cartao";
import { LinhaTarefa } from "@/components/tarefas/linha";
import { QuandoTarefa } from "@/components/tarefas/quando";
import { Kanban } from "@/components/tarefas/kanban";
import { CamposTarefa } from "@/components/tarefas/campos-tarefa";
import { AREAS, COLUNAS_TAREFA, area, dataAmigavel, diaCurto, descreverRepete, diaSP, hojeSP, somarDias, type Tarefa } from "@/lib/tarefas";
import { numero } from "@/lib/formatos";
import { adicionarRapida, excluirTarefa, salvarTarefa } from "./acoes";

export const metadata = { title: "Minhas tarefas" };

const VISOES = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "kanban", rotulo: "Kanban" },
  { valor: "lista", rotulo: "Lista" },
];
const ORDEM_PRIORIDADE: Record<string, number> = { alta: 0, normal: 1, baixa: 2 };
const porPrioridade = (a: Tarefa, b: Tarefa) =>
  (ORDEM_PRIORIDADE[a.prioridade] ?? 1) - (ORDEM_PRIORIDADE[b.prioridade] ?? 1) || (a.data ?? "9").localeCompare(b.data ?? "9") || a.ordem - b.ordem;

function Grupo({ titulo, nota, tarefas, hoje, classe, mostrarData = true }: { titulo: string; nota?: string; tarefas: Tarefa[]; hoje: string; classe?: string; mostrarData?: boolean }) {
  if (!tarefas.length) return null;
  return (
    <section className={`tf-grupo${classe ? " " + classe : ""}`}>
      <header><h2>{titulo}</h2><span className="contador">{tarefas.length}</span>{nota && <p>{nota}</p>}</header>
      <div className="tf-pilha">{tarefas.map((t) => <CartaoTarefa key={t.id} t={t} hoje={hoje} mostrarData={mostrarData} />)}</div>
    </section>
  );
}

export default async function MinhasTarefas({ searchParams }: { searchParams: Promise<{ ver?: string; area?: string; tarefa?: string; status?: string }> }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar");
  if (!sessao.pode("tarefas", "ver")) redirect("/");
  const { ver: verPedido = "hoje", area: filtroArea = "", tarefa: abrir, status: statusNovo } = await searchParams;
  const ver = VISOES.some((v) => v.valor === verPedido) ? verPedido : "hoje";
  const hoje = hojeSP();
  const supabase = await supabaseServidor();
  const desde = somarDias(hoje, -14);

  const [{ data: tarefasR }, { data: feitasR }] = await Promise.all([
    supabase.from("tarefas").select(COLUNAS_TAREFA).or(`status.neq.feito,feita_em.gte.${desde}`).order("ordem").limit(1000),
    supabase.from("tarefa_feitas").select("tarefa_id, dia, feita_em").gte("feita_em", `${somarDias(hoje, -1)}T00:00:00-03:00`).order("feita_em", { ascending: false }),
  ]);
  const todas = ((tarefasR ?? []) as Tarefa[]).map((t) => ({ ...t, checklist: Array.isArray(t.checklist) ? t.checklist : [] }));
  const porId = new Map(todas.map((t) => [t.id, t]));
  const daArea = (t: Tarefa) => !filtroArea || t.area === filtroArea;

  // --- Hoje ---
  const abertas = todas.filter((t) => t.status !== "feito" && t.status !== "ideia" && daArea(t));
  const atrasadas = abertas.filter((t) => t.data && t.data < hoje).sort(porPrioridade);
  // Tela Hoje: rotina que ficou para trás aparece hoje, sem cara de atraso (ela volta sozinha).
  const listaHoje = abertas.filter((t) => t.data && t.data <= hoje && t.status !== "esperando")
    .sort((a, b) => (ORDEM_PRIORIDADE[a.prioridade] ?? 1) - (ORDEM_PRIORIDADE[b.prioridade] ?? 1) || Number(!!a.repete) - Number(!!b.repete) || a.ordem - b.ordem);
  const deHoje = abertas.filter((t) => t.data === hoje).sort((a, b) => Number(!a.repete) - Number(!b.repete) || porPrioridade(a, b));
  const fazendo = abertas.filter((t) => t.status === "fazendo" && (!t.data || t.data > hoje)).sort(porPrioridade);
  const esperando = abertas.filter((t) => t.status === "esperando" && (!t.data || t.data > hoje)).sort(porPrioridade);
  const proximos = abertas.filter((t) => t.data && t.data > hoje && t.data <= somarDias(hoje, 7) && !["fazendo", "esperando"].includes(t.status)).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || porPrioridade(a, b));
  const semData = abertas.filter((t) => !t.data && t.status === "a_fazer").sort(porPrioridade);
  const feitasHoje = [
    ...todas.filter((t) => t.status === "feito" && t.feita_em && diaSP(t.feita_em) === hoje),
    ...(feitasR ?? []).filter((f) => diaSP(f.feita_em) === hoje).map((f) => porId.get(f.tarefa_id)).filter((t): t is Tarefa => !!t)
      .map((t) => ({ ...t, status: "feito" })),
  ];
  const vistas = new Set<string>();
  const feitasHojeUnicas = feitasHoje.filter((t) => daArea(t) && (vistas.has(t.id) ? false : (vistas.add(t.id), true)));

  // --- Kanban e Lista ---
  const semRotina = todas.filter((t) => !t.repete && daArea(t));
  const rotinas = todas.filter((t) => t.repete && daArea(t)).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ver, ...(filtroArea ? { area: filtroArea } : {}), ...extra });
    return `/tarefas?${p}`;
  };
  const novaHref = (status = "a_fazer") => base({ tarefa: "nova", status });
  const editando = abrir && abrir !== "nova" ? porId.get(abrir) ?? null : null;
  const inicialNova: Partial<Tarefa> = { status: ["ideia", "a_fazer", "fazendo", "esperando"].includes(statusNovo ?? "") ? statusNovo : "a_fazer", area: filtroArea || "geral" };
  if (inicialNova.status === "ideia") inicialNova.data = null;

  const nome = sessao.pessoa?.nome?.split(" ")[0] ?? "";
  const totalHoje = atrasadas.length + deHoje.length;
  const feitasN = feitasHojeUnicas.length, totalDia = listaHoje.length + feitasN;
  const progresso = totalDia ? feitasN / totalDia : 0;
  const saudacao = (() => { const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; })();
  const dataExtenso = new Date(`${hoje}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Cabecalho
        titulo="Minhas tarefas"
        descricao={`Só você vê esta lista${nome ? `, ${nome}` : ""}. Rotinas voltam sozinhas; o resto você anota quando quiser.`}
        acoes={<Link className="botao" href={novaHref()} scroll={false}><Icone nome="mais" />Nova tarefa</Link>}
      />
      <Suspense><AvisoDaUrl /></Suspense>

      <FormAcao acao={adicionarRapida} className="tf-rapida" limparAoSalvar>
        <Icone nome="mais" />
        <input name="titulo" placeholder="O que você precisa fazer?" aria-label="Nova tarefa rápida" maxLength={200} autoComplete="off" required />
        <select name="area" aria-label="Área" defaultValue={filtroArea || "geral"}>
          {AREAS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
        </select>
        <QuandoTarefa hoje={hoje} />
        <BotaoEnviar className="botao pequeno" enviando="…">Anotar</BotaoEnviar>
      </FormAcao>

      <div className="tf-barra">
        <nav className="abas" aria-label="Visão">
          {VISOES.map((v) => (
            <Link key={v.valor} href={`/tarefas?ver=${v.valor}${filtroArea ? `&area=${filtroArea}` : ""}`} className={ver === v.valor ? "ativa" : undefined} aria-current={ver === v.valor ? "page" : undefined}>
              {v.rotulo}{v.valor === "hoje" && listaHoje.length > 0 && <span className="contador">{listaHoje.length}</span>}
            </Link>
          ))}
        </nav>
        {(
          <nav className="tf-areas" aria-label="Filtrar por área">
            <Link href={`/tarefas?ver=${ver}`} className={!filtroArea ? "ativa" : undefined}>Todas</Link>
            {AREAS.map((a) => (
              <Link key={a.valor} href={`/tarefas?ver=${ver}&area=${a.valor}`} className={filtroArea === a.valor ? "ativa" : undefined} style={{ ["--cor-area" as string]: a.cor }}><i />{a.rotulo}</Link>
            ))}
          </nav>
        )}
      </div>

      {ver === "hoje" && (
        <div className="tl tl-larga">
          <div className="tl-cabeca">
            <div>
              <p className="tl-data">{dataExtenso}</p>
              <p className="tl-resumo">{!totalDia ? "Nada para hoje." : listaHoje.length ? `${listaHoje.length} ${listaHoje.length === 1 ? "coisa" : "coisas"} para hoje${feitasN ? ` · ${feitasN} ${feitasN === 1 ? "feita" : "feitas"}` : ""}` : "Tudo feito por hoje 🎉"}</p>
            </div>
            <div className="tl-anel" style={{ ["--p" as string]: `${Math.round(progresso * 100)}%` }} aria-label={`${feitasN} de ${totalDia} feitas`}>
              <span>{feitasN}<small>/{totalDia}</small></span>
            </div>
          </div>
          <section className="tl-bloco">
            {listaHoje.length ? (
              <ul className="tl-lista">{listaHoje.map((t) => <LinhaTarefa key={t.id} t={t} hoje={hoje} />)}</ul>
            ) : (
              <div className="tl-vazio"><Icone nome="certo" tamanho={28} /><b>{feitasN ? "Tudo feito por hoje" : "Lista limpa"}</b><span>Anote acima o que aparecer.</span></div>
            )}
          </section>
          {esperando.length > 0 && (
            <details className="tl-mais" open>
              <summary>Esperando alguém <span>{esperando.length}</span></summary>
              <ul className="tl-lista">{esperando.map((t) => <LinhaTarefa key={t.id} t={t} hoje={hoje} />)}</ul>
            </details>
          )}
          {proximos.length + fazendo.length > 0 && (
            <details className="tl-mais">
              <summary>Próximos dias <span>{proximos.length + fazendo.length}</span></summary>
              <ul className="tl-lista">{[...fazendo, ...proximos].map((t) => <LinhaTarefa key={t.id} t={t} hoje={hoje} quando={t.data ? dataAmigavel(t.data, hoje) ?? undefined : "fazendo"} />)}</ul>
            </details>
          )}
          {semData.length > 0 && (
            <details className="tl-mais">
              <summary>Algum dia <span>{semData.length}</span></summary>
              <ul className="tl-lista">{semData.map((t) => <LinhaTarefa key={t.id} t={t} hoje={hoje} />)}</ul>
            </details>
          )}
          {feitasN > 0 && (
            <details className="tl-mais">
              <summary>Feitas hoje <span>{feitasN}</span></summary>
              <ul className="tl-lista">{feitasHojeUnicas.map((t) => <LinhaTarefa key={t.id} t={t} hoje={hoje} />)}</ul>
            </details>
          )}
        </div>
      )}

      {ver === "kanban" && (
        <>
          <Kanban tarefas={semRotina} hoje={hoje} novaBase={base({ tarefa: "nova" })} />
          <p className="mini" style={{ marginTop: 12 }}>As rotinas ({rotinas.length}) não entram no quadro para não encher as colunas: elas aparecem em Hoje no dia certo e na Lista.</p>
        </>
      )}

      {ver === "lista" && (
        <div className="tf-lista">
          {AREAS.filter((a) => !filtroArea || a.valor === filtroArea).map((a) => {
            const daqui = semRotina.filter((t) => t.area === a.valor && t.status !== "feito").sort((x, y) => (x.status === "ideia" ? 1 : 0) - (y.status === "ideia" ? 1 : 0) || porPrioridade(x, y));
            if (!daqui.length) return null;
            return (
              <section key={a.valor} className="painel tf-area-bloco" style={{ ["--cor-area" as string]: a.cor }}>
                <div className="painel-topo"><div><h2><i className="tf-ponto" />{a.rotulo}</h2><p>{daqui.filter((t) => t.status !== "ideia").length} a fazer · {daqui.filter((t) => t.status === "ideia").length} ideias</p></div></div>
                <div className="tf-pilha tf-pilha-lista">{daqui.map((t) => <CartaoTarefa key={t.id} t={t} hoje={hoje} />)}</div>
              </section>
            );
          })}
          {rotinas.length > 0 && (
            <section className="painel">
              <div className="painel-topo"><div><h2>Rotinas</h2><p>Voltam sozinhas depois de feitas</p></div></div>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Rotina</th><th>Área</th><th>Repete</th><th>Próxima vez</th></tr></thead>
                  <tbody>
                    {rotinas.map((t) => (
                      <tr key={t.id}>
                        <td><Link className="linha-link" href={base({ tarefa: t.id })} scroll={false}>{t.titulo}</Link></td>
                        <td className="mini">{area(t.area).rotulo}</td>
                        <td className="mini">{descreverRepete(t.repete)}</td>
                        <td className={t.data && t.data < hoje ? "atrasado" : undefined}>{dataAmigavel(t.data, hoje)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {!semRotina.some((t) => t.status !== "feito") && !rotinas.length && (
            <section className="painel"><Vazio titulo="Nenhuma tarefa aqui" texto="Anote acima ou use o botão Nova tarefa." /></section>
          )}
        </div>
      )}

      <Suspense>
        <JanelaLateral param="tarefa" valor="nova" limpar={["status"]} titulo="Nova tarefa" subtitulo="Só você vê.">
          <FormAcao acao={salvarTarefa}>
            <CamposTarefa inicial={inicialNova} hoje={hoje} />
            <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Salvando…">Criar tarefa</BotaoEnviar></div>
          </FormAcao>
        </JanelaLateral>
      </Suspense>
      {editando && (
        <Suspense>
          <JanelaLateral param="tarefa" valor={editando.id} titulo="Editar tarefa" subtitulo={editando.repete ? `Rotina · ${descreverRepete(editando.repete)}` : area(editando.area).rotulo}>
            <FormAcao acao={salvarTarefa}>
              <input type="hidden" name="id" value={editando.id} />
              <CamposTarefa key={editando.id} inicial={editando} hoje={hoje} />
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar</BotaoEnviar></div>
            </FormAcao>
            <FormAcao acao={excluirTarefa} className="tf-excluir">
              <input type="hidden" name="id" value={editando.id} />
              <BotaoEnviar className="botao-link perigo" enviando="Excluindo…">Excluir esta tarefa</BotaoEnviar>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

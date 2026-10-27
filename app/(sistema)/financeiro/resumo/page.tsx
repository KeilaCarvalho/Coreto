import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { EnviarDocumentos } from "@/components/documentos/enviar-documentos";
import { dataCurta, hojeExtenso, numero, quando, reais } from "@/lib/formatos";
import {
  ORIGENS_DOCUMENTO, PASTAS_DRIVE, SITUACOES_DOCUMENTO, TIPOS_DOCUMENTO, tituloDocumento, type DocumentoFinanceiro,
} from "@/lib/documentos";
import { apagarDocumento, marcarEtapa, registrarDocumentos, salvarDocumento } from "./acoes";

export const metadata = { title: "Resumo do dia" };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00-03:00`).getTime() + n * 864e5).toISOString().slice(0, 10);
const uuid = /^[0-9a-f-]{36}$/i;
const COLUNAS = "id, arquivo, nome_arquivo, tipo, origem, situacao, fornecedor, numero, valor, emitido_em, vence_em, categoria, observacao, lancado_conta_azul, lancado_em, anexado_conta_azul, anexado_em, salvo_drive, link_drive, pago, pago_em, criado_em";

/** Botão rápido que marca/desmarca uma etapa sem abrir a janela. */
function Etapa({ id, etapa, feito, rotulo, feitoRotulo }: { id: string; etapa: "lancado" | "anexado" | "pago"; feito: boolean; rotulo: string; feitoRotulo: string }) {
  return (
    <form action={marcarEtapa} className="cx-etapa">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="etapa" value={etapa} />
      <input type="hidden" name="valor" value={feito ? "0" : "1"} />
      <button type="submit" className={feito ? "cx-feito" : "cx-fazer"} title={feito ? `Desmarcar: ${feitoRotulo}` : `Marcar: ${rotulo}`}>
        {feito ? <Icone nome="certo" /> : null}{feito ? feitoRotulo : rotulo}
      </button>
    </form>
  );
}

function Vencimento({ vence, pago, hoje }: { vence: string | null; pago: boolean; hoje: string }) {
  if (!vence) return <span className="mini">sem vencimento</span>;
  if (pago) return <span className="etiqueta ok">pago</span>;
  if (vence < hoje) return <span className="etiqueta erro">venceu {dataCurta(vence).slice(0, 5)}</span>;
  if (vence === hoje) return <span className="etiqueta alerta">vence hoje</span>;
  return <span className="etiqueta neutra">vence {dataCurta(vence).slice(0, 5)}</span>;
}

export default async function ResumoDoDia({ searchParams }: { searchParams: Promise<{ ver?: string; doc?: string }> }) {
  const sessao = await exigir("financeiro");
  const { ver = "conferir", doc: docId } = await searchParams;
  const supabase = await supabaseServidor();
  const hoje = hojeSP();
  const semana = somarDias(hoje, 7);

  const { data, error: erroTabela } = await supabase.from("documentos_financeiros").select(COLUNAS)
    .neq("situacao", "descartado").order("criado_em", { ascending: false }).limit(500);
  const docs = (data ?? []) as DocumentoFinanceiro[];

  const chegouHoje = docs.filter((d) => diaSP(d.criado_em) === hoje);
  const paraConferir = docs.filter((d) => d.situacao === "entrada");
  const faltaLancar = docs.filter((d) => !d.lancado_conta_azul);
  const faltaAnexar = docs.filter((d) => !d.anexado_conta_azul);
  const pendenciasCA = docs.filter((d) => !d.lancado_conta_azul || !d.anexado_conta_azul)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const aVencer = docs.filter((d) => !d.pago && d.vence_em && d.vence_em <= semana)
    .sort((a, b) => (a.vence_em ?? "").localeCompare(b.vence_em ?? ""));
  const vencidas = aVencer.filter((d) => d.vence_em! < hoje);
  const totalVencer = aVencer.reduce((t, d) => t + Number(d.valor ?? 0), 0);
  const semValor = aVencer.filter((d) => d.valor == null).length;

  const lista = ver === "hoje" ? chegouHoje : ver === "todos" ? docs : paraConferir;
  const base = `/financeiro/resumo?ver=${ver}`;
  const podeEditar = sessao.pode("financeiro", "criar") || sessao.pode("financeiro", "editar");
  const podeApagar = sessao.pode("financeiro", "editar");

  // Janela de um documento: conferência
  let aberto: DocumentoFinanceiro | undefined;
  let linkArquivo: string | null = null;
  if (docId && uuid.test(docId)) {
    aberto = docs.find((d) => d.id === docId);
    if (!aberto) {
      const { data: um } = await supabase.from("documentos_financeiros").select(COLUNAS).eq("id", docId).maybeSingle();
      aberto = (um ?? undefined) as DocumentoFinanceiro | undefined;
    }
    if (aberto?.arquivo) {
      const { data: assinado } = await supabase.storage.from("documentos").createSignedUrl(aberto.arquivo, 900);
      linkArquivo = assinado?.signedUrl ?? null;
    }
  }
  const ehImagem = !!aberto?.arquivo && /\.(jpg|png|webp)$/.test(aberto.arquivo);

  return (
    <>
      <Cabecalho
        titulo="Resumo do dia"
        descricao={`${hojeExtenso()}. Jogue aqui tudo o que chegar (nota, cupom, boleto) e acompanhe até lançar e anexar no Conta Azul.`}
        acoes={<>
          <a className="botao leve" href={PASTAS_DRIVE.financeiro} target="_blank" rel="noopener noreferrer"><Icone nome="arquivo" />Pasta no Drive</a>
          {sessao.pode("financeiro", "criar") && <Link className="botao" href={`${base}&jogar=1`} scroll={false}><Icone nome="mais" />Jogar documentos</Link>}
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>
      {erroTabela && <p className="aviso alerta"><Icone nome="alerta" />Esta parte ainda está sendo ativada no banco de dados. Volte em alguns minutos.</p>}

      <div className="kpis">
        <Kpi destaque titulo="Chegou hoje" valor={numero(chegouHoje.length)}
          nota={paraConferir.length ? `${numero(paraConferir.length)} para conferir no total` : "nada esperando conferência"} href="/financeiro/resumo?ver=hoje" />
        <Kpi titulo="Falta lançar no Conta Azul" valor={numero(faltaLancar.length)}
          nota={faltaLancar.length ? reais(faltaLancar.reduce((t, d) => t + Number(d.valor ?? 0), 0)) + " em documentos" : "tudo lançado"} />
        <Kpi titulo="Falta anexar no Conta Azul" valor={numero(faltaAnexar.length)} nota={faltaAnexar.length ? "documento sem anexo no lançamento" : "tudo anexado"} />
        <Kpi titulo="Vence em 7 dias" valor={reais(totalVencer)}
          chip={vencidas.length ? `${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""} · ` : undefined}
          nota={`${numero(aVencer.length)} conta${aVencer.length === 1 ? "" : "s"}${semValor ? `, ${semValor} sem valor` : ""}`} />
      </div>

      <div className="grade-2 cx-grade">
        <section className="painel">
          <div className="painel-topo">
            <div><h2>Pendências do Conta Azul</h2><p>O que ainda não foi lançado ou anexado, do mais antigo para o mais novo</p></div>
            {pendenciasCA.length > 0 && <span className="etiqueta alerta">{numero(pendenciasCA.length)}</span>}
          </div>
          {pendenciasCA.length ? (
            <ul className="lista-simples cx-lista">
              {pendenciasCA.slice(0, 15).map((d) => (
                <li key={d.id}>
                  <span className="cx-quem">
                    <Link className="linha-link" href={`${base}&doc=${d.id}`} scroll={false}><b>{tituloDocumento(d)}</b></Link>
                    <span className="mini">{TIPOS_DOCUMENTO[d.tipo]} · {d.valor != null ? reais(Number(d.valor)) : "sem valor"} · chegou {dataCurta(diaSP(d.criado_em)).slice(0, 5)}</span>
                  </span>
                  {podeEditar && (
                    <span className="cx-botoes">
                      <Etapa id={d.id} etapa="lancado" feito={d.lancado_conta_azul} rotulo="Lancei" feitoRotulo="Lançado" />
                      <Etapa id={d.id} etapa="anexado" feito={d.anexado_conta_azul} rotulo="Anexei" feitoRotulo="Anexado" />
                    </span>
                  )}
                </li>
              ))}
              {pendenciasCA.length > 15 && <li><span className="mini">e mais {pendenciasCA.length - 15} na lista abaixo (aba Todos)</span></li>}
            </ul>
          ) : <Vazio titulo="Conta Azul em dia" texto="Tudo o que chegou já foi lançado e anexado." />}
        </section>

        <section className="painel">
          <div className="painel-topo">
            <div><h2>Vencimentos</h2><p>Vencidas e o que vence nos próximos 7 dias</p></div>
            {vencidas.length > 0 && <span className="etiqueta erro">{vencidas.length} vencida{vencidas.length > 1 ? "s" : ""}</span>}
          </div>
          {aVencer.length ? (
            <ul className="lista-simples cx-lista">
              {aVencer.map((d) => (
                <li key={d.id}>
                  <span className="cx-quem">
                    <Link className="linha-link" href={`${base}&doc=${d.id}`} scroll={false}><b>{tituloDocumento(d)}</b></Link>
                    <span className="mini">{TIPOS_DOCUMENTO[d.tipo]} · <Vencimento vence={d.vence_em} pago={d.pago} hoje={hoje} /></span>
                  </span>
                  <span className="cx-botoes">
                    <strong className="cx-valor">{d.valor != null ? reais(Number(d.valor)) : "—"}</strong>
                    {podeEditar && <Etapa id={d.id} etapa="pago" feito={d.pago} rotulo="Paguei" feitoRotulo="Pago" />}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Vazio titulo="Nada vencendo" texto="Quando você informar o vencimento na conferência, a conta aparece aqui." />}
        </section>
      </div>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-topo">
          <nav className="abas" aria-label="Ver">
            <Link href="/financeiro/resumo?ver=conferir" className={ver === "conferir" ? "ativa" : undefined}>Para conferir<span className="contador">{paraConferir.length}</span></Link>
            <Link href="/financeiro/resumo?ver=hoje" className={ver === "hoje" ? "ativa" : undefined}>Chegou hoje<span className="contador">{chegouHoje.length}</span></Link>
            <Link href="/financeiro/resumo?ver=todos" className={ver === "todos" ? "ativa" : undefined}>Todos</Link>
          </nav>
          <p>Clique num documento para conferir e completar os dados</p>
        </div>
        {lista.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Chegou</th><th>Documento</th><th>Situação</th><th>Vencimento</th><th>Conta Azul</th><th>Drive</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {lista.map((d) => (
                  <LinhaClicavel key={d.id} href={`${base}&doc=${d.id}`}>
                    <td>{dataCurta(diaSP(d.criado_em))}<div className="mini">{ORIGENS_DOCUMENTO[d.origem]}</div></td>
                    <td><Link className="linha-link" href={`${base}&doc=${d.id}`} scroll={false}>{tituloDocumento(d)}</Link>
                      <div className="mini">{TIPOS_DOCUMENTO[d.tipo]}{d.numero ? ` · nº ${d.numero}` : ""}{d.categoria ? ` · ${d.categoria}` : ""}</div></td>
                    <td><span className={`etiqueta ${d.situacao === "entrada" ? "alerta" : "ok"}`}>{SITUACOES_DOCUMENTO[d.situacao]}</span></td>
                    <td><Vencimento vence={d.vence_em} pago={d.pago} hoje={hoje} /></td>
                    <td>
                      <span className={`etiqueta ${d.lancado_conta_azul ? "ok" : "neutra"}`}>{d.lancado_conta_azul ? "lançado" : "não lançado"}</span>{" "}
                      <span className={`etiqueta ${d.anexado_conta_azul ? "ok" : "neutra"}`}>{d.anexado_conta_azul ? "anexado" : "sem anexo"}</span>
                    </td>
                    <td>{d.link_drive ? <a href={d.link_drive} target="_blank" rel="noopener noreferrer" className="etiqueta info">abrir</a> : d.salvo_drive ? <span className="etiqueta ok">salvo</span> : <span className="mini">—</span>}</td>
                    <td className="num"><strong>{d.valor != null ? reais(Number(d.valor)) : "—"}</strong></td>
                  </LinhaClicavel>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo={ver === "conferir" ? "Nada para conferir" : ver === "hoje" ? "Nada chegou hoje" : "Caixa de entrada vazia"}
            texto="Jogue as fotos e PDFs que chegarem pelo WhatsApp ou e-mail. Eles ficam aqui até você conferir.">
            {sessao.pode("financeiro", "criar") && <Link className="botao" href={`${base}&jogar=1`} scroll={false}><Icone nome="mais" />Jogar documentos</Link>}
          </Vazio>
        )}
      </section>

      <Suspense>
        <JanelaLateral param="jogar" titulo="Jogar documentos" subtitulo="Fotos ou PDFs de notas, cupons, boletos e faturas">
          <EnviarDocumentos registrar={registrarDocumentos} />
        </JanelaLateral>
      </Suspense>

      {aberto && (
        <Suspense>
          <JanelaLateral param="doc" valor={aberto.id} titulo={tituloDocumento(aberto)}
            subtitulo={`${TIPOS_DOCUMENTO[aberto.tipo]} · chegou por ${ORIGENS_DOCUMENTO[aberto.origem]} em ${quando(aberto.criado_em)}`} larga>
            {linkArquivo && (
              <a className="anexo-nota" href={linkArquivo} target="_blank" rel="noopener noreferrer">
                <Icone nome="arquivo" /><span><b>Abrir {aberto.arquivo?.endsWith(".pdf") ? "o PDF" : aberto.arquivo?.endsWith(".xml") ? "o XML" : "a foto"}</b><small>{aberto.nome_arquivo ?? "Abre em outra aba"}</small></span>
              </a>
            )}
            {ehImagem && linkArquivo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cx-previa" src={linkArquivo} alt={`Foto de ${tituloDocumento(aberto)}`} />
            )}

            <FormAcao acao={salvarDocumento}>
              <input type="hidden" name="id" value={aberto.id} />
              <div className="bloco-janela">
                <h3>Dados do documento</h3>
                <p>O que está escrito na nota ou no boleto</p>
                <div className="campos duas">
                  <div className="campo inteiro"><label htmlFor="d-fornecedor">Fornecedor</label><input id="d-fornecedor" name="fornecedor" defaultValue={aberto.fornecedor ?? ""} placeholder="Quem emitiu" /></div>
                  <div className="campo"><label htmlFor="d-valor">Valor</label><input id="d-valor" name="valor" inputMode="decimal" defaultValue={aberto.valor != null ? String(aberto.valor).replace(".", ",") : ""} placeholder="0,00" /></div>
                  <div className="campo"><label htmlFor="d-numero">Número</label><input id="d-numero" name="numero" defaultValue={aberto.numero ?? ""} placeholder="nº da nota ou do boleto" /></div>
                  <div className="campo"><label htmlFor="d-emitido">Emitido em</label><input id="d-emitido" name="emitido_em" type="date" defaultValue={aberto.emitido_em ?? ""} /></div>
                  <div className="campo"><label htmlFor="d-vence">Vence em</label><input id="d-vence" name="vence_em" type="date" defaultValue={aberto.vence_em ?? ""} /></div>
                  <div className="campo"><label htmlFor="d-tipo">O que é</label>
                    <select id="d-tipo" name="tipo" defaultValue={aberto.tipo}>{Object.entries(TIPOS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
                  <div className="campo"><label htmlFor="d-origem">Chegou por</label>
                    <select id="d-origem" name="origem" defaultValue={aberto.origem}>{Object.entries(ORIGENS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
                  <div className="campo"><label htmlFor="d-categoria">Categoria</label><input id="d-categoria" name="categoria" defaultValue={aberto.categoria ?? ""} placeholder="Ex.: Tecidos, Energia, Aluguel" list="cx-categorias" />
                    <datalist id="cx-categorias">{[...new Set(docs.map((d) => d.categoria).filter(Boolean))].map((c) => <option key={c!} value={c!} />)}</datalist></div>
                  <div className="campo"><label htmlFor="d-situacao">Situação</label>
                    <select id="d-situacao" name="situacao" defaultValue={aberto.situacao === "entrada" ? "conferido" : aberto.situacao}>{Object.entries(SITUACOES_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
                  <div className="campo inteiro"><label htmlFor="d-obs">Observação</label><textarea id="d-obs" name="observacao" defaultValue={aberto.observacao ?? ""} placeholder="Algo para lembrar depois" style={{ minHeight: 64 }} /></div>
                </div>
              </div>

              <div className="bloco-janela">
                <h3>Andamento</h3>
                <p>Marque o que já foi feito. O que não estiver marcado fica nas pendências.</p>
                <div className="cx-checklist">
                  <label><input type="checkbox" name="lancado_conta_azul" defaultChecked={aberto.lancado_conta_azul} /><span><b>Lançado no Conta Azul</b>{aberto.lancado_em && <small>em {quando(aberto.lancado_em)}</small>}</span></label>
                  <label><input type="checkbox" name="anexado_conta_azul" defaultChecked={aberto.anexado_conta_azul} /><span><b>Anexado no Conta Azul</b>{aberto.anexado_em && <small>em {quando(aberto.anexado_em)}</small>}</span></label>
                  <label><input type="checkbox" name="salvo_drive" defaultChecked={aberto.salvo_drive} /><span><b>Salvo na pasta NF DE ENTRADA</b><small><a href={PASTAS_DRIVE.nfEntrada} target="_blank" rel="noopener noreferrer">abrir a pasta no Drive</a></small></span></label>
                  <label><input type="checkbox" name="pago" defaultChecked={aberto.pago} /><span><b>Pago</b>{aberto.pago_em && <small>em {dataCurta(aberto.pago_em)}</small>}</span></label>
                </div>
                <div className="campo" style={{ marginTop: 14 }}><label htmlFor="d-drive">Link do arquivo no Drive (opcional)</label><input id="d-drive" name="link_drive" defaultValue={aberto.link_drive ?? ""} placeholder="https://drive.google.com/…" /></div>
              </div>

              {podeEditar && <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Salvando…">Salvar conferência</BotaoEnviar></div>}
            </FormAcao>

            {podeApagar && (
              <FormAcao acao={apagarDocumento}>
                <input type="hidden" name="id" value={aberto.id} />
                <div className="bloco-janela" style={{ marginTop: 14 }}>
                  <h3>Jogou por engano?</h3>
                  <p>Se for repetido ou não for da Coreto, apague. Some daqui e do armazenamento. Para guardar sem pendência, use a situação “Descartado”.</p>
                  <BotaoEnviar className="botao perigo" enviando="Apagando…">Apagar documento</BotaoEnviar>
                </div>
              </FormAcao>
            )}
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}

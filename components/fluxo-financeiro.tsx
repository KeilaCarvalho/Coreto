"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Icone } from "@/components/icone";
import type { EstadoAcao } from "@/components/form-acao";
import { dataPorExtenso, mesPorExtenso, totaisFluxo, type DadosFluxo, type LinhaValor } from "@/lib/fluxo";

type Rascunho = { nome: string; valor: string };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "1.234,56", "1234.56" ou "R$ 89,90" → número; vazio → 0. */
function num(texto: string) {
  const t = String(texto ?? "").replace(/R\$|\s/g, "");
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
const paraCampo = (v: number) => (v ? v.toFixed(2).replace(".", ",") : "");
const rascunho = (linhas: LinhaValor[]): Rascunho[] => linhas.map((l) => ({ nome: l.nome, valor: paraCampo(l.valor) }));
const limpar = (linhas: Rascunho[]): LinhaValor[] =>
  linhas.map((l) => ({ nome: l.nome.trim(), valor: Math.round(num(l.valor) * 100) / 100 })).filter((l) => l.nome && l.valor !== 0);

function Linhas({ titulo, ajuda, linhas, mudar, rotuloNome, rotuloTotal, editavel }: {
  titulo: string; ajuda: string; linhas: Rascunho[]; mudar: (l: Rascunho[]) => void; rotuloNome: string; rotuloTotal: string; editavel: boolean;
}) {
  const total = linhas.reduce((t, l) => t + num(l.valor), 0);
  return (
    <div className="bloco-fluxo">
      <h3>{titulo}</h3>
      <p>{ajuda}</p>
      <div className="linhas-valor">
        {linhas.map((l, i) => (
          <div className="linha-valor" key={i}>
            <input className="entrada" value={l.nome} placeholder={rotuloNome} aria-label={rotuloNome} disabled={!editavel}
              onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <input className="entrada valor" value={l.valor} inputMode="decimal" placeholder="0,00" aria-label={`Valor de ${l.nome || rotuloNome}`} disabled={!editavel}
              onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            {editavel
              ? <button type="button" className="icone-botao" onClick={() => mudar(linhas.filter((_, j) => j !== i))} aria-label="Remover linha"><Icone nome="fechar" /></button>
              : <span />}
          </div>
        ))}
      </div>
      {editavel && (
        <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => mudar([...linhas, { nome: "", valor: "" }])}>
          <Icone nome="mais" />Adicionar linha
        </button>
      )}
      <div className="total-bloco"><span>{rotuloTotal}</span><span>{brl(total)}</span></div>
    </div>
  );
}

function Distribuicao({ linhas }: { linhas: LinhaValor[] }) {
  const total = linhas.reduce((t, l) => t + l.valor, 0);
  const maior = Math.max(1, ...linhas.map((l) => l.valor));
  if (!linhas.length) return <p className="painel-corpo mini">Nada informado.</p>;
  return (
    <div className="distribuicao">
      {[...linhas].sort((a, b) => b.valor - a.valor).map((l) => (
        <div className="linha" key={l.nome}>
          <span>{l.nome}</span>
          <span className="trilha-barra"><i style={{ width: `${Math.max(2, (l.valor / maior) * 100)}%` }} /></span>
          <span className="valor">{brl(l.valor)} <span className="mini">{total ? `${Math.round((l.valor / total) * 100)}%` : ""}</span></span>
        </div>
      ))}
    </div>
  );
}

export function FluxoFinanceiro({ inicial, editavel, salvar, rodape }: {
  inicial: DadosFluxo; editavel: boolean;
  salvar: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
  rodape?: string;
}) {
  const [aba, setAba] = useState<"lancamentos" | "visualizacao">(editavel ? "lancamentos" : "visualizacao");
  const [vendasDia, setVendasDia] = useState(rascunho(inicial.vendasDia));
  const [vendasMes, setVendasMes] = useState(rascunho(inicial.vendasMes));
  const [saldos, setSaldos] = useState(rascunho(inicial.saldos));
  const [aReceber, setAReceber] = useState(rascunho(inicial.aReceber));
  const [vendedoras, setVendedoras] = useState(rascunho(inicial.vendedoras));
  const [contasAPagar, setContasAPagar] = useState(paraCampo(inicial.contasAPagar));
  const [contasPagas, setContasPagas] = useState(paraCampo(inicial.contasPagas));
  const [observacao, setObservacao] = useState(inicial.observacao);
  const [estado, enviar, salvando] = useActionState(salvar, null);
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const dados: DadosFluxo = useMemo(() => ({
    data: inicial.data,
    vendasDia: limpar(vendasDia), vendasMes: limpar(vendasMes), saldos: limpar(saldos), aReceber: limpar(aReceber),
    vendedoras: limpar(vendedoras), contasAPagar: num(contasAPagar), contasPagas: num(contasPagas), observacao,
  }), [inicial.data, vendasDia, vendasMes, saldos, aReceber, vendedoras, contasAPagar, contasPagas, observacao]);
  const salvo = useMemo(() => JSON.stringify(inicial), [inicial]);
  const [ultimoSalvo, setUltimoSalvo] = useState(salvo);
  useEffect(() => { if (estado?.ok) setUltimoSalvo(JSON.stringify(dados)); }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setUltimoSalvo(salvo), [salvo]);
  const alterado = editavel && JSON.stringify(dados) !== ultimoSalvo;
  const t = totaisFluxo(dados);

  async function pdf(): Promise<File | null> {
    setGerando(true);
    setAviso(null);
    try {
      const { gerarPdfFluxo, nomeDoPdf } = await import("@/lib/pdf-fluxo");
      const blob = await gerarPdfFluxo(dados);
      return new File([blob], nomeDoPdf(dados.data), { type: "application/pdf" });
    } catch (e) {
      setAviso({ tipo: "erro", texto: `Não consegui gerar o PDF: ${(e as Error).message}` });
      return null;
    } finally {
      setGerando(false);
    }
  }

  function baixar(arquivo: File) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url; a.download = arquivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function baixarPdf() {
    const arquivo = await pdf();
    if (arquivo) { baixar(arquivo); setAviso({ tipo: "ok", texto: "PDF baixado." }); }
  }

  async function enviarDeborah() {
    const arquivo = await pdf();
    if (!arquivo) return;
    const texto = `Fluxo financeiro da Coreto de ${dados.data.split("-").reverse().join("/")}.`;
    try {
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: "Fluxo financeiro Coreto", text: texto });
        setAviso({ tipo: "ok", texto: "Pronto. Escolha o WhatsApp e a conversa da Deborah na janela que abriu." });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    baixar(arquivo);
    setAviso({ tipo: "ok", texto: "Este navegador não envia arquivos direto para o WhatsApp. O PDF foi baixado: anexe na conversa da Deborah." });
  }

  return (
    <form action={enviar}>
      <input type="hidden" name="data" value={dados.data} />
      <input type="hidden" name="dados" value={JSON.stringify(dados)} />

      <section className="painel">
        <div className="painel-topo">
          <div className="abas" role="tablist">
            {editavel && <button type="button" role="tab" aria-selected={aba === "lancamentos"} className={aba === "lancamentos" ? "ativa" : undefined} onClick={() => setAba("lancamentos")}>Lançamentos</button>}
            <button type="button" role="tab" aria-selected={aba === "visualizacao"} className={aba === "visualizacao" ? "ativa" : undefined} onClick={() => setAba("visualizacao")}>Visualização</button>
          </div>
          {rodape && <p className="mini">{rodape}</p>}
        </div>

        {estado?.erro && <p className="aviso erro" role="alert" style={{ margin: "0 22px 16px" }}><Icone nome="alerta" />{estado.erro}</p>}
        {estado?.ok && !alterado && <p className="aviso ok" role="status" style={{ margin: "0 22px 16px" }}><Icone nome="certo" />{estado.ok}</p>}
        {aviso && <p className={`aviso ${aviso.tipo}`} role="status" style={{ margin: "0 22px 16px" }}><Icone nome={aviso.tipo === "ok" ? "certo" : "alerta"} />{aviso.texto}</p>}

        <div hidden={aba !== "lancamentos"} className="painel-corpo">
          <div className="grade-2">
            <div>
              <h2 style={{ fontSize: 16.5, marginBottom: 14 }}>Do dia · {dados.data.split("-").reverse().join("/")}</h2>
              <Linhas titulo="Vendas do dia anterior" ajuda="Fechamento do caixa por forma de pagamento." linhas={vendasDia} mudar={setVendasDia}
                rotuloNome="Forma de pagamento" rotuloTotal="Total do dia" editavel={editavel} />
              <Linhas titulo="Saldos bancários" ajuda="Saldo de cada conta hoje. O total soma sozinho." linhas={saldos} mudar={setSaldos}
                rotuloNome="Banco ou conta" rotuloTotal="Saldo total" editavel={editavel} />
              <Linhas titulo="Contas a receber" ajuda="Ex.: Pagarme, link de pagamento, cheque." linhas={aReceber} mudar={setAReceber}
                rotuloNome="Referência" rotuloTotal="Total a receber" editavel={editavel} />
            </div>
            <div>
              <h2 style={{ fontSize: 16.5, marginBottom: 14 }}>Do mês · {mesPorExtenso(dados.data)}</h2>
              <Linhas titulo="Vendas do mês" ajuda="Acumulado por forma de pagamento. Vale para todos os dias do mês." linhas={vendasMes} mudar={setVendasMes}
                rotuloNome="Forma de pagamento" rotuloTotal="Total do mês" editavel={editavel} />
              <div className="bloco-fluxo">
                <h3>Contas do mês</h3>
                <p>Total que ainda falta pagar e total já pago no mês.</p>
                <div className="campos duas">
                  <div className="campo"><label htmlFor="contas-a-pagar">A pagar (R$)</label>
                    <input id="contas-a-pagar" inputMode="decimal" value={contasAPagar} onChange={(e) => setContasAPagar(e.target.value)} placeholder="0,00" disabled={!editavel} /></div>
                  <div className="campo"><label htmlFor="contas-pagas">Pagas (R$)</label>
                    <input id="contas-pagas" inputMode="decimal" value={contasPagas} onChange={(e) => setContasPagas(e.target.value)} placeholder="0,00" disabled={!editavel} /></div>
                </div>
              </div>
              <Linhas titulo="Vendas por vendedora" ajuda="Quanto cada vendedora já vendeu no mês." linhas={vendedoras} mudar={setVendedoras}
                rotuloNome="Vendedora" rotuloTotal="Total das vendedoras" editavel={editavel} />
              <div className="bloco-fluxo">
                <h3>Observações para a Deborah</h3>
                <p>Opcional. Sai no fim do PDF.</p>
                <div className="campo"><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} aria-label="Observações" placeholder="Ex.: boleto do tecido vence dia 20" disabled={!editavel} /></div>
              </div>
            </div>
          </div>
        </div>

        <div hidden={aba !== "visualizacao"}>
          <div className="painel-corpo" style={{ paddingTop: 0 }}>
            <p className="mini" style={{ marginBottom: 14 }}>{dataPorExtenso(dados.data)}</p>
            <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="kpi destaque"><div className="kpi-topo">Vendas do mês</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.vendasMes)}</p><p className="kpi-nota">acumulado</p></div>
              <div className="kpi"><div className="kpi-topo">Vendas do dia anterior</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.vendasDia)}</p><p className="kpi-nota">fechamento do caixa</p></div>
              <div className="kpi"><div className="kpi-topo">Saldo em conta</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.saldo)}</p><p className="kpi-nota">{dados.saldos.length} contas</p></div>
              <div className="kpi"><div className="kpi-topo">Contas pagas no mês</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.contasPagas)}</p></div>
              <div className="kpi"><div className="kpi-topo">Contas a pagar</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.contasAPagar)}</p></div>
              <div className="kpi"><div className="kpi-topo">Contas a receber</div><p className="kpi-valor" style={{ fontSize: 30 }}>{brl(t.aReceber)}</p></div>
            </div>
            <p className={`aviso ${t.saldo + t.aReceber - t.contasAPagar >= 0 ? "ok" : "alerta"}`}>
              Saldo em conta + a receber − contas a pagar: <strong style={{ marginLeft: 4 }}>{brl(t.saldo + t.aReceber - t.contasAPagar)}</strong>
            </p>
          </div>
          <div className="grade-2" style={{ padding: "0 22px 22px" }}>
            <section className="painel" style={{ boxShadow: "none", border: "1px solid var(--linha)" }}><div className="painel-topo"><div><h2>Vendas do dia anterior</h2></div><strong>{brl(t.vendasDia)}</strong></div><Distribuicao linhas={dados.vendasDia} /></section>
            <section className="painel" style={{ boxShadow: "none", border: "1px solid var(--linha)" }}><div className="painel-topo"><div><h2>Vendas do mês</h2></div><strong>{brl(t.vendasMes)}</strong></div><Distribuicao linhas={dados.vendasMes} /></section>
            <section className="painel" style={{ boxShadow: "none", border: "1px solid var(--linha)" }}><div className="painel-topo"><div><h2>Saldos por conta</h2></div><strong>{brl(t.saldo)}</strong></div><Distribuicao linhas={dados.saldos} /></section>
            <section className="painel" style={{ boxShadow: "none", border: "1px solid var(--linha)" }}><div className="painel-topo"><div><h2>Vendas por vendedora</h2></div><strong>{brl(t.vendedoras)}</strong></div><Distribuicao linhas={dados.vendedoras} /></section>
          </div>
        </div>
      </section>

      <div className="barra-acoes">
        {alterado && <span className="mini" style={{ alignSelf: "center", marginRight: "auto" }}>Alterações ainda não salvas</span>}
        <button type="button" className="botao leve" onClick={baixarPdf} disabled={gerando}><Icone nome="baixar" />{gerando ? "Gerando…" : "Baixar PDF"}</button>
        <button type="button" className="botao whatsapp" onClick={enviarDeborah} disabled={gerando}><Icone nome="whatsapp" />Enviar para a Deborah</button>
        {editavel && <button type="submit" className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar lançamentos"}</button>}
      </div>
    </form>
  );
}

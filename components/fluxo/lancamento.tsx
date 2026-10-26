"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icone } from "@/components/icone";
import type { EstadoAcao } from "@/components/form-acao";
import { dataPorExtenso, nomeDoDia, rotuloPeriodo, type DadosFluxo } from "@/lib/fluxo";

type Acao = (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
type LinhaTexto = { nome: string; valor: string };
type LinhaVendaTexto = { nome: string; dias: string[]; mes: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** "1.234,56", "1234.56" ou "R$ 89,90" → número; vazio → 0. */
export function num(texto: string) {
  const t = String(texto ?? "").replace(/R\$|\s/g, "");
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
const campo = (v: number) => (v ? v.toFixed(2).replace(".", ",") : "");
const r2 = (n: number) => Math.round(n * 100) / 100;

const SECOES = [
  { id: "b-vendas", nome: "Vendas" },
  { id: "b-bancos", nome: "Bancos" },
  { id: "b-receber", nome: "A receber" },
  { id: "b-contas-mes", nome: "Contas do mês" },
  { id: "b-equipe", nome: "Equipe" },
];

function Linhas({ linhas, mudar, rotulo, rotuloValor = "Valor" }: {
  linhas: LinhaTexto[]; mudar: (l: LinhaTexto[]) => void; rotulo: string; rotuloValor?: string;
}) {
  return (
    <>
      <div className="fx-linhas">
        <div className="fx-linha cab"><b>{rotulo}</b><span>{rotuloValor}</span><i /></div>
        {linhas.map((l, i) => (
          <div className="fx-linha" key={i}>
            <input className="fx-in" value={l.nome} placeholder={rotulo} aria-label={rotulo}
              onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <input className="fx-in valor" value={l.valor} inputMode="decimal" placeholder="0,00" aria-label={`Valor de ${l.nome || rotulo}`}
              onChange={(e) => mudar(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            <button type="button" className="fx-tirar" onClick={() => mudar(linhas.filter((_, j) => j !== i))} aria-label="Tirar linha"><Icone nome="fechar" tamanho={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => mudar([...linhas, { nome: "", valor: "" }])}>
        <Icone nome="mais" />Adicionar linha
      </button>
      <div className="fx-subtotal"><span>Total</span><span>{brl(linhas.reduce((t, l) => t + num(l.valor), 0))}</span></div>
    </>
  );
}

/** Janela lateral para lançar ou corrigir um dia. Abre com ?lancar= na URL (o valor é a seção para onde rolar). */
export function JanelaLancamento({ inicial, novo, salvar, contasPadrao = [] }: { inicial: DadosFluxo; novo: boolean; salvar: Acao; contasPadrao?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const secao = params.get("lancar");
  const aberta = secao !== null;
  const corpo = useRef<HTMLDivElement>(null);
  const urlDoDia = `/financeiro/fluxo?data=${inicial.data}`;
  const fechar = () => router.replace(urlDoDia, { scroll: false });

  const nDias = inicial.diasVenda.length;
  const vendasIniciais: LinhaVendaTexto[] = useMemo(() => {
    const nomes = [...new Set([...inicial.vendasDia.map((v) => v.nome), ...inicial.vendasMes.map((v) => v.nome)])];
    return nomes.map((nome) => {
      const d = inicial.vendasDia.find((v) => v.nome === nome);
      const m = inicial.vendasMes.find((v) => v.nome === nome);
      return { nome, dias: Array.from({ length: nDias }, (_, k) => campo(d?.dias[k] ?? 0)), mes: campo(m?.valor ?? 0) };
    });
  }, [inicial, nDias]);
  const texto = (l: { nome: string; valor: number }[]) => l.map((x) => ({ nome: x.nome, valor: campo(x.valor) }));

  const [vendas, setVendas] = useState(vendasIniciais);
  const [saldos, setSaldos] = useState(texto(inicial.saldos));
  const [aReceber, setAReceber] = useState(texto(inicial.aReceber));
  const [vendedoras, setVendedoras] = useState(texto(inicial.vendedoras));
  const [contasAPagar, setContasAPagar] = useState(campo(inicial.contasAPagar));
  const [contasPagas, setContasPagas] = useState(campo(inicial.contasPagas));
  const [guardarContas, setGuardarContas] = useState<boolean | null>(null);
  const [estado, enviar, salvando] = useActionState(salvar, null);

  useEffect(() => {
    if (estado?.ok) router.replace(`${urlDoDia}&salvo=1`, { scroll: false });
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    if (secao && secao.startsWith("b-")) setTimeout(() => document.getElementById(secao)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, [aberta, secao]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aberta) return null;

  const limpa = (l: LinhaTexto[]) => l.map((x) => ({ nome: x.nome.trim(), valor: r2(num(x.valor)) })).filter((x) => x.nome && x.valor !== 0);
  const vendasLimpas = vendas.map((v) => ({ nome: v.nome.trim(), dias: v.dias.map((d) => r2(num(d))), mes: r2(num(v.mes)) })).filter((v) => v.nome);
  const totalDias = inicial.diasVenda.map((_, k) => vendasLimpas.reduce((t, v) => t + (v.dias[k] ?? 0), 0));
  const totalPeriodo = totalDias.reduce((t, n) => t + n, 0);
  const totalMes = vendasLimpas.reduce((t, v) => t + v.mes, 0);
  const nomesContas = [...new Set(saldos.map((x) => x.nome.trim()).filter(Boolean))];
  const contasMudaram = nomesContas.join("|") !== contasPadrao.join("|");
  const guardar = guardarContas ?? (!contasPadrao.length || contasMudaram);
  const pacote = JSON.stringify({
    data: inicial.data,
    vendasDia: vendasLimpas.filter((v) => v.dias.some((d) => d !== 0)).map((v) => ({ nome: v.nome, valor: r2(v.dias.reduce((t, n) => t + n, 0)), dias: v.dias })),
    vendasMes: vendasLimpas.filter((v) => v.mes !== 0).map((v) => ({ nome: v.nome, valor: v.mes })),
    saldos: limpa(saldos), aReceber: limpa(aReceber), vendedoras: limpa(vendedoras),
    contasAPagar: r2(num(contasAPagar)), contasPagas: r2(num(contasPagas)), observacao: inicial.observacao,
    contasPadrao: guardar && contasMudaram ? nomesContas : null,
  });
  const colunas = `minmax(0,1fr) ${inicial.diasVenda.map(() => "minmax(92px,120px)").join(" ")} minmax(92px,120px) 34px`;
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fx-janela-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <form className="fx-janela" action={enviar} role="dialog" aria-modal="true" aria-labelledby="fx-janela-titulo">
        <input type="hidden" name="dados" value={pacote} />
        <div className="fx-janela-topo">
          <div>
            <h2 id="fx-janela-titulo">{novo ? "Lançar dia" : "Editar lançamento"}</h2>
            <p>{dataPorExtenso(inicial.data)} · {rotuloPeriodo(inicial.diasVenda).toLowerCase()}</p>
          </div>
          <button type="button" className="icone-botao" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        <nav className="fx-passos" aria-label="Ir para">
          {SECOES.map((s) => <button type="button" key={s.id} onClick={() => ir(s.id)}>{s.nome}</button>)}
        </nav>

        <div className="fx-janela-corpo" ref={corpo}>
          {estado?.erro && <p className="aviso erro" role="alert"><Icone nome="alerta" />{estado.erro}</p>}
          {novo && <p className="aviso alerta"><Icone nome="alerta" />Os nomes das contas, do que tem a receber e das vendedoras vieram do último dia lançado. Confira os valores.</p>}

          <section className="fx-bloco" id="b-vendas">
            <h3>Vendas por forma de pagamento</h3>
            <p>{nDias > 1 ? "Na segunda entram as vendas de sexta e de sábado, cada dia na sua coluna." : `Vendas de ${nomeDoDia(inicial.diasVenda[0] ?? inicial.data)}.`} “No mês” é o acumulado do mês até esse dia.</p>
            <div className="fx-linhas">
              <div className="fx-linha cab" style={{ gridTemplateColumns: colunas }}>
                <b>Forma</b>
                {inicial.diasVenda.map((d) => <span key={d}>{nomeDoDia(d)} {d.slice(8, 10)}</span>)}
                <span>No mês</span><i />
              </div>
              {vendas.map((v, i) => (
                <div className="fx-linha" key={i} style={{ gridTemplateColumns: colunas }}>
                  <input className="fx-in" value={v.nome} placeholder="Forma de pagamento" aria-label="Forma de pagamento"
                    onChange={(e) => setVendas(vendas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                  {v.dias.map((d, k) => (
                    <input key={k} className="fx-in valor" value={d} inputMode="decimal" placeholder="0,00" aria-label={`${v.nome} em ${nomeDoDia(inicial.diasVenda[k])}`}
                      onChange={(e) => setVendas(vendas.map((x, j) => (j === i ? { ...x, dias: x.dias.map((y, z) => (z === k ? e.target.value : y)) } : x)))} />
                  ))}
                  <input className="fx-in valor" value={v.mes} inputMode="decimal" placeholder="0,00" aria-label={`${v.nome} no mês`}
                    onChange={(e) => setVendas(vendas.map((x, j) => (j === i ? { ...x, mes: e.target.value } : x)))} />
                  <button type="button" className="fx-tirar" onClick={() => setVendas(vendas.filter((_, j) => j !== i))} aria-label="Tirar linha"><Icone nome="fechar" tamanho={16} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="botao leve pequeno" style={{ marginTop: 10 }} onClick={() => setVendas([...vendas, { nome: "", dias: inicial.diasVenda.map(() => ""), mes: "" }])}>
              <Icone nome="mais" />Adicionar forma
            </button>
            <div className="fx-subtotal">
              <span>{nDias > 1 ? inicial.diasVenda.map((d, k) => `${nomeDoDia(d)} ${brl(totalDias[k])}`).join(" · ") : rotuloPeriodo(inicial.diasVenda)}</span>
              <span>{brl(totalPeriodo)}</span>
            </div>
            <div className="fx-subtotal" style={{ marginTop: 6, background: "var(--superficie-2)" }}><span>No mês</span><span>{brl(totalMes)}</span></div>
          </section>

          <section className="fx-bloco" id="b-bancos">
            <h3>Saldo nos bancos</h3>
            <p>Quanto tem em cada conta hoje.</p>
            <Linhas linhas={saldos} mudar={setSaldos} rotulo="Conta" rotuloValor="Saldo" />
            {contasMudaram ? (
              <label className="guardar-padrao">
                <input type="checkbox" checked={guardar} onChange={(e) => setGuardarContas(e.target.checked)} />
                <span><b style={{ display: "block" }}>{contasPadrao.length ? "Atualizar as contas padrão" : "Guardar estas contas como padrão"}</b>
                  As contas ({nomesContas.join(", ") || "nenhuma"}) vêm preenchidas em todo dia novo, mesmo quando o saldo ficar zerado.</span>
              </label>
            ) : contasPadrao.length > 0 && (
              <p className="mini" style={{ marginTop: 8 }}><Icone nome="certo" tamanho={14} /> Estas são as contas padrão: vêm preenchidas em todo dia novo.</p>
            )}
          </section>

          <section className="fx-bloco" id="b-receber">
            <h3>A receber</h3>
            <p>Valores que ainda vão entrar (cartão, crediário, depósitos).</p>
            <Linhas linhas={aReceber} mudar={setAReceber} rotulo="Referência" />
          </section>

          <section className="fx-bloco" id="b-contas-mes">
            <h3>Contas do mês</h3>
            <p>Quanto já foi pago e quanto ainda falta pagar no mês.</p>
            <div className="fx-dois">
              <label>Já pagas<input className="fx-in valor" value={contasPagas} inputMode="decimal" placeholder="0,00" onChange={(e) => setContasPagas(e.target.value)} /></label>
              <label>Ainda a pagar<input className="fx-in valor" value={contasAPagar} inputMode="decimal" placeholder="0,00" onChange={(e) => setContasAPagar(e.target.value)} /></label>
            </div>
          </section>

          <section className="fx-bloco" id="b-equipe">
            <h3>Equipe no mês</h3>
            <p>Quanto cada vendedora vendeu no mês até agora.</p>
            <Linhas linhas={vendedoras} mudar={setVendedoras} rotulo="Vendedora" rotuloValor="No mês" />
          </section>

        </div>

        <div className="fx-janela-rodape">
          <span className="resumo">{rotuloPeriodo(inicial.diasVenda)}: <b>{brl(totalPeriodo)}</b></span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="botao leve" onClick={fechar}>Cancelar</button>
            <button type="submit" className="botao" disabled={salvando}><Icone nome="certo" />{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

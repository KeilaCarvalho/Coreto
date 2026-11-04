"use client";

import { dataBR, percentualBR, tipoItem, type Folha, type LinhaFolha } from "@/lib/folha";

/*
 * Recibos da folha: uma página A4 por pessoa (e um resumo na frente quando sai a equipe toda).
 * Mesmo visual do fluxo: azul da logo, detalhes em preto, cartões com sombra.
 */

type Cor = [number, number, number];
const C = {
  azul: [0, 206, 209] as Cor, azulClaro: [226, 247, 247] as Cor, preto: [22, 25, 23] as Cor, suave: [92, 102, 102] as Cor,
  tenue: [150, 160, 160] as Cor, linha: [214, 228, 228] as Cor, fundo: [242, 249, 249] as Cor, sombra: [0, 70, 72] as Cor, branco: [255, 255, 255] as Cor,
  erro: [180, 35, 24] as Cor,
};
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (v: number) => moeda.format(v).replace(/\s/g, " ");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

async function imagem(caminho: string): Promise<string | null> {
  try {
    const r = await fetch(caminho);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((ok) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => ok(null); l.readAsDataURL(blob); });
  } catch { return null; }
}

export async function gerarPdfFolha(folha: Folha, linhas: LinhaFolha[], soUma?: string): Promise<Blob> {
  const { jsPDF, GState } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const titulo = `Folha de ${nomeDoMes(folha.mes)}`;
  doc.setProperties({ title: titulo, author: "Coreto", creator: "Sistema Coreto" });
  const [nomeEscuro, flor] = await Promise.all([imagem("/coreto-nome-escuro.png"), imagem("/coreto-flor-branca.png")]);
  const L = 210, M = 14, W = L - 2 * M;
  const fill = (c: Cor) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: Cor) => doc.setTextColor(c[0], c[1], c[2]);
  const draw = (c: Cor) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (peso: "normal" | "bold", t: number) => { doc.setFont("helvetica", peso); doc.setFontSize(t); };
  const opacidade = (o: number) => doc.setGState(new GState({ opacity: o }));

  function cartao(x: number, y: number, w: number, h: number) {
    fill(C.sombra); opacidade(0.06); doc.roundedRect(x - 0.4, y + 1.2, w + 0.8, h + 0.6, 3.4, 3.4, "F"); opacidade(1);
    fill(C.branco); doc.roundedRect(x, y, w, h, 3.2, 3.2, "F");
    draw(C.linha); doc.setLineWidth(0.2); doc.roundedRect(x, y, w, h, 3.2, 3.2, "S");
  }
  function tituloBloco(x: number, y: number, t: string) {
    fill(C.azul); doc.roundedRect(x, y - 2.9, 3.2, 3.2, 0.7, 0.7, "F");
    draw(C.preto); doc.setLineWidth(0.35); doc.roundedRect(x, y - 2.9, 3.2, 3.2, 0.7, 0.7, "S");
    fonte("bold", 10.5); ink(C.preto); doc.text(t, x + 5.2, y);
  }
  function cabecalho(sub: string, selo: string, rotuloSelo: string) {
    fill(C.azul); doc.rect(0, 0, L, 32, "F");
    fill([0, 190, 193]); doc.circle(L - 20, -6, 44, "F");
    if (flor) { opacidade(0.22); doc.addImage(flor, "PNG", L - 60, -15, 58, 58, undefined, "FAST"); opacidade(1); }
    fill(C.preto); doc.rect(0, 32, L, 1.6, "F");
    if (nomeEscuro) doc.addImage(nomeEscuro, "PNG", M, 8, 34, 5.15, undefined, "FAST"); else { fonte("bold", 16); ink(C.preto); doc.text("CORETO", M, 13); }
    fonte("bold", 18); ink(C.preto); doc.text(titulo, M, 23.5);
    fonte("normal", 9); ink([10, 60, 61]); doc.text(sub, M, 28.6);
    const sw = 48, sx = L - M - sw;
    fill(C.preto); doc.roundedRect(sx, 8.6, sw, 17, 3.5, 3.5, "F");
    fonte("bold", 6.6); ink(C.azul); doc.text(rotuloSelo, sx + sw / 2, 14.4, { align: "center" });
    fonte("bold", selo.length > 12 ? 11 : 14); ink(C.branco); doc.text(selo, sx + sw / 2, 21.8, { align: "center" });
  }
  function rodape() {
    fill(C.azul); doc.rect(0, 293.5, L, 3.5, "F");
    fonte("normal", 7); ink(C.tenue);
    doc.text("Coreto Indústria e Comércio de Roupas · gerado pelo sistema Coreto", M, 290);
    doc.text(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }), L - M, 290, { align: "right" });
  }
  /** Linhas "rótulo ......... valor" num cartão. */
  function bloco(y: number, nome: string, linhasBloco: { rotulo: string; valor: number; detalhe?: string; forte?: boolean }[], totalRotulo: string, total: number) {
    const rh = 7.4, h = 12 + linhasBloco.length * rh + 12;
    cartao(M, y, W, h);
    tituloBloco(M + 5, y + 8.2, nome);
    linhasBloco.forEach((l, i) => {
      const yy = y + 12 + i * rh;
      if (i > 0) { draw(C.linha); doc.setLineWidth(0.15); doc.line(M + 6, yy, M + W - 6, yy); }
      fonte(l.forte ? "bold" : "normal", 9.2); ink(C.preto); doc.text(l.rotulo, M + 7, yy + 5);
      if (l.detalhe) { fonte("normal", 8); ink(C.suave); doc.text(l.detalhe, M + 95, yy + 5); }
      fonte("bold", 9.4); ink(l.valor < 0 ? C.erro : C.preto); doc.text(reais(l.valor), M + W - 7, yy + 5, { align: "right" });
    });
    const yt = y + h - 10;
    fill(C.preto); doc.roundedRect(M + 4, yt, W - 8, 7.4, 2, 2, "F");
    fonte("bold", 8.8); ink(C.branco); doc.text(totalRotulo, M + 8, yt + 5);
    ink(C.azul); doc.text(reais(total), M + W - 8, yt + 5, { align: "right" });
    return y + h + 6;
  }
  const rotuloItem = (i: { tipo: string; descricao: string | null }) => `${tipoItem(i.tipo).rotulo}${i.descricao ? ` · ${i.descricao}` : ""}`;
  const periodo = `${dataBR(folha.vt_inicio)} a ${dataBR(folha.vt_fim)}`;

  const pessoas = soUma ? linhas.filter((l) => l.pessoa.id === soUma) : linhas;
  let primeira = true;

  // ===== Resumo da equipe =====
  if (!soUma) {
    primeira = false;
    cabecalho(`Resumo da equipe · comissões de ${nomeDoMes(folha.mes)} · VT de ${periodo}`, nomeDoMes(folha.mes).replace(" ", "/"), "COMPETÊNCIA");
    let y = 44;
    const cols = { nome: M + 6, venda: M + 92, comissao: M + 122, vt: M + 152, total: M + W - 6 };
    const rh = 8.2, h = 20 + linhas.length * rh + 12;
    cartao(M, y, W, h);
    tituloBloco(M + 5, y + 8.2, "A pagar por pessoa");
    fill(C.fundo); doc.roundedRect(M + 3, y + 11, W - 6, 6.4, 1.6, 1.6, "F");
    fonte("bold", 6.8); ink(C.suave);
    doc.text("PESSOA", cols.nome, y + 15.2); doc.text("VENDEU", cols.venda, y + 15.2, { align: "right" });
    doc.text("COMISSÃO", cols.comissao, y + 15.2, { align: "right" }); doc.text("VT + AJUDA", cols.vt, y + 15.2, { align: "right" });
    doc.text("A RECEBER", cols.total, y + 15.2, { align: "right" });
    linhas.forEach((l, i) => {
      const yy = y + 18 + i * rh + rh * 0.66;
      if (i > 0) { draw(C.linha); doc.setLineWidth(0.15); doc.line(M + 6, y + 18 + i * rh, M + W - 6, y + 18 + i * rh); }
      fonte("normal", 9); ink(C.preto); doc.text(l.pessoa.nome, cols.nome, yy);
      ink(C.suave); doc.text(l.vendedora ? reais(l.realizado) : "—", cols.venda, yy, { align: "right" });
      fonte("bold", 9); ink(C.preto);
      doc.text(l.vendedora || l.itensComissao.length ? reais(l.somaComissao) : "—", cols.comissao, yy, { align: "right" });
      doc.text(l.regra.recebe_vt || l.itensVt.length ? reais(l.somaVt) : "—", cols.vt, yy, { align: "right" });
      doc.text(reais(l.total), cols.total, yy, { align: "right" });
    });
    const soma = (f: (l: LinhaFolha) => number) => linhas.reduce((t, l) => t + f(l), 0);
    const yt = y + h - 10;
    fill(C.preto); doc.roundedRect(M + 4, yt, W - 8, 7.4, 2, 2, "F");
    fonte("bold", 8.8); ink(C.branco); doc.text("Total da folha", M + 8, yt + 5);
    fonte("normal", 8.4); ink([200, 210, 210]);
    doc.text(reais(soma((l) => l.somaComissao)), cols.comissao, yt + 5, { align: "right" });
    doc.text(reais(soma((l) => l.somaVt)), cols.vt, yt + 5, { align: "right" });
    fonte("bold", 8.8); ink(C.azul); doc.text(reais(soma((l) => l.total)), cols.total, yt + 5, { align: "right" });
    rodape();
  }

  // ===== Um recibo por pessoa =====
  for (const l of pessoas) {
    if (!primeira) doc.addPage();
    primeira = false;
    cabecalho(`Recibo de ${l.pessoa.nome}`, reais(l.total), "TOTAL A RECEBER");
    let y = 44;
    if (l.vendedora || l.itensComissao.length) {
      y = bloco(y, `Comissão de ${nomeDoMes(folha.mes).split(" ")[0]}`, [
        ...(l.vendedora ? [{ rotulo: "Vendas no mês", valor: l.realizado, detalhe: l.realizadoDoFluxo ? "da Equipe do fluxo" : "valor ajustado" },
          { rotulo: `Comissão (${percentualBR(l.percentual)})`, valor: l.comissao, forte: true }] : []),
        ...l.itensComissao.map((i) => ({ rotulo: rotuloItem(i), valor: Number(i.valor) })),
      ], "A receber da comissão", l.somaComissao);
    }
    if (l.regra.recebe_vt || l.ajudaCusto || l.bonusFixo || l.itensVt.length) {
      y = bloco(y, `Vale-transporte e ajuda de custo · ${periodo}`, [
        ...(l.regra.recebe_vt ? [{ rotulo: "Vale-transporte", valor: l.vt, detalhe: `${l.dias} dias × ${reais(Number(l.regra.vt_tarifa))}` }] : []),
        ...(l.descontoVt ? [{ rotulo: "Desconto do VT (6% do salário)", valor: -l.descontoVt }] : []),
        ...(l.ajudaCusto ? [{ rotulo: "Ajuda de custo", valor: l.ajudaCusto }] : []),
        ...(l.bonusFixo ? [{ rotulo: "Bônus fixo", valor: l.bonusFixo }] : []),
        ...l.itensVt.map((i) => ({ rotulo: rotuloItem(i), valor: Number(i.valor) })),
      ], "A receber do VT e ajuda de custo", l.somaVt);
    }
    // total + assinatura
    cartao(M, y, W, 16);
    fonte("bold", 11); ink(C.preto); doc.text("Total a receber", M + 7, y + 10);
    fonte("bold", 15); doc.text(reais(l.total), M + W - 7, y + 10.6, { align: "right" });
    y += 34;
    draw(C.preto); doc.setLineWidth(0.3); doc.line(M + 10, y, M + 95, y); doc.line(M + 115, y, M + W - 10, y);
    fonte("normal", 8.4); ink(C.suave);
    doc.text(l.pessoa.nome, M + 52.5, y + 5, { align: "center" });
    doc.text("Data", M + W / 2 + 47.5, y + 5, { align: "center" });
    rodape();
  }
  return doc.output("blob");
}

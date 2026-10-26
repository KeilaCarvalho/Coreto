"use client";

import { dataPorExtenso, mesPorExtenso, nomeDoDia, rotuloPeriodo, totaisFluxo, vendasPorDia, type DadosFluxo, type LinhaValor } from "@/lib/fluxo";

/*
 * PDF do fluxo financeiro diário: uma página A4 retrato, gerado no navegador.
 * Azul da logo como base, detalhes em preto, cartões com sombra.
 * Se tiver muita linha, as linhas encolhem um pouco para tudo caber na página.
 */

type Cor = [number, number, number];
const C = {
  azul: [0, 206, 209] as Cor,
  azulClaro: [226, 247, 247] as Cor,
  azulMedio: [143, 227, 228] as Cor,
  azulEscuro: [0, 112, 111] as Cor,
  preto: [22, 25, 23] as Cor,
  suave: [92, 102, 102] as Cor,
  tenue: [150, 160, 160] as Cor,
  linha: [214, 228, 228] as Cor,
  fundo: [242, 249, 249] as Cor,
  sombra: [0, 70, 72] as Cor,
  alerta: [154, 91, 7] as Cor,
  alertaFundo: [253, 241, 222] as Cor,
  branco: [255, 255, 255] as Cor,
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (v: number) => moeda.format(v).replace(/\s/g, " ");
const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : "—");
const curtoDia = (iso: string) => `${nomeDoDia(iso).slice(0, 3)} ${iso.slice(8, 10)}`;

async function imagem(caminho: string): Promise<string | null> {
  try {
    const resposta = await fetch(caminho);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = () => ok(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** "2026-10-20" → "Fluxo de caixa dia 20.10.26" */
export function tituloDoPdf(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `Fluxo de caixa dia ${dia}.${mes}.${ano.slice(2)}`;
}

export function nomeDoPdf(data: string) {
  return `${tituloDoPdf(data)}.pdf`;
}

export async function gerarPdfFluxo(d: DadosFluxo): Promise<Blob> {
  const { jsPDF, GState } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: tituloDoPdf(d.data), subject: tituloDoPdf(d.data), author: "Coreto", creator: "Sistema Coreto" });
  const [nomeEscuro, flor] = await Promise.all([imagem("/coreto-nome-escuro.png"), imagem("/coreto-flor-branca.png")]);
  const t = totaisFluxo(d);
  const L = 210, M = 12, W = L - M * 2, FIM = 284;

  const fill = (c: Cor) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: Cor) => doc.setTextColor(c[0], c[1], c[2]);
  const draw = (c: Cor) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (peso: "normal" | "bold", tamanho: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tamanho); };
  const opacidade = (o: number) => doc.setGState(new GState({ opacity: o }));
  const corta = (texto: string, largura: number) => (doc.splitTextToSize(texto, largura) as string[])[0] ?? "";

  /** Cartão com sombra suave embaixo. */
  function cartao(x: number, y: number, w: number, h: number, fundo: Cor = C.branco, raio = 3.2) {
    fill(C.sombra);
    opacidade(0.05); doc.roundedRect(x - 0.6, y + 1.6, w + 1.2, h + 0.8, raio + 0.6, raio + 0.6, "F");
    opacidade(0.08); doc.roundedRect(x - 0.2, y + 0.9, w + 0.4, h + 0.2, raio, raio, "F");
    opacidade(1);
    fill(fundo);
    doc.roundedRect(x, y, w, h, raio, raio, "F");
    if (fundo === C.branco) { draw(C.linha); doc.setLineWidth(0.2); doc.roundedRect(x, y, w, h, raio, raio, "S"); }
  }

  /** Título de bloco: quadradinho azul com contorno preto + nome. */
  function titulo(x: number, y: number, texto: string) {
    fill(C.azul); doc.roundedRect(x, y - 2.9, 3.2, 3.2, 0.7, 0.7, "F");
    draw(C.preto); doc.setLineWidth(0.35); doc.roundedRect(x, y - 2.9, 3.2, 3.2, 0.7, 0.7, "S");
    fonte("bold", 10); ink(C.preto);
    doc.text(texto, x + 5.2, y);
  }

  /** Faixa preta de total no pé do bloco. */
  function total(x: number, y: number, w: number, rotulo: string, valor: number) {
    fill(C.preto); doc.roundedRect(x, y, w, 7, 2, 2, "F");
    fonte("bold", 8.2); ink(C.branco); doc.text(rotulo, x + 3.5, y + 4.7);
    ink(C.azul); doc.text(reais(valor), x + w - 3.5, y + 4.7, { align: "right" });
  }

  // ===================== Cabeçalho =====================
  const HC = 34;
  fill(C.azul); doc.rect(0, 0, L, HC, "F");
  fill([0, 190, 193]); doc.circle(L - 20, -6, 46, "F");
  if (flor) { opacidade(0.22); doc.addImage(flor, "PNG", L - 62, -16, 60, 60, undefined, "FAST"); opacidade(1); }
  fill(C.preto); doc.rect(0, HC, L, 1.6, "F");
  if (nomeEscuro) doc.addImage(nomeEscuro, "PNG", M, 8.5, 34, 5.15, undefined, "FAST");
  else { fonte("bold", 16); ink(C.preto); doc.text("CORETO", M, 13); }
  fonte("bold", 19); ink(C.preto);
  doc.text("Fluxo financeiro diário", M, 24.5);
  fonte("normal", 9); ink([10, 60, 61]);
  doc.text(`${dataPorExtenso(d.data)} · ${rotuloPeriodo(d.diasVenda).toLowerCase()}`, M, 29.8);
  // selo preto com a data
  const sw = 44, sx = L - M - sw;
  fill(C.sombra); opacidade(0.18); doc.roundedRect(sx, 10.4, sw, 17, 3.5, 3.5, "F"); opacidade(1);
  fill(C.preto); doc.roundedRect(sx, 9.2, sw, 17, 3.5, 3.5, "F");
  fonte("bold", 6.6); ink(C.azul); doc.text("DATA DE REFERÊNCIA", sx + sw / 2, 15, { align: "center" });
  fonte("bold", 14); ink(C.branco); doc.text(d.data.split("-").reverse().join("/"), sx + sw / 2, 22.4, { align: "center" });

  // ===================== Números principais =====================
  let y = HC + 8;
  const kw = (W - 3 * 4) / 4, kh = 23;
  const sobra = t.sobra;
  const kpis: { rotulo: string; valor: number; nota: string; escuro?: boolean; alerta?: boolean }[] = [
    { rotulo: "VENDAS NO MÊS", valor: t.vendasMes, nota: `acumulado de ${mesPorExtenso(d.data).split(" ")[0]}`, escuro: true },
    { rotulo: rotuloPeriodo(d.diasVenda).toUpperCase(), valor: t.vendasDia, nota: d.diasVenda.length > 1 ? vendasPorDia(d).map((v) => `${nomeDoDia(v.dia).slice(0, 3)} ${reais(v.valor)}`).join(" · ") : d.diasVenda[0] ? `${nomeDoDia(d.diasVenda[0])}, ${d.diasVenda[0].slice(8, 10)}/${d.diasVenda[0].slice(5, 7)}` : "" },
    { rotulo: "SALDO EM CONTA", valor: t.saldo, nota: `${d.saldos.length} ${d.saldos.length === 1 ? "conta" : "contas"}` },
    { rotulo: "SALDO APÓS AS CONTAS", valor: sobra, nota: "saldo em conta - contas a pagar", alerta: sobra < 0 },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kw + 4);
    cartao(x, y, kw, kh, k.escuro ? C.preto : k.alerta ? C.alertaFundo : C.branco);
    fill(C.azul); doc.roundedRect(x + 4, y + 3.6, 6, 1.4, 0.7, 0.7, "F");
    fonte("bold", 6.4); ink(k.escuro ? C.azul : k.alerta ? C.alerta : C.suave);
    doc.text(corta(k.rotulo, kw - 8), x + 4, y + 9);
    fonte("bold", 13.5); ink(k.escuro ? C.branco : k.alerta ? C.alerta : C.preto);
    doc.text(reais(k.valor), x + 4, y + 16);
    // A nota diminui a letra para caber inteira (ex.: "sex R$ 5.679,50 · sáb R$ 9.640,00").
    let tam = 6.6;
    fonte("normal", tam);
    while (tam > 4.6 && doc.getTextWidth(k.nota) > kw - 8) { tam -= 0.2; fonte("normal", tam); }
    ink(k.escuro ? [190, 200, 200] : C.suave);
    doc.text(corta(k.nota, kw - 8), x + 4, y + 20.4);
  });
  y += kh + 5;

  // ===================== Contas do mês (faixa) =====================
  const fh = 14;
  cartao(M, y, W, fh);
  const pagas = t.contasPagas, aPagar = t.contasAPagar, somaContas = pagas + aPagar;
  titulo(M + 4, y + 8.4, "Contas do mês");
  fonte("normal", 7); ink(C.suave); doc.text("PAGAS", M + 46, y + 5.4); doc.text("A PAGAR", M + 82, y + 5.4);
  fonte("bold", 10.5); ink(C.preto); doc.text(reais(pagas), M + 46, y + 10.6);
  ink(aPagar > t.saldo ? C.alerta : C.preto); doc.text(reais(aPagar), M + 82, y + 10.6);
  const bx = M + 122, bw = W - 122 - 22;
  fill(C.azulClaro); doc.roundedRect(bx, y + 5.6, bw, 3.2, 1.6, 1.6, "F");
  if (somaContas > 0 && pagas > 0) { fill(C.preto); doc.roundedRect(bx, y + 5.6, Math.max(3.2, bw * (pagas / somaContas)), 3.2, 1.6, 1.6, "F"); }
  fonte("bold", 11); ink(C.preto); doc.text(pct(pagas, somaContas), M + W - 4, y + 8.6, { align: "right" });
  fonte("normal", 6.2); ink(C.suave); doc.text("pago", M + W - 4, y + 11.6, { align: "right" });
  y += fh + 6;

  // ===================== Tamanho das linhas (cabe numa página) =====================
  const nomesFormas = [...new Set([...d.vendasDia.map((v) => v.nome), ...d.vendasMes.map((v) => v.nome)])];
  const formas = nomesFormas.map((nome) => ({
    nome,
    dias: d.diasVenda.map((_, k) => d.vendasDia.find((v) => v.nome === nome)?.dias[k] ?? 0),
    periodo: d.vendasDia.find((v) => v.nome === nome)?.valor ?? 0,
    mes: d.vendasMes.find((v) => v.nome === nome)?.valor ?? 0,
  })).sort((a, b) => b.mes - a.mes || b.periodo - a.periodo);
  const equipe = [...d.vendedoras].sort((a, b) => b.valor - a.valor);
  const meia = (W - 5) / 2;

  // altura de cada bloco para uma altura de linha rh
  const hTabela = (n: number, rh: number) => 11 + 6 + Math.max(1, n) * rh + 3 + 7 + 4;
  const hLista = (n: number, rh: number) => 11 + Math.max(1, n) * rh + 3 + 7 + 4;
  const escala = (rh: number) => Math.max(0.78, Math.min(1, rh / 6.6));
  const alturas = (rh: number) => {
    const a = hTabela(formas.length, rh);
    const b = Math.max(hLista(d.saldos.length, rh), hLista(d.aReceber.length, rh));
    const c = hLista(equipe.length, rh * 1.15);
    return { a, b, c, soma: a + 5 + b + 5 + c };
  };
  let rh = 8.4;
  while (rh > 3.8 && y + alturas(rh).soma > FIM) rh -= 0.1;
  const esc = escala(rh);
  const tam = { linha: 8.6 * esc, valor: 8.8 * esc };
  const H = alturas(rh);

  // ===================== Vendas por forma de pagamento =====================
  cartao(M, y, W, H.a);
  titulo(M + 4, y + 7.6, "Vendas por forma de pagamento");
  fonte("normal", 7.2); ink(C.suave);
  doc.text(`${rotuloPeriodo(d.diasVenda)} e acumulado do mês`, M + W - 4, y + 7.6, { align: "right" });
  // colunas: forma | dias... | período (se +1 dia) | no mês | barra % do mês
  const colMes = M + W - 52, colBarra = M + W - 46, larguraBarra = 30;
  const colsDias = d.diasVenda.length > 1
    ? [...d.diasVenda.map((_, k) => colMes - 26 * (d.diasVenda.length + 1 - k)), colMes - 26]
    : [colMes - 30];
  let ty = y + 11;
  fill(C.fundo); doc.roundedRect(M + 3, ty, W - 6, 6, 1.6, 1.6, "F");
  fonte("bold", 6.4); ink(C.suave);
  doc.text("FORMA", M + 6, ty + 4);
  if (d.diasVenda.length > 1) {
    d.diasVenda.forEach((dia, k) => doc.text(curtoDia(dia).toUpperCase(), colsDias[k], ty + 4, { align: "right" }));
    doc.text("PERÍODO", colsDias[colsDias.length - 1], ty + 4, { align: "right" });
  } else doc.text((d.diasVenda[0] ? curtoDia(d.diasVenda[0]) : "DIA").toUpperCase(), colsDias[0], ty + 4, { align: "right" });
  doc.text("NO MÊS", colMes, ty + 4, { align: "right" });
  doc.text("% DO MÊS", colBarra, ty + 4);
  ty += 6;
  if (!formas.length) { fonte("normal", tam.linha); ink(C.tenue); doc.text("Nada informado.", M + 6, ty + rh * 0.68); }
  formas.forEach((f, i) => {
    const base = ty + i * rh + rh * 0.68;
    if (i > 0) { draw(C.linha); doc.setLineWidth(0.15); doc.line(M + 6, ty + i * rh, M + W - 6, ty + i * rh); }
    fonte("normal", tam.linha); ink(C.preto); doc.text(corta(f.nome, colsDias[0] - (d.diasVenda.length > 1 ? 24 : 28) - (M + 6)), M + 6, base);
    fonte("normal", tam.linha); ink(C.suave);
    if (d.diasVenda.length > 1) f.dias.forEach((v, k) => doc.text(reais(v), colsDias[k], base, { align: "right" }));
    fonte("bold", tam.valor); ink(C.preto);
    doc.text(reais(f.periodo), colsDias[colsDias.length - 1], base, { align: "right" });
    doc.text(reais(f.mes), colMes, base, { align: "right" });
    const bh = Math.min(2.6, rh * 0.38), by = ty + i * rh + (rh - bh) / 2;
    fill(C.azulClaro); doc.roundedRect(colBarra, by, larguraBarra, bh, bh / 2, bh / 2, "F");
    if (t.vendasMes > 0 && f.mes > 0) { fill(i === 0 ? C.preto : C.azul); doc.roundedRect(colBarra, by, Math.max(bh, larguraBarra * (f.mes / t.vendasMes)), bh, bh / 2, bh / 2, "F"); }
    fonte("bold", 7 * esc); ink(C.preto); doc.text(pct(f.mes, t.vendasMes), M + W - 6, base, { align: "right" });
  });
  {
    const yt = y + H.a - 11;
    fill(C.preto); doc.roundedRect(M + 3, yt, W - 6, 7, 2, 2, "F");
    fonte("bold", 8.2); ink(C.branco); doc.text("Total", M + 6, yt + 4.7);
    if (d.diasVenda.length > 1) { fonte("normal", 7.6); ink([200, 210, 210]); vendasPorDia(d).forEach((v, k) => doc.text(reais(v.valor), colsDias[k], yt + 4.7, { align: "right" })); }
    fonte("bold", 8.2); ink(C.azul);
    doc.text(reais(t.vendasDia), colsDias[colsDias.length - 1], yt + 4.7, { align: "right" });
    doc.text(reais(t.vendasMes), colMes, yt + 4.7, { align: "right" });
  }
  y += H.a + 5;

  // ===================== Listas =====================
  function lista(x: number, yy: number, w: number, h: number, nome: string, linhas: LinhaValor[], rotuloTotal: string, alturaLinha: number, barras = false) {
    cartao(x, yy, w, h);
    titulo(x + 4, yy + 7.6, nome);
    const y0 = yy + 11;
    if (!linhas.length) { fonte("normal", tam.linha); ink(C.tenue); doc.text("Nada informado.", x + 6, y0 + alturaLinha * 0.68); }
    const maior = Math.max(1, ...linhas.map((l) => l.valor));
    const soma = linhas.reduce((s, l) => s + l.valor, 0);
    linhas.forEach((l, i) => {
      const topo = y0 + i * alturaLinha;
      if (i > 0) { draw(C.linha); doc.setLineWidth(0.15); doc.line(x + 6, topo, x + w - 6, topo); }
      const base = barras ? topo + alturaLinha * 0.5 : topo + alturaLinha * 0.68;
      if (barras) {
        fill(i === 0 ? C.preto : C.azulClaro); doc.circle(x + 7.6, topo + alturaLinha / 2, Math.min(2.5, alturaLinha * 0.32), "F");
        fonte("bold", 6.4 * esc); ink(i === 0 ? C.azul : C.preto); doc.text(`${i + 1}`, x + 7.6, topo + alturaLinha / 2 + 0.9, { align: "center" });
      }
      const xNome = barras ? x + 11.5 : x + 6;
      fonte("normal", tam.linha); ink(C.preto); doc.text(corta(l.nome, w * 0.55), xNome, base);
      fonte("bold", tam.valor); doc.text(reais(l.valor), x + w - 6, base, { align: "right" });
      if (barras) {
        const larg = w - 6 - xNome - 14, bh = Math.min(1.8, alturaLinha * 0.22), by = topo + alturaLinha * 0.7;
        fill(C.azulClaro); doc.roundedRect(xNome, by, larg, bh, bh / 2, bh / 2, "F");
        fill(i === 0 ? C.preto : C.azul); doc.roundedRect(xNome, by, Math.max(bh, larg * (l.valor / maior)), bh, bh / 2, bh / 2, "F");
        fonte("normal", 6.4 * esc); ink(C.suave); doc.text(pct(l.valor, soma), x + w - 6, by + bh, { align: "right" });
      }
    });
    total(x + 3, yy + h - 11, w - 6, rotuloTotal, soma);
  }

  lista(M, y, meia, H.b, "Saldo nos bancos", d.saldos, "Saldo total", rh);
  lista(M + meia + 5, y, meia, H.b, "A receber", d.aReceber, "Total a receber", rh);
  y += H.b + 5;

  lista(M, y, W, H.c, "Equipe no mês", equipe, "Total da equipe", rh * 1.15, true);

  // ===================== Rodapé =====================
  fill(C.azul); doc.rect(0, 293.5, L, 3.5, "F");
  fonte("normal", 7); ink(C.tenue);
  doc.text("Coreto Indústria e Comércio de Roupas · gerado pelo sistema Coreto", M, 290);
  doc.text(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }), L - M, 290, { align: "right" });

  return doc.output("blob");
}

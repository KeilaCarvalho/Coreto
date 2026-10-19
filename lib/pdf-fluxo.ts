"use client";

import { dataPorExtenso, mesPorExtenso, nomeDoDia, rotuloPeriodo, totaisFluxo, vendasPorDia, type DadosFluxo, type LinhaValor } from "@/lib/fluxo";

/*
 * PDF do fluxo financeiro diário (A4 retrato), gerado no navegador.
 * Mesmo conteúdo do relatório do sistema antigo, com o visual novo da Coreto.
 */

type Cor = [number, number, number];
const C = {
  verde950: [31, 33, 29] as Cor,
  verde900: [47, 50, 45] as Cor,
  verde700: [0, 121, 124] as Cor,
  marca: [0, 206, 209] as Cor,
  flor: [20, 184, 169] as Cor,
  verde100: [215, 244, 244] as Cor,
  verde50: [238, 249, 249] as Cor,
  tinta: [47, 50, 45] as Cor,
  suave: [106, 112, 107] as Cor,
  tenue: [157, 161, 155] as Cor,
  linha: [223, 230, 228] as Cor,
  fundo: [246, 250, 249] as Cor,
  alerta: [154, 91, 7] as Cor,
  alertaFundo: [253, 241, 222] as Cor,
  branco: [255, 255, 255] as Cor,
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (v: number) => moeda.format(v).replace(/ /g, " ");
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

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

export function nomeDoPdf(data: string) {
  return `Fluxo financeiro Coreto ${data.split("-").reverse().join("-")}.pdf`;
}

export async function gerarPdfFluxo(d: DadosFluxo): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const [nomeBranco, flor] = await Promise.all([imagem("/coreto-nome-branco.png"), imagem("/coreto-flor-marca-dagua.png")]);
  const t = totaisFluxo(d);
  const L = 210, M = 14, W = L - M * 2;

  const fill = (c: Cor) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: Cor) => doc.setTextColor(c[0], c[1], c[2]);
  const draw = (c: Cor) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (peso: "normal" | "bold", tamanho: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tamanho); };

  // ---------- Cabeçalho ----------
  fill(C.verde900);
  doc.rect(0, 0, L, 44, "F");
  fill(C.verde950);
  doc.rect(0, 44, L, 1.2, "F");
  if (flor) doc.addImage(flor, "PNG", L - 58, -12, 66, 66, undefined, "FAST");
  if (nomeBranco) doc.addImage(nomeBranco, "PNG", M, 11, 40, 6.06, undefined, "FAST");
  else { fonte("bold", 18); ink(C.branco); doc.text("Coreto", M, 17); }
  fonte("bold", 20); ink(C.branco);
  doc.text("Fluxo financeiro diário", M, 31);
  fonte("normal", 9.5); ink([191, 195, 188]);
  doc.text(dataPorExtenso(d.data), M, 38);
  fonte("bold", 7.5); ink(C.marca);
  doc.text("DATA DE REFERÊNCIA", L - M, 14, { align: "right" });
  fonte("bold", 13); ink(C.branco);
  doc.text(d.data.split("-").reverse().join("/"), L - M, 21, { align: "right" });

  // ---------- Cartões de resumo ----------
  let y = 54;
  fonte("bold", 11.5); ink(C.tinta);
  doc.text("Resumo", M, y);
  fonte("normal", 8.5); ink(C.suave);
  doc.text(`Mês de ${mesPorExtenso(d.data)}`, L - M, y, { align: "right" });
  y += 5;

  const cartoes: { titulo: string; valor: string; nota: string; destaque?: boolean; alerta?: boolean }[] = [
    { titulo: "VENDAS DO MÊS", valor: reais(t.vendasMes), nota: "acumulado até hoje", destaque: true },
    { titulo: rotuloPeriodo(d.diasVenda).toUpperCase(), valor: reais(t.vendasDia), nota: d.diasVenda.length > 1 ? vendasPorDia(d).map((v) => `${nomeDoDia(v.dia).slice(0, 3)} ${reais(v.valor)}`).join(" · ") : "fechamento do caixa" },
    { titulo: "SALDO EM CONTA", valor: reais(t.saldo), nota: `${d.saldos.length} ${d.saldos.length === 1 ? "conta" : "contas"}` },
    { titulo: "CONTAS PAGAS NO MÊS", valor: reais(t.contasPagas), nota: "já saíram do caixa" },
    { titulo: "CONTAS A PAGAR", valor: reais(t.contasAPagar), nota: "ainda no mês", alerta: t.contasAPagar > t.saldo + t.aReceber },
    { titulo: "CONTAS A RECEBER", valor: reais(t.aReceber), nota: `${d.aReceber.length} ${d.aReceber.length === 1 ? "referência" : "referências"}` },
  ];
  const cw = (W - 8) / 3, ch = 25;
  cartoes.forEach((c, i) => {
    const x = M + (i % 3) * (cw + 4), cy = y + Math.floor(i / 3) * (ch + 4);
    fill(c.destaque ? C.verde900 : c.alerta ? C.alertaFundo : C.fundo);
    doc.roundedRect(x, cy, cw, ch, 3.5, 3.5, "F");
    if (!c.destaque) { draw(C.linha); doc.setLineWidth(0.25); doc.roundedRect(x, cy, cw, ch, 3.5, 3.5, "S"); }
    fonte("bold", 6.8); ink(c.destaque ? C.marca : c.alerta ? C.alerta : C.suave);
    doc.text(c.titulo, x + 5, cy + 7);
    fonte("bold", 14.5); ink(c.destaque ? C.branco : c.alerta ? C.alerta : C.tinta);
    doc.text(c.valor, x + 5, cy + 15.5);
    fonte("normal", 7.5); ink(c.destaque ? [198, 202, 195] : C.suave);
    doc.text(c.nota, x + 5, cy + 21);
  });
  y += ch * 2 + 4 + 10;

  // Situação do caixa: saldo + a receber − a pagar
  const folga = t.saldo + t.aReceber - t.contasAPagar;
  fill(folga >= 0 ? C.verde50 : C.alertaFundo);
  doc.roundedRect(M, y - 5, W, 11, 3, 3, "F");
  fonte("normal", 8.5); ink(C.suave);
  doc.text("Saldo em conta + a receber − contas a pagar", M + 5, y + 1.8);
  fonte("bold", 11); ink(folga >= 0 ? C.verde700 : C.alerta);
  doc.text(reais(folga), L - M - 5, y + 2, { align: "right" });
  y += 14;

  // ---------- Blocos de detalhe ----------
  function bloco(x: number, yy: number, w: number, titulo: string, subtitulo: string, linhas: LinhaValor[], rotuloTotal: string, comBarras: boolean) {
    const total = linhas.reduce((s, l) => s + l.valor, 0);
    const alturaLinha = comBarras ? 9 : 7;
    const altura = 18 + Math.max(1, linhas.length) * alturaLinha + 12;
    draw(C.linha); doc.setLineWidth(0.25);
    fill(C.branco);
    doc.roundedRect(x, yy, w, altura, 3.5, 3.5, "FD");
    fonte("bold", 7); ink(C.verde700);
    doc.text(titulo.toUpperCase(), x + 5, yy + 7);
    fonte("bold", 10); ink(C.tinta);
    doc.text(subtitulo, x + 5, yy + 12.5);
    let ly = yy + 20;
    if (!linhas.length) {
      fonte("normal", 8.5); ink(C.tenue);
      doc.text("Nada informado.", x + 5, ly + 2);
      ly += alturaLinha;
    }
    const maior = Math.max(...linhas.map((l) => l.valor), 1);
    for (const l of linhas) {
      fonte("normal", 8.5); ink(C.tinta);
      const nome = doc.splitTextToSize(l.nome, w * 0.55)[0] as string;
      doc.text(nome, x + 5, ly + 1.5);
      fonte("bold", 8.5);
      doc.text(reais(l.valor), x + w - 5, ly + 1.5, { align: "right" });
      if (comBarras) {
        fill(C.fundo); doc.roundedRect(x + 5, ly + 3.4, w - 10, 1.8, 0.9, 0.9, "F");
        fill(C.flor); doc.roundedRect(x + 5, ly + 3.4, Math.max(1.8, (w - 10) * (l.valor / maior)), 1.8, 0.9, 0.9, "F");
        if (total > 0) { fonte("normal", 6.8); ink(C.suave); doc.text(pct((l.valor / total) * 100), x + w - 5, ly + 7.6, { align: "right" }); }
      } else {
        draw(C.linha); doc.line(x + 5, ly + 3.6, x + w - 5, ly + 3.6);
      }
      ly += alturaLinha;
    }
    fill(C.verde100);
    doc.roundedRect(x + 4, yy + altura - 11, w - 8, 7.5, 2, 2, "F");
    fonte("bold", 8); ink(C.verde900);
    doc.text(rotuloTotal, x + 7, yy + altura - 6);
    doc.text(reais(total), x + w - 7, yy + altura - 6, { align: "right" });
    return altura;
  }

  const meia = (W - 5) / 2;
  const garantir = (altura: number) => {
    if (y + altura > 282) { doc.addPage(); y = 18; }
  };
  const alturaPar = (a: LinhaValor[], b: LinhaValor[], barras: boolean) => 30 + Math.max(1, a.length, b.length) * (barras ? 9 : 7);

  garantir(alturaPar(d.vendasDia, d.vendasMes, true));
  const a1 = bloco(M, y, meia, rotuloPeriodo(d.diasVenda), "Vendas por forma de pagamento", d.vendasDia, "Total", true);
  const a2 = bloco(M + meia + 5, y, meia, "Acumulado do mês", "Vendas por forma de pagamento", d.vendasMes, "Total do mês", true);
  y += Math.max(a1, a2) + 6;

  garantir(alturaPar(d.saldos, d.aReceber, false));
  const b1 = bloco(M, y, meia, "Saldos por conta", "Disponibilidade bancária", d.saldos, "Saldo total", false);
  const b2 = bloco(M + meia + 5, y, meia, "Valores a receber", "Referências dos recebimentos", d.aReceber, "Total a receber", false);
  y += Math.max(b1, b2) + 6;

  garantir(30 + Math.max(1, d.vendedoras.length) * 9);
  y += bloco(M, y, W, "Equipe comercial", "Vendas por vendedora no mês", [...d.vendedoras].sort((a, b) => b.valor - a.valor), "Total informado", true) + 6;

  if (d.observacao.trim()) {
    const texto = doc.splitTextToSize(d.observacao.trim(), W - 10) as string[];
    garantir(16 + texto.length * 4.5);
    fill(C.fundo);
    doc.roundedRect(M, y, W, 12 + texto.length * 4.5, 3.5, 3.5, "F");
    fonte("bold", 7); ink(C.verde700);
    doc.text("OBSERVAÇÕES", M + 5, y + 7);
    fonte("normal", 9); ink(C.tinta);
    doc.text(texto, M + 5, y + 12.5);
  }

  // ---------- Rodapé ----------
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    draw(C.linha); doc.setLineWidth(0.25);
    doc.line(M, 287, L - M, 287);
    fonte("normal", 7.5); ink(C.tenue);
    doc.text("Coreto Indústria e Comércio de Roupas · relatório gerado pelo sistema Coreto", M, 291.5);
    doc.text(`Página ${p} de ${paginas}`, L - M, 291.5, { align: "right" });
  }

  return doc.output("blob");
}

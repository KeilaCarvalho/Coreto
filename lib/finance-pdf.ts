import type { jsPDF } from "jspdf";

export type FinancePdfLine = { name: string; value: number };

export type FinancePdfData = {
  date: string;
  previousDateLabel: string;
  monthTotal: number;
  previousDayTotal: number;
  balanceTotal: number;
  accountsPaid: number;
  accountsPayable: number;
  receivableTotal: number;
  bankBalances: FinancePdfLine[];
  receivableEntries: FinancePdfLine[];
  monthPayments: FinancePdfLine[];
  dayPayments: FinancePdfLine[];
  sellerSales: FinancePdfLine[];
};

type RGB = [number, number, number];
type SummaryIcon = "wallet" | "calendar" | "bank" | "check" | "receipt" | "coin";

const C = {
  navy: [17, 24, 39] as RGB,
  teal: [37, 99, 235] as RGB,
  turquoise: [147, 197, 253] as RGB,
  mint: [239, 246, 255] as RGB,
  paleMint: [245, 252, 250] as RGB,
  grayBg: [243, 246, 248] as RGB,
  grayText: [97, 118, 137] as RGB,
  line: [207, 229, 223] as RGB,
  white: [255, 255, 255] as RGB,
  orange: [244, 163, 64] as RGB,
  orangeBg: [255, 244, 229] as RGB,
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => brl.format(Number.isFinite(value) ? value : 0).replace(/\u00a0/g, " ");
const percent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;

function fill(doc: jsPDF, color: RGB) { doc.setFillColor(...color); }
function stroke(doc: jsPDF, color: RGB) { doc.setDrawColor(...color); }
function ink(doc: jsPDF, color: RGB) { doc.setTextColor(...color); }

function cleanLines(lines: FinancePdfLine[]) {
  return lines.filter((line) => line.name.trim() || line.value).map((line) => ({ name: line.name.trim() || "Sem identificação", value: Number(line.value) || 0 }));
}

function clipText(doc: jsPDF, value: string, maxWidth: number) {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && doc.getTextWidth(`${text}...`) > maxWidth) text = text.slice(0, -1);
  return `${text.trim()}...`;
}

function sectionTitle(doc: jsPDF, title: string, subtitle: string, y: number) {
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 13, y);
  ink(doc, C.grayText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(subtitle, 13, y + 4.2);
  fill(doc, C.teal);
  doc.roundedRect(181, y - 2.5, 16, 1.3, 0.65, 0.65, "F");
}

function drawSummaryIcon(doc: jsPDF, icon: SummaryIcon, cx: number, cy: number, color: RGB) {
  stroke(doc, color);
  ink(doc, color);
  doc.setLineWidth(0.55);
  if (icon === "wallet") {
    doc.roundedRect(cx - 4.2, cy - 3.2, 8.4, 6.4, 1, 1, "S");
    doc.line(cx - 3.2, cy - 1.2, cx + 4.2, cy - 1.2);
    doc.roundedRect(cx + 1.2, cy - 0.4, 3, 2.1, 0.5, 0.5, "S");
    doc.circle(cx + 2.2, cy + 0.65, 0.35, "F");
  } else if (icon === "calendar") {
    doc.roundedRect(cx - 4.1, cy - 3.4, 8.2, 7, 1, 1, "S");
    doc.line(cx - 4.1, cy - 1.2, cx + 4.1, cy - 1.2);
    doc.line(cx - 2.2, cy - 4.1, cx - 2.2, cy - 2.5);
    doc.line(cx + 2.2, cy - 4.1, cx + 2.2, cy - 2.5);
    [[-2, .5], [0, .5], [2, .5], [-2, 2.2], [0, 2.2], [2, 2.2]].forEach(([dx, dy]) => doc.circle(cx + dx, cy + dy, 0.35, "F"));
  } else if (icon === "bank") {
    doc.line(cx - 4.5, cy - 2.5, cx, cy - 4.5);
    doc.line(cx, cy - 4.5, cx + 4.5, cy - 2.5);
    doc.line(cx - 4.3, cy - 2, cx + 4.3, cy - 2);
    [-2.7, 0, 2.7].forEach((dx) => { doc.line(cx + dx, cy - 1.4, cx + dx, cy + 2.4); });
    doc.line(cx - 4.3, cy + 2.9, cx + 4.3, cy + 2.9);
    doc.line(cx - 4.8, cy + 3.8, cx + 4.8, cy + 3.8);
  } else if (icon === "check") {
    doc.circle(cx, cy, 4.1, "S");
    doc.line(cx - 2.2, cy, cx - 0.6, cy + 1.7);
    doc.line(cx - 0.6, cy + 1.7, cx + 2.8, cy - 2.1);
  } else if (icon === "receipt") {
    doc.roundedRect(cx - 3.5, cy - 4.1, 7, 8.2, 0.8, 0.8, "S");
    doc.line(cx - 1.9, cy - 1.9, cx + 1.9, cy - 1.9);
    doc.line(cx - 1.9, cy, cx + 2.3, cy);
    doc.line(cx - 1.9, cy + 1.9, cx + 1.2, cy + 1.9);
    doc.line(cx - 2.2, cy - 4.1, cx - 1.3, cy - 3.3);
    doc.line(cx - 1.3, cy - 3.3, cx - 0.4, cy - 4.1);
    doc.line(cx - 0.4, cy - 4.1, cx + 0.5, cy - 3.3);
    doc.line(cx + 0.5, cy - 3.3, cx + 1.4, cy - 4.1);
  } else {
    doc.circle(cx, cy, 4.1, "S");
    doc.circle(cx, cy, 3.1, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.text("$", cx, cy + 2.3, { align: "center" });
  }
}

function summaryCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: number, icon: SummaryIcon, variant: "teal" | "navy" | "orange" = "teal", note?: string) {
  const accent = variant === "orange" ? C.orange : variant === "navy" ? C.navy : C.teal;
  const surface = variant === "orange" ? C.orangeBg : variant === "navy" ? C.grayBg : C.mint;
  fill(doc, surface);
  stroke(doc, variant === "orange" ? [242, 210, 164] : C.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, 22, 3.5, 3.5, "FD");
  fill(doc, C.white);
  doc.roundedRect(x + 4, y + 5, 12, 12, 3, 3, "F");
  drawSummaryIcon(doc, icon, x + 10, y + 11, accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text(label, x + 19, y + 8.1);
  ink(doc, C.navy);
  doc.setFontSize(12.5);
  doc.text(money(value), x + 19, y + 15.5);
  if (note) {
    ink(doc, C.grayText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(note, x + 19, y + 19.2);
  }
}

function breakdownCard(doc: jsPDF, x: number, y: number, w: number, eyebrow: string, title: string, totalLabel: string, total: number, lines: FinancePdfLine[], empty: string) {
  const visible = cleanLines(lines);
  const height = Math.max(39, 20 + visible.length * 4.6);
  fill(doc, C.white);
  stroke(doc, C.line);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, height, 3, 3, "FD");
  ink(doc, C.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text(eyebrow, x + 4, y + 6);
  ink(doc, C.navy);
  doc.setFontSize(9);
  doc.text(title, x + 4, y + 11.2);
  ink(doc, C.grayText);
  doc.setFontSize(5.3);
  doc.text(totalLabel, x + w - 4, y + 6, { align: "right" });
  ink(doc, C.teal);
  doc.setFontSize(8.2);
  doc.text(money(total), x + w - 4, y + 11.2, { align: "right" });
  stroke(doc, [228, 239, 235]);
  doc.line(x + 4, y + 14, x + w - 4, y + 14);

  if (!visible.length) {
    ink(doc, C.grayText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(empty, x + w / 2, y + 27, { align: "center" });
    return;
  }
  visible.forEach((line, index) => {
    const rowY = y + 19 + index * 4.6;
    fill(doc, C.turquoise);
    doc.circle(x + 5.3, rowY - 0.8, 1, "F");
    ink(doc, C.grayText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.text(clipText(doc, line.name, w - 42), x + 8, rowY);
    ink(doc, C.navy);
    doc.setFont("helvetica", "bold");
    doc.text(money(line.value), x + w - 4, rowY, { align: "right" });
  });
}

function paymentsCard(doc: jsPDF, x: number, y: number, w: number, eyebrow: string, title: string, lines: FinancePdfLine[]) {
  fill(doc, C.white);
  stroke(doc, C.line);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, 72, 3, 3, "FD");
  ink(doc, C.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text(eyebrow, x + 5, y + 6.3);
  ink(doc, C.navy);
  doc.setFontSize(9.5);
  doc.text(clipText(doc, title, w - 10), x + 5, y + 12.2);
  ink(doc, C.grayText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.text("Distribuição por forma de pagamento", x + 5, y + 16.5);

  const visible = cleanLines(lines).slice(0, 5);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  const rows = visible.length ? visible : [{ name: "Nenhuma venda informada", value: 0 }];
  rows.forEach((line, index) => {
    const rowTop = y + 21 + index * 8.3;
    const share = total ? (line.value / total) * 100 : 0;
    ink(doc, C.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(clipText(doc, line.name, w - 42), x + 5, rowTop + 2.3);
    doc.text(money(line.value), x + w - 14, rowTop + 2.3, { align: "right" });
    ink(doc, C.grayText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.text(percent(share), x + w - 5, rowTop + 2.3, { align: "right" });
    fill(doc, [231, 239, 236]);
    doc.roundedRect(x + 5, rowTop + 4.1, w - 10, 1.8, 0.9, 0.9, "F");
    if (share > 0) {
      fill(doc, index % 2 ? C.turquoise : C.teal);
      doc.roundedRect(x + 5, rowTop + 4.1, Math.max(1.4, (w - 10) * share / 100), 1.8, 0.9, 0.9, "F");
    }
  });
  fill(doc, C.mint);
  doc.roundedRect(x + 5, y + 62, w - 10, 7, 2, 2, "F");
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Total", x + 9, y + 66.7);
  doc.setFontSize(9.2);
  doc.text(money(total), x + w - 9, y + 66.7, { align: "right" });
}

function sellersCard(doc: jsPDF, y: number, lines: FinancePdfLine[]) {
  const visible = cleanLines(lines).sort((a, b) => b.value - a.value).slice(0, 6);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  fill(doc, C.navy);
  doc.roundedRect(13, y, 184, 40, 3.5, 3.5, "F");
  ink(doc, [139, 232, 209]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text("EQUIPE COMERCIAL", 18, y + 6.2);
  ink(doc, C.white);
  doc.setFontSize(10);
  doc.text("Vendas por vendedor no mês", 18, y + 12);
  ink(doc, [189, 244, 231]);
  doc.setFontSize(8.5);
  doc.text(money(total), 192, y + 11, { align: "right" });
  ink(doc, [204, 221, 225]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.3);
  doc.text("TOTAL INFORMADO", 192, y + 6.2, { align: "right" });
  stroke(doc, [55, 86, 105]);
  doc.line(18, y + 15, 192, y + 15);
  if (!visible.length) {
    ink(doc, [204, 221, 225]);
    doc.setFontSize(7);
    doc.text("Nenhuma venda por vendedor informada.", 105, y + 28, { align: "center" });
    return;
  }
  const colW = 55.2;
  visible.forEach((line, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 18 + col * 58;
    const rowY = y + 18.5 + row * 9;
    fill(doc, [35, 73, 91]);
    doc.roundedRect(x, rowY, colW, 7, 1.5, 1.5, "F");
    fill(doc, C.turquoise);
    doc.circle(x + 3.5, rowY + 3.5, 2, "F");
    ink(doc, C.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.text(String(index + 1), x + 3.5, rowY + 4.2, { align: "center" });
    ink(doc, C.white);
    doc.setFontSize(6.2);
    doc.text(clipText(doc, line.name, 26), x + 7, rowY + 4.4);
    ink(doc, [189, 244, 231]);
    doc.text(money(line.value), x + colW - 2, rowY + 4.4, { align: "right" });
  });
}

export function createFinancePdf(JsPdf: typeof import("jspdf").jsPDF, data: FinancePdfData, logoDataUrl?: string) {
  const doc = new JsPdf({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title: `Fluxo Financeiro Coreto - ${data.date}`, subject: "Relatório financeiro diário", author: "Coreto" });
  fill(doc, C.grayBg);
  doc.rect(0, 0, 210, 297, "F");

  fill(doc, C.mint);
  doc.rect(0, 0, 210, 34, "F");
  stroke(doc, C.line);
  doc.setLineWidth(0.35);
  doc.line(0, 34, 210, 34);
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 13, 6.7, 24, 19, undefined, "FAST");
  stroke(doc, C.turquoise);
  doc.line(42, 7, 42, 27);
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Fluxo Financeiro Diário", 48, 15.5);
  ink(doc, C.teal);
  doc.setFontSize(6.3);
  doc.text("VISÃO EXECUTIVA DO CAIXA", 48, 21);

  const displayDate = new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR");
  const weekday = new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  stroke(doc, C.turquoise);
  doc.line(163, 7, 163, 27);
  ink(doc, C.teal);
  doc.setFontSize(5.6);
  doc.text("DATA DE REFERÊNCIA", 197, 11, { align: "right" });
  ink(doc, C.navy);
  doc.setFontSize(11);
  doc.text(displayDate, 197, 17.2, { align: "right" });
  ink(doc, C.grayText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.text(weekday, 197, 21.8, { align: "right" });

  sectionTitle(doc, "Resumo financeiro", "Principais números para acompanhamento e decisão", 42);
  const cardW = 59.3;
  summaryCard(doc, 13, 49, cardW, "VENDAS DO MÊS", data.monthTotal, "wallet", "teal");
  summaryCard(doc, 75.4, 49, cardW, "VENDAS DO DIA ANTERIOR", data.previousDayTotal, "calendar", "navy", `Referente a ${data.previousDateLabel}`);
  summaryCard(doc, 137.8, 49, cardW, "SALDO TOTAL", data.balanceTotal, "bank", "teal");
  summaryCard(doc, 13, 75, cardW, "CONTAS PAGAS NO MÊS", data.accountsPaid, "check", "teal");
  summaryCard(doc, 75.4, 75, cardW, "CONTAS A PAGAR", data.accountsPayable, "receipt", "orange");
  summaryCard(doc, 137.8, 75, cardW, "CONTAS A RECEBER", data.receivableTotal, "coin", "teal");

  const banks = cleanLines(data.bankBalances);
  const firstBanks = banks.slice(0, 8);
  const bankExtraHeight = Math.max(0, 20 + firstBanks.length * 4.6 - 39);
  breakdownCard(doc, 13, 102, 90, "SALDOS POR CONTA", "Disponibilidade bancária", "SALDO TOTAL", data.balanceTotal, firstBanks, "Nenhum saldo bancário informado");
  breakdownCard(doc, 107, 102, 90, "VALORES A RECEBER", "Referências dos recebimentos", "TOTAL A RECEBER", data.receivableTotal, data.receivableEntries, "Nenhum recebimento informado");
  paymentsCard(doc, 13, 146 + bankExtraHeight, 90, "ACUMULADO DO MÊS", "Vendas por forma de pagamento", data.monthPayments);
  paymentsCard(doc, 107, 146 + bankExtraHeight, 90, "FECHAMENTO DO DIA ANTERIOR", `Vendas de ${data.previousDateLabel}`, data.dayPayments);
  sellersCard(doc, 223 + bankExtraHeight, data.sellerSales);

  stroke(doc, C.line);
  doc.line(13, 284, 197, 284);
  ink(doc, C.grayText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("Coreto Indústria e Comércio de Roupas", 13, 289);
  doc.text(`Relatório financeiro - ${displayDate}`, 197, 289, { align: "right" });
  // Keep every bank, adding continuation pages instead of dropping rows.
  for (let offset = 8; offset < banks.length; offset += 40) {
    doc.addPage();
    fill(doc, C.grayBg);
    doc.rect(0, 0, 210, 297, "F");
    sectionTitle(doc, "Saldos bancários — continuação", `Fluxo financeiro de ${displayDate}`, 20);
    breakdownCard(doc, 13, 32, 184, "SALDOS POR CONTA", "Disponibilidade bancária", "SALDO TOTAL", data.balanceTotal, banks.slice(offset, offset + 40), "");
    stroke(doc, C.line);
    doc.line(13, 284, 197, 284);
    ink(doc, C.grayText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(`Coreto - Relatório financeiro - ${displayDate}`, 13, 289);
    doc.text(`Página ${doc.getNumberOfPages()}`, 197, 289, { align: "right" });
  }
  return doc;
}

async function loadLogoDataUrl() {
  const response = await fetch("/coreto-logo.png");
  if (!response.ok) return undefined;
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function downloadFinancePdf(data: FinancePdfData) {
  const { jsPDF: JsPdf } = await import("jspdf");
  let logo: string | undefined;
  try { logo = await loadLogoDataUrl(); } catch { logo = undefined; }
  const doc = createFinancePdf(JsPdf, data, logo);
  doc.save(`fluxo-financeiro-coreto-${data.date}.pdf`);
}

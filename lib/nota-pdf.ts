/*
 * Lê a nota fiscal (DANFE em PDF) e devolve fornecedor, número, data e os itens.
 * Funciona por linha de texto: cada produto da DANFE vem numa linha com
 * código, descrição, NCM, CST, CFOP, unidade, quantidade, valor unitário e total.
 */

export type ItemNota = { nome: string; tipo: "tecido" | "aviamento" | "outro"; unidade: string; quantidade: number; valor_unitario: number; total: number };
export type LeituraNota = { fornecedor: string; numero: string; data: string; total: number; itens: ItemNota[] };

const numeroBR = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\s+/g, " ").trim();

/** Linha de produto: CÓDIGO DESCRIÇÃO NCM CST CFOP UN QTD V.UNIT V.TOTAL ... */
const PRODUTO = /^(\S+)\s+(.+?)\s+(\d{4}\.?\d{2}\.?\d{2})\s+(\d{2,4})\s+(\d{4})\s+([A-Za-zÇç]{1,6})\s+(\d[\d.]*,\d+)\s+(\d[\d.]*,\d+)\s+(\d[\d.]*,\d+)/;

function unidadeDe(un: string) {
  const u = un.toLowerCase();
  if (/^(m|mt|mts|metro|metros|mtr)$/.test(u)) return "m";
  if (/^(kg|kgs|quilo)$/.test(u)) return "kg";
  if (/^(pc|pç|pca|pcs|peca)$/.test(u)) return "pç";
  return "un";
}
function tipoDe(ncm: string, unidade: string, nome: string) {
  const cap = Number(ncm.replace(/\D/g, "").slice(0, 2));
  if (/tecido|malha|ramie|linho|viscose|crepe|cetim|tule|renda/i.test(nome) || (cap >= 50 && cap <= 60 && unidade === "m")) return "tecido";
  if (/z[ií]per|bot[aã]o|linha|el[aá]stico|etiqueta|entretela|vi[eé]s|il[hó]|fivela|alça|aviamento/i.test(nome) || cap === 96 || cap === 58 || cap === 83) return "aviamento";
  return cap >= 50 && cap <= 63 ? "tecido" : "outro";
}

/** Lê as linhas de texto (já com espaços simples) de todas as páginas. */
export function lerNotaDeLinhas(linhas: string[], nomeArquivo = ""): LeituraNota {
  const itens: ItemNota[] = [];
  const vistos = new Set<string>();
  for (const bruta of linhas) {
    const l = bruta.replace(/\s+/g, " ").trim();
    const m = PRODUTO.exec(l);
    if (!m) continue;
    const [, codigo, desc, ncm, , , un, qtd, unit, tot] = m;
    const chave = `${codigo}|${qtd}|${tot}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const unidade = unidadeDe(un);
    const nome = titulo(desc);
    itens.push({ nome, unidade, tipo: tipoDe(ncm, unidade, nome), quantidade: numeroBR(qtd), valor_unitario: Math.round(numeroBR(unit) * 10000) / 10000, total: numeroBR(tot) });
  }
  const texto = linhas.join("\n");
  // Nome do arquivo no padrão do Resumo do dia: "2026-10-19 FORNECEDOR - NF 2322935 - R$ 30.410,95.pdf"
  const arq = nomeArquivo.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+-\s+NF\s*([\d.]+)/i);
  const numero = arq?.[3]?.replace(/\D/g, "").replace(/^0+/, "")
    ?? (texto.match(/N[º°.o]{1,3}\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}|\d{6,9})/)?.[1] ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const emissao = texto.match(/DATA DA EMISS[ÃA]O[\s\S]{0,200}?(\d{2})[./](\d{2})[./](\d{4})/i);
  const data = arq?.[1] ?? (emissao ? `${emissao[3]}-${emissao[2]}-${emissao[1]}` : "");
  const totalArq = nomeArquivo.match(/R\$\s*(\d[\d.]*,\d{2})/i);
  const fornecedor = arq ? titulo(arq[2]) : "";
  return { fornecedor, numero, data, total: totalArq ? numeroBR(totalArq[1]) : itens.reduce((t, i) => t + i.total, 0), itens };
}

/** Lê o PDF (servidor) e devolve a leitura da nota. */
export async function lerNotaPdf(bytes: Uint8Array, nomeArquivo = "") {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const linhas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    const porY = new Map<number, { s: string; x: number }[]>();
    for (const bruto of conteudo.items as { str?: string; transform?: number[] }[]) {
      if (!bruto.str?.trim() || !bruto.transform) continue;
      const y = Math.round(bruto.transform[5] / 2);
      porY.set(y, [...(porY.get(y) ?? []), { s: bruto.str.trim(), x: bruto.transform[4] }]);
    }
    for (const [, l] of [...porY.entries()].sort((a, b) => b[0] - a[0])) linhas.push(l.sort((a, b) => a.x - b.x).map((t) => t.s).join(" "));
  }
  return lerNotaDeLinhas(linhas, nomeArquivo);
}

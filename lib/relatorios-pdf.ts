/*
 * Leitura dos relatórios em PDF do sistema de vendas da loja.
 * As posições (x) de cada coluna são as mesmas que o sistema antigo já usava
 * com os relatórios reais da Coreto.
 */

type Texto = { str: string; x: number; y: number };
type DocumentoPdf = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
};
export type Linha = Record<string, string | number>;

const valor = (v: string) => Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const dataIso = (v: string) => {
  const [dia, mes, ano] = v.split("/");
  return `${ano.length === 2 ? `20${ano}` : ano}-${mes}-${dia}`;
};
const mesDoRelatorio = (texto: string) => {
  const m = texto.match(/Periodo\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  return m ? `${m[3]}-${m[2]}` : "";
};

async function linhasPosicionadas(pdf: DocumentoPdf) {
  const paginas: Texto[][][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    const porY = new Map<number, Texto[]>();
    for (const bruto of conteudo.items) {
      const item = bruto as { str?: string; transform?: number[] };
      if (!item.str?.trim() || !item.transform) continue;
      const t = { str: item.str.trim(), x: item.transform[4], y: item.transform[5] };
      const chave = Math.round(t.y);
      porY.set(chave, [...(porY.get(chave) ?? []), t]);
    }
    paginas.push([...porY.values()].map((l) => l.sort((a, b) => a.x - b.x)).sort((a, b) => b[0].y - a[0].y));
  }
  return paginas;
}

const em = (linha: Texto[], min: number, max: number) => linha.find((i) => i.x >= min && i.x < max)?.str ?? "";

async function primeiraCompra(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const data = em(l, 10, 45), codigo = em(l, 85, 120);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !/^\d+$/.test(codigo)) continue;
    saida.push({
      primeira_compra: dataIso(data), codigo, nome: em(l, 120, 265), cidade: em(l, 280, 390), uf: em(l, 390, 415),
      telefone: em(l, 415, 540), vendedora: em(l, 540, 755), qtd_pecas: Number(em(l, 755, 800)) || 0, total_gasto: valor(em(l, 800, 840)),
    });
  }
  return saida;
}

async function aniversariantes(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (const pagina of await linhasPosicionadas(pdf)) for (const linha of pagina) {
    const cod = linha.find((i) => i.x >= 45 && i.x < 100 && /^\d{4,6}$/.test(i.str));
    if (!cod) continue;
    const cabecalho = pagina.filter((l) => Math.abs(l[0].y - cod.y) <= 2).flat().sort((a, b) => a.x - b.x);
    const nome = em(cabecalho, 100, 405), cpf = em(cabecalho, 530, 665);
    if (!nome || !/[\d.-]{8,}/.test(cpf)) continue;
    const endereco = pagina.find((l) => cod.y - l[0].y > 10 && cod.y - l[0].y < 18) ?? [];
    const fones = pagina.find((l) => cod.y - l[0].y > 25 && cod.y - l[0].y < 33) ?? [];
    const nasc = em(endereco, 720, 840);
    saida.push({
      codigo: cod.str, nome, cpf, cidade: em(endereco, 390, 500), uf: em(endereco, 495, 535),
      nascimento: /^\d{2}\/\d{2}\/\d{4}$/.test(nasc) ? dataIso(nasc) : "", telefone: em(fones, 150, 380),
    });
  }
  return saida;
}

async function vendasPorVendedora(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  let vendedora = ""; // continua valendo quando o grupo da vendedora passa para a página seguinte
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const titulo = l.find((i) => i.str === "Vendedor :");
    if (titulo) { vendedora = l.find((i) => i.x > titulo.x + 35)?.str ?? vendedora; continue; }
    const codigo = em(l, 10, 45), data = em(l, 45, 80);
    if (!/^\d{6}$/.test(codigo) || !/^\d{2}\/\d{2}\/\d{2}$/.test(data) || !vendedora) continue;
    const troca = em(l, 380, 455).match(/-?[\d.]+,\d{2}/)?.[0] ?? "0";
    saida.push({
      codigo_venda: codigo, data: dataIso(data), nome: em(l, 90, 235), vendedora,
      valor_produtos: valor(em(l, 330, 385)), valor_trocas: valor(troca), valor_variacao: valor(em(l, 490, 550)), valor: valor(em(l, 545, 595)),
    });
  }
  return saida;
}

/** Descobre o tipo do relatório pelo texto e devolve as linhas prontas para importar. */
export async function lerRelatorio(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const resultado = await extractText(pdf, { mergePages: true });
  const texto = typeof resultado.text === "string" ? resultado.text : (resultado.text as string[]).join("\n");
  const doc = pdf as unknown as DocumentoPdf;
  if (/Primeira Compra/i.test(texto)) return { tipo: "primeira_compra", mes: mesDoRelatorio(texto), linhas: await primeiraCompra(doc) };
  if (/Relat[óo]rio de Desconto\s*\/\s*Acr[ée]scimo de Vendas/i.test(texto)) return { tipo: "vendas_vendedora", mes: mesDoRelatorio(texto), linhas: await vendasPorVendedora(doc) };
  if (/Relat[óo]rio de Clientes/i.test(texto) && /Data\s*Nasc/i.test(texto)) return { tipo: "aniversariantes", mes: mesDoRelatorio(texto), linhas: await aniversariantes(doc) };
  return { tipo: "", mes: "", linhas: [] as Linha[] };
}

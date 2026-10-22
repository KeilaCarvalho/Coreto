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

/** Valor impresso logo à direita de um rótulo ("Cidade :" → "GOIANIA"), na mesma faixa de altura. */
function depoisDe(bloco: Texto[], rotulo: RegExp) {
  const r = bloco.find((i) => rotulo.test(i.str));
  if (!r) return "";
  const prox = bloco.filter((i) => Math.abs(i.y - r.y) <= 2.5 && i.x > r.x).sort((a, b) => a.x - b.x)[0];
  return prox && !/:\s*$/.test(prox.str) ? prox.str : "";
}

async function aniversariantes(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (const pagina of await linhasPosicionadas(pdf)) {
    const itens = pagina.flat();
    const rotulosCodigo = itens.filter((i) => /^C[óo]digo$/.test(i.str) && i.x < 45);
    const codigos = itens
      .filter((i) => i.x >= 45 && i.x < 100 && /^\d{4,6}$/.test(i.str) && rotulosCodigo.some((r) => Math.abs(r.y - i.y) <= 2.5))
      .sort((a, b) => b.y - a.y);
    codigos.forEach((cod, k) => {
      const limite = codigos[k + 1] ? codigos[k + 1].y + 3 : -Infinity;
      const bloco = itens.filter((i) => i.y <= cod.y + 3 && i.y > limite && i.y >= cod.y - 45);
      const nome = depoisDe(bloco, /^Cliente\s*:$/), cpf = depoisDe(bloco, /^C\.P\.F/);
      if (!nome) return;
      const nasc = depoisDe(bloco, /^Data\s*Nasc/);
      const fone = depoisDe(bloco, /^Fone1\s*:/) || depoisDe(bloco, /^Fone2\s*:/);
      saida.push({
        codigo: cod.str, nome, cpf: /[\d.-]{8,}/.test(cpf) ? cpf : "", cidade: depoisDe(bloco, /^Cidade\s*:/), uf: depoisDe(bloco, /^UF\s*:/),
        nascimento: /^\d{2}\/\d{2}\/\d{4}$/.test(nasc) ? dataIso(nasc) : "", telefone: /\d{8,}/.test(fone.replace(/\D/g, "")) ? fone : "",
      });
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

/* ---------- relatórios de vendas ---------- */

async function comissaoVendedor(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const m = (l.find((i) => i.x < 60)?.str ?? "").match(/^(\d{3,6})\s+(.+)$/);
    if (!m) continue;
    saida.push({
      codigo: m[1], vendedora: m[2].trim(),
      meta: valor(em(l, 170, 230)), vendas: valor(em(l, 230, 285)), comissao: valor(em(l, 330, 378)), percentual: valor(em(l, 378, 405)),
      qtd_vendas: Number(em(l, 405, 450)) || 0, qtd_pecas: Number(em(l, 450, 495)) || 0, preco_medio: valor(em(l, 540, 590)),
      ticket_medio: valor(em(l, 590, 655)), valor_pagar: valor(em(l, 780, 845)),
    });
  }
  return saida;
}

async function curvaAbc(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  let classe = "";
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const c = l.map((i) => i.str).join(" ").match(/^Classe\s*:\s*([A-Z])\b/);
    if (c) { classe = c[1]; continue; }
    const codigo = em(l, 10, 55);
    if (!/^\d{4,7}$/.test(codigo)) continue;
    saida.push({
      codigo, referencia: em(l, 55, 120), descricao: em(l, 120, 380), classe,
      quantidade: Number(em(l, 380, 460)) || 0, custo: valor(em(l, 460, 508)), venda: valor(em(l, 508, 548)), percentual: valor(em(l, 548, 600)),
    });
  }
  return saida;
}

async function evolucaoMensal(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  let mes = "";
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const t = l.map((i) => i.str).join(" ");
    const m = t.match(/Mes\s*\/\s*Ano\s*:\s*(\d{2})\/(\d{4})/i);
    if (m) { mes = `${m[2]}-${m[1]}`; continue; }
    if (!mes || !/^Totais\s*:/.test(t)) continue;
    saida.push({
      mes, pecas: Number(em(l, 200, 240)) || 0, devolucoes: Number(em(l, 240, 275)) || 0, faturadas: Number(em(l, 275, 310)) || 0,
      qtd_vendas: Number(em(l, 310, 345)) || 0, valor_total: valor(em(l, 380, 440)), preco_medio: valor(em(l, 440, 475)),
    });
    mes = "";
  }
  return saida;
}

async function vendasPorDia(pdf: DocumentoPdf): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (const pagina of await linhasPosicionadas(pdf)) for (const l of pagina) {
    const codigo = em(l, 15, 50), venda = em(l, 270, 310), data = em(l, 310, 360);
    if (!/^\d{4,7}$/.test(codigo) || !/^\d{4,7}$/.test(venda) || !/^\d{2}\/\d{2}\/\d{2,4}$/.test(data)) continue;
    const sinal = em(l, 438, 452) === "A" ? 1 : -1; // D = desconto, A = acréscimo
    saida.push({
      data: dataIso(data), venda, codigo, referencia: em(l, 50, 101), produto: em(l, 101, 243),
      quantidade: Number(em(l, 360, 395)) || 0, valor_produto: valor(em(l, 395, 440)),
      variacao_pct: sinal * valor(em(l, 455, 492)), variacao_valor: sinal * valor(em(l, 492, 540)), valor_total: valor(em(l, 540, 600)),
    });
  }
  return saida;
}

/** Tipos de relatório que o sistema reconhece, pelo título impresso no PDF. */
export const RELATORIOS: { tipo: string; titulo: RegExp; nome: string; destino: "clientes" | "vendas" }[] = [
  { tipo: "primeira_compra", titulo: /Primeira Compra/i, nome: "Clientes – primeira compra", destino: "clientes" },
  { tipo: "vendas_vendedora", titulo: /Relat[óo]rio de Desconto\s*\/\s*Acr[ée]scimo de Vendas/i, nome: "Vendas do mês por vendedora", destino: "clientes" },
  { tipo: "aniversariantes", titulo: /Relat[óo]rio de Clientes[\s\S]*Data\s*Nasc/i, nome: "Clientes (aniversariantes)", destino: "clientes" },
  { tipo: "comissao", titulo: /Resumo de Comiss[ãa]o Vendedor/i, nome: "Comissão das vendedoras", destino: "vendas" },
  { tipo: "curva_abc", titulo: /Curva ABC de Produtos/i, nome: "Produtos mais vendidos (curva ABC)", destino: "vendas" },
  { tipo: "evolucao", titulo: /Evolu[çc][ãa]o de Vendas/i, nome: "Resumo de vendas por mês", destino: "vendas" },
  { tipo: "vendas_dia", titulo: /Relat[óo]rio de Venda de Produtos/i, nome: "Vendas por dia (peça a peça)", destino: "vendas" },
];

/** Lê qualquer relatório reconhecido a partir do PDF já aberto e do texto dele. */
export async function analisarRelatorio(doc: DocumentoPdf, texto: string) {
  const r = RELATORIOS.find((x) => x.titulo.test(texto));
  if (!r) return { tipo: "", mes: "", linhas: [] as Linha[] };
  const leitor: Record<string, (d: DocumentoPdf) => Promise<Linha[]>> = {
    primeira_compra: primeiraCompra, vendas_vendedora: vendasPorVendedora, aniversariantes,
    comissao: comissaoVendedor, curva_abc: curvaAbc, evolucao: evolucaoMensal, vendas_dia: vendasPorDia,
  };
  return { tipo: r.tipo, mes: mesDoRelatorio(texto), linhas: await leitor[r.tipo](doc) };
}

/** Descobre o tipo do relatório pelo texto e devolve as linhas prontas para importar. */
export async function lerRelatorio(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const resultado = await extractText(pdf, { mergePages: true });
  const texto = typeof resultado.text === "string" ? resultado.text : (resultado.text as string[]).join("\n");
  return analisarRelatorio(pdf as unknown as DocumentoPdf, texto);
}

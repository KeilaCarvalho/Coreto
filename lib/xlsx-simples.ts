import { inflateRawSync } from "node:zlib";

/** Lê a primeira planilha de um .xlsx (zip) e devolve as linhas como texto. Sem dependências. */
export function lerXlsx(buf: Uint8Array): string[][] {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const arquivos = lerZip(b);
  const texto = (nome: string) => { const a = arquivos.get(nome); return a ? a.toString("utf8") : null; };
  const compartilhadas: string[] = [];
  const ss = texto("xl/sharedStrings.xml");
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) compartilhadas.push(juntarT(si));
  const nomePlanilha = [...arquivos.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const xml = nomePlanilha ? texto(nomePlanilha) : null;
  if (!xml) throw new Error("Não achei a planilha dentro do arquivo.");
  const linhas: string[][] = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const linha: string[] = [];
    for (const c of row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1];
      const tipo = /\bt="(\w+)"/.exec(c)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      let valor = "";
      if (tipo === "s" && v != null) valor = compartilhadas[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = juntarT(c);
      else if (v != null) valor = desfazer(v);
      const col = ref ? coluna(ref) : linha.length;
      linha[col] = valor;
    }
    linhas.push(Array.from(linha, (x) => x ?? ""));
  }
  return linhas;
}

const coluna = (letras: string) => [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
const juntarT = (xml: string) => (xml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => desfazer(t.replace(/<\/?t\b[^>]*>/g, ""))).join("");
const desfazer = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

function lerZip(b: Buffer) {
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error("O arquivo não é uma planilha do Excel (.xlsx).");
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  const saida = new Map<string, Buffer>();
  for (let i = 0; i < total; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = b.readUInt16LE(p + 10), tam = b.readUInt32LE(p + 20);
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const nome = b.toString("utf8", p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    if (!/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(nome)) continue;
    const ini = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const dados = b.subarray(ini, ini + tam);
    saida.set(nome, metodo === 8 ? inflateRawSync(dados) : Buffer.from(dados));
  }
  return saida;
}

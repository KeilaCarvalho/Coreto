import { unzipSync, strFromU8 } from "fflate";
import { parseContaAzulRows } from "./dre";

// The supplied Conta Azul .xls file is OOXML (ZIP), despite its extension.
// Read only cell values: macros, formulas, hyperlinks and external references never execute.
export async function readContaAzulFile(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("O arquivo deve ter até 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Este arquivo não está no formato Excel enviado pelo Conta Azul. Salve-o como .xlsx e tente novamente.");
  let total = 0;
  const files = unzipSync(bytes, { filter: info => {
    if (!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(info.name)) return false;
    total += info.originalSize;
    if (total > 24 * 1024 * 1024) throw new Error("Planilha muito grande após a leitura. Exporte um período menor.");
    return true;
  } });
  const xml = (name: string) => {
    const data = files[name]; if (!data) return null;
    const doc = new DOMParser().parseFromString(strFromU8(data), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("O arquivo contém uma planilha inválida.");
    return doc;
  };
  if (xml("xl/workbook.xml")?.getElementsByTagName("workbookPr")[0]?.getAttribute("date1904") === "1") throw new Error("Salve o arquivo com o sistema de datas padrão do Excel (1900).");
  const strings = [...(xml("xl/sharedStrings.xml")?.getElementsByTagName("si") || [])].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent || "").join(""));
  for (const name of Object.keys(files).filter(name => /^xl\/worksheets\//.test(name)).sort()) {
    const document = xml(name)!; const grid: unknown[][] = [];
    const rows = document.getElementsByTagName("row");
    if (rows.length > 10000) throw new Error("Exporte até 5.000 lançamentos por arquivo.");
    for (const row of rows) {
      const values: unknown[] = [];
      for (const cell of row.getElementsByTagName("c")) {
        const reference = cell.getAttribute("r") || "A1";
        const letters = /^[A-Z]+/.exec(reference)?.[0] || "A";
        let column = 0; for (const char of letters) column = column * 26 + char.charCodeAt(0) - 64;
        if (column > 256) continue;
        const type = cell.getAttribute("t"); const value = cell.getElementsByTagName("v")[0]?.textContent || "";
        values[column - 1] = type === "s" ? strings[Number(value)] : type === "inlineStr" ? [...cell.getElementsByTagName("t")].map(t => t.textContent || "").join("") : type === "str" ? value : value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
      }
      grid.push(values);
    }
    if (grid.some(row => row.some(value => String(value).toLowerCase() === "categoria 1"))) return parseContaAzulRows(grid);
  }
  throw new Error("Não encontrei a Visão Contas a Pagar neste arquivo.");
}

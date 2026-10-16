export const ETAPAS = [
  { valor: "nao_contatada", rotulo: "Não contatada", classe: "neutra" },
  { valor: "primeiro_contato", rotulo: "Primeiro contato", classe: "info" },
  { valor: "segundo_contato", rotulo: "Segundo contato", classe: "info" },
  { valor: "aguardando_retorno", rotulo: "Aguardando retorno", classe: "alerta" },
  { valor: "respondeu", rotulo: "Cliente respondeu", classe: "ok" },
  { valor: "venda_realizada", rotulo: "Venda realizada", classe: "ok" },
  { valor: "sem_retorno", rotulo: "Sem retorno", classe: "erro" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["valor"];
export const etapa = (valor: string) => ETAPAS.find((e) => e.valor === valor) ?? ETAPAS[0];

export const TIPOS_RELATORIO: Record<string, string> = {
  primeira_compra: "Clientes · primeira compra",
  aniversariantes: "Aniversariantes",
  vendas_vendedora: "Vendas por vendedora",
  carteira: "Carteira do sistema antigo",
};

/** Só os números do telefone, com 55 na frente quando faltar. */
export function telefoneWhats(telefone: string | null | undefined) {
  const digitos = String(telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length < 10) return null;
  return digitos.startsWith("55") && digitos.length >= 12 ? digitos : `55${digitos}`;
}

export function linkWhats(telefone: string | null | undefined, mensagem: string) {
  const numero = telefoneWhats(telefone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : null;
}

export const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};

/** "(62) 99999-0000" a partir de qualquer formato. */
export function telefoneBonito(telefone: string | null | undefined) {
  const d = String(telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone || "—";
}

/* ---------------------------------------------------------------------
   Planilha da carteira antiga (CSV exportado do sistema antigo ou do Excel)
   --------------------------------------------------------------------- */

/** Lê CSV com vírgula ou ponto e vírgula, respeitando aspas. */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Cabeçalhos aceitos (sistema antigo em inglês ou planilha em português).
const COLUNAS: Record<string, string[]> = {
  codigo: ["externalcode", "external_code", "codigo", "codigocliente", "cod"],
  nome: ["name", "nome", "cliente", "nomecliente"],
  cpf: ["cpf", "cpfcnpj"],
  nascimento: ["birthdate", "birth_date", "nascimento", "datanascimento", "aniversario", "datanasc"],
  telefone: ["phone", "telefone", "celular", "fone", "fone1", "whatsapp"],
  telefone_2: ["phone2", "phone_2", "telefone2", "fone2"],
  email: ["email", "e-mail"],
  cidade: ["city", "cidade"],
  uf: ["state", "uf", "estado"],
  vendedora: ["responsibleseller", "responsible_seller", "vendedora", "vendedor", "vendedoraresponsavel"],
  primeira_compra: ["firstpurchaseat", "first_purchase_at", "primeiracompra"],
  ultima_compra: ["lastpurchaseat", "last_purchase_at", "ultimacompra"],
  qtd_compras: ["purchasecount", "purchase_count", "compras", "qtdcompras"],
  qtd_pecas: ["piecescount", "pieces_count", "pecas", "qtdpecas"],
  total_gasto: ["totalspent", "total_spent", "totalgasto", "totalcomprado", "valortotal"],
  etapa: ["status", "etapa"],
  proximo_contato: ["nextcontactat", "next_contact_at", "proximocontato"],
};
const ETAPA_ANTIGA: Record<string, string> = {
  not_contacted: "nao_contatada", first_contact: "primeiro_contato", second_contact: "segundo_contato",
  waiting_response: "aguardando_retorno", waiting_return: "aguardando_retorno", replied: "respondeu", responded: "respondeu",
  sale_made: "venda_realizada", sold: "venda_realizada", no_response: "sem_retorno", no_return: "sem_retorno",
};

/** "16/10/2026", "2026-10-16" ou "2026-10-16T..." → "2026-10-16"; o resto vira vazio. */
export function dataIso(valor: string) {
  const v = valor.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
const valorNum = (v: string) => {
  const t = v.replace(/R\$|\s/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};

export type LinhaImportacao = Record<string, string | number>;

/** Converte a planilha da carteira em linhas para importar_clientes('carteira'). */
export function carteiraDoCsv(texto: string): { linhas: LinhaImportacao[]; colunas: string[] } {
  const tabela = lerCsv(texto);
  if (tabela.length < 2) return { linhas: [], colunas: [] };
  const cab = tabela[0].map(chave);
  const indice: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    const i = cab.findIndex((c) => nomes.map(chave).includes(c));
    if (i >= 0) indice[campo] = i;
  }
  const linhas = tabela.slice(1).map((l) => {
    const pega = (campo: string) => (indice[campo] != null ? String(l[indice[campo]] ?? "").trim() : "");
    const etapaBruta = pega("etapa");
    return {
      codigo: pega("codigo"), nome: pega("nome"), cpf: pega("cpf"), nascimento: dataIso(pega("nascimento")),
      telefone: pega("telefone"), telefone_2: pega("telefone_2"), email: pega("email"), cidade: pega("cidade"), uf: pega("uf").slice(0, 2),
      vendedora: pega("vendedora"), primeira_compra: dataIso(pega("primeira_compra")), ultima_compra: dataIso(pega("ultima_compra")),
      qtd_compras: Math.round(valorNum(pega("qtd_compras"))), qtd_pecas: Math.round(valorNum(pega("qtd_pecas"))), total_gasto: valorNum(pega("total_gasto")),
      etapa: ETAPA_ANTIGA[etapaBruta] ?? (ETAPAS.some((e) => e.valor === etapaBruta) ? etapaBruta : ""),
      proximo_contato: dataIso(pega("proximo_contato")),
    };
  }).filter((l) => l.nome);
  return { linhas, colunas: Object.keys(indice) };
}

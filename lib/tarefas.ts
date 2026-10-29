/** Minhas tarefas: áreas, colunas do Kanban, prioridades, repetições e atalhos. */

export type Tarefa = {
  id: string; titulo: string; area: string; prioridade: string; status: string; data: string | null;
  repete: string | null; checklist: { texto: string; feito: boolean }[]; notas: string | null;
  atalho: string | null; esperando_quem: string | null; ordem: number; feita_em: string | null; criado_em: string;
};

export const COLUNAS_TAREFA = "id, titulo, area, prioridade, status, data, repete, checklist, notas, atalho, esperando_quem, ordem, feita_em, criado_em";

export const AREAS = [
  { valor: "financeiro", rotulo: "Financeiro", cor: "#00ced1" },
  { valor: "producao", rotulo: "Produção/Facção", cor: "#f2a33a" },
  { valor: "loja", rotulo: "Loja/PDV", cor: "#e45fa3" },
  { valor: "sistema", rotulo: "Sistema Coreto", cor: "#6b7cff" },
  { valor: "pessoal", rotulo: "Pessoal", cor: "#22a06b" },
  { valor: "geral", rotulo: "Geral", cor: "#8a918c" },
] as const;

export const STATUS = [
  { valor: "ideia", rotulo: "Ideias/Futuro" },
  { valor: "a_fazer", rotulo: "A fazer" },
  { valor: "fazendo", rotulo: "Fazendo" },
  { valor: "esperando", rotulo: "Esperando alguém" },
  { valor: "feito", rotulo: "Feito" },
] as const;

export const PRIORIDADES = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "baixa", rotulo: "Baixa" },
] as const;

/** Telas do sistema que uma tarefa pode abrir direto. */
export const ATALHOS = [
  { valor: "/financeiro/fluxo", rotulo: "Fluxo financeiro" },
  { valor: "/financeiro/resumo", rotulo: "Resumo do dia" },
  { valor: "/producao/recebimentos", rotulo: "Chegada da facção" },
  { valor: "/produto/precificacao", rotulo: "Precificação" },
  { valor: "/produto/insumos", rotulo: "Notas e insumos" },
  { valor: "/produto/catalogo", rotulo: "Catálogo" },
  { valor: "/comercial/relatorios", rotulo: "Importar relatórios" },
  { valor: "/comercial/clientes", rotulo: "Clientes" },
  { valor: "/comercial/vendas", rotulo: "Vendas" },
  { valor: "/estoque/saldos", rotulo: "Saldos do estoque" },
  { valor: "/conta", rotulo: "Minha conta" },
] as const;

export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const area = (v: string) => AREAS.find((a) => a.valor === v) ?? AREAS[AREAS.length - 1];
export const status = (v: string) => STATUS.find((s) => s.valor === v) ?? STATUS[1];
export const atalho = (v: string | null) => ATALHOS.find((a) => a.valor === v) ?? null;

/** "Todo dia útil", "Toda segunda", "Todo dia 5"… */
export function descreverRepete(repete: string | null) {
  if (!repete) return null;
  if (repete === "dias_uteis") return "Todo dia útil";
  if (repete === "diaria") return "Todo dia";
  const [tipo, n] = repete.split(":");
  if (tipo === "semanal") { const d = DIAS_SEMANA[Number(n)] ?? ""; return d.endsWith("o") ? `Todo ${d}` : `Toda ${d}`; }
  if (tipo === "mensal") return `Todo dia ${n} do mês`;
  return null;
}

export const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const somarDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00-03:00`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** "qui 29/10" */
export function diaCurto(iso: string) {
  const d = new Date(`${iso}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DIAS_SEMANA[d.getDay()].slice(0, 3)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "Hoje", "Amanhã", "Ontem", "seg 03/11"… */
export function dataAmigavel(iso: string | null, hoje = hojeSP()) {
  if (!iso) return null;
  if (iso === hoje) return "Hoje";
  if (iso === somarDias(hoje, 1)) return "Amanhã";
  if (iso === somarDias(hoje, -1)) return "Ontem";
  return diaCurto(iso);
}

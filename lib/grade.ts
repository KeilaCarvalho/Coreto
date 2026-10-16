import type { CelulaGrade, LinhaGrade } from "@/components/grade-quantidades";

export type VarianteGrade = { id: string; cor_id: string; tamanho: string; ativa: boolean; cores: { nome: string; hex: string | null } | null };

/**
 * Monta linhas (cores) e células (cor × tamanho) a partir das variantes de um produto.
 * Só entram cores ativas, a menos que a cor apareça em "incluir" (ex.: já tem peças no lote).
 */
export function montarGrade(variantes: VarianteGrade[], incluir: Set<string> = new Set()) {
  const linhas = new Map<string, LinhaGrade>();
  const celulas: Record<string, CelulaGrade> = {};
  for (const v of variantes) {
    if (!v.ativa && !incluir.has(v.id)) continue;
    if (!linhas.has(v.cor_id)) linhas.set(v.cor_id, { corId: v.cor_id, nome: v.cores?.nome ?? "Cor", hex: v.cores?.hex ?? null });
    celulas[`${v.cor_id}|${v.tamanho}`] = { varianteId: v.id };
  }
  return { linhas: [...linhas.values()].sort((a, b) => a.nome.localeCompare(b.nome)), celulas };
}

/** Tamanhos da grade do produto, na ordem cadastrada. */
export const ordenarTamanhos = (t: { tamanho: string; ordem: number }[] | null | undefined) =>
  [...(t ?? [])].sort((a, b) => a.ordem - b.ordem).map((x) => x.tamanho);

/** Lê os campos "q:<variante_id>" de um formulário. */
export function lerGrade(dados: FormData): { erro: string } | { itens: { variante_id: string; quantidade: number }[] } {
  const itens: { variante_id: string; quantidade: number }[] = [];
  for (const [nome, valor] of dados.entries()) {
    if (!nome.startsWith("q:")) continue;
    const quantidade = Number(String(valor).trim() || 0);
    if (!Number.isInteger(quantidade) || quantidade < 0) return { erro: "As quantidades precisam ser números inteiros." };
    if (quantidade > 0) itens.push({ variante_id: nome.slice(2), quantidade });
  }
  return { itens };
}

export const SITUACAO: Record<string, { rotulo: string; classe: string; ajuda: string }> = {
  sem_preco: { rotulo: "Aguardando preço", classe: "alerta", ajuda: "O modelo ainda não tem preço de venda." },
  pendente: { rotulo: "Pendente", classe: "alerta", ajuda: "Faltou peça: o lote está seguro com você." },
  pronto: { rotulo: "Pronto para liberar", classe: "info", ajuda: "Tem preço e nada pendente." },
  concluido: { rotulo: "Liberado", classe: "ok", ajuda: "Todas as peças já estão à venda." },
  vazio: { rotulo: "Sem peças", classe: "neutra", ajuda: "As peças deste lote foram estornadas." },
};

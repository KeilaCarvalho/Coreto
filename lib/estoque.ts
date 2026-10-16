export const ROTULO_TIPO: Record<string, string> = {
  entrada_producao: "Entrada de produção", remessa_faccao: "Remessa à facção", retorno_faccao: "Retorno de facção",
  venda: "Venda", troca: "Troca", retirada: "Retirada", emprestimo_marketing: "Saída para fotos",
  devolucao_marketing: "Devolução de fotos", brinde: "Brinde ou permuta", perda: "Perda ou defeito",
  ajuste_entrada: "Ajuste de entrada", ajuste_saida: "Ajuste de saída", transferencia: "Transferência", estorno: "Estorno",
};

/** Lançamentos que a tela de Estoque permite registrar à mão (os demais nascem nos módulos próprios). */
export const LANCAMENTOS_MANUAIS = [
  { tipo: "entrada_producao", rotulo: "Entrada de produção", origem: false, destino: true, ajuda: "Peças prontas que chegaram da produção." },
  { tipo: "transferencia", rotulo: "Transferência entre locais", origem: true, destino: true, ajuda: "Ex.: do depósito para a loja." },
  { tipo: "ajuste_entrada", rotulo: "Ajuste de inventário (sobra)", origem: false, destino: true, ajuda: "A contagem física achou peças a mais." },
  { tipo: "ajuste_saida", rotulo: "Ajuste de inventário (falta)", origem: true, destino: false, ajuda: "A contagem física achou peças a menos." },
  { tipo: "perda", rotulo: "Perda ou defeito", origem: true, destino: false, ajuda: "Peça danificada que sai do estoque." },
] as const;

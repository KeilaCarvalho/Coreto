/** Nome de cada relatório importado e para onde os dados vão no sistema. */
export const NOMES: Record<string, { nome: string; vai: string }> = {
  primeira_compra: { nome: "Clientes – primeira compra", vai: "Carteira das vendedoras" },
  aniversariantes: { nome: "Clientes (aniversariantes)", vai: "Cadastro das clientes" },
  vendas_vendedora: { nome: "Vendas do mês por vendedora", vai: "Compras de cada cliente" },
  carteira: { nome: "Carteira do sistema antigo (planilha)", vai: "Carteira das vendedoras" },
  comissao: { nome: "Comissão das vendedoras", vai: "Tela de Vendas" },
  curva_abc: { nome: "Produtos mais vendidos (curva ABC)", vai: "Tela de Vendas" },
  evolucao: { nome: "Resumo de vendas por mês", vai: "Tela de Vendas" },
  vendas_dia: { nome: "Vendas por dia (peça a peça)", vai: "Tela de Vendas" },
};

/** Nome de cada relatório importado, para onde os dados vão e onde ver no sistema. */
export const NOMES: Record<string, { nome: string; vai: string; onde: string; href: string }> = {
  primeira_compra: { nome: "Clientes – primeira compra", vai: "Carteira das vendedoras", onde: "Clientes", href: "/comercial/clientes" },
  aniversariantes: { nome: "Clientes (aniversariantes)", vai: "Cadastro das clientes", onde: "Clientes", href: "/comercial/clientes" },
  vendas_vendedora: { nome: "Vendas do mês por vendedora", vai: "Compras de cada cliente e ranking das vendedoras", onde: "Vendas", href: "/comercial/vendas" },
  carteira: { nome: "Carteira do sistema antigo (planilha)", vai: "Carteira das vendedoras", onde: "Clientes", href: "/comercial/clientes" },
  comissao: { nome: "Comissão das vendedoras", vai: "Tela de Vendas", onde: "Vendas", href: "/comercial/vendas" },
  curva_abc: { nome: "Produtos mais vendidos (curva ABC)", vai: "Tela de Vendas", onde: "Vendas", href: "/comercial/vendas" },
  evolucao: { nome: "Resumo de vendas por mês", vai: "Tela de Vendas", onde: "Vendas", href: "/comercial/vendas" },
  vendas_dia: { nome: "Vendas por dia (peça a peça)", vai: "Tela de Vendas", onde: "Vendas", href: "/comercial/vendas" },
};

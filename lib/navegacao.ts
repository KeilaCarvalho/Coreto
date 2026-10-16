export type Modulo = "produto" | "producao" | "estoque" | "comercial" | "marketing" | "financeiro" | "pessoas" | "configuracoes";
export type Acao = "ver" | "criar" | "editar" | "aprovar";

import type { NomeIcone } from "@/components/icone";

export type ItemMenu = { rotulo: string; href: string; modulo: Modulo; acao?: Acao; icone: NomeIcone; fase?: string };
export type GrupoMenu = { rotulo: string; itens: ItemMenu[] };

/**
 * Menu do sistema, na ordem do roteiro.
 * Itens com fase aparecem como "em breve" para quem tem acesso ao módulo.
 */
export const MENU: GrupoMenu[] = [
  { rotulo: "Produto", itens: [
    { rotulo: "Catálogo", href: "/produto/catalogo", modulo: "produto", icone: "catalogo" },
    { rotulo: "Precificação", href: "/produto/precificacao", modulo: "produto", acao: "editar", icone: "ficha" },
  ] },
  { rotulo: "Produção", itens: [
    { rotulo: "Chegada da facção", href: "/producao/recebimentos", modulo: "producao", icone: "entrada" },
    { rotulo: "Quadro de produção", href: "/em-breve/quadro", modulo: "producao", icone: "quadro", fase: "F2" },
    { rotulo: "Facções e corte", href: "/em-breve/faccoes", modulo: "producao", icone: "faccao", fase: "F2" },
  ] },
  { rotulo: "Estoque", itens: [
    { rotulo: "Saldos", href: "/estoque/saldos", modulo: "estoque", icone: "saldos" },
    { rotulo: "Movimentações", href: "/estoque/movimentacoes", modulo: "estoque", icone: "movimentos" },
  ] },
  { rotulo: "Vendas", itens: [
    { rotulo: "Caixa", href: "/em-breve/caixa", modulo: "comercial", icone: "caixa", fase: "F3" },
    { rotulo: "Clientes", href: "/comercial/clientes", modulo: "comercial", icone: "clientes" },
    { rotulo: "Peças para fotos", href: "/em-breve/marketing", modulo: "marketing", icone: "fotos", fase: "F4" },
  ] },
  { rotulo: "Gestão", itens: [
    { rotulo: "Fluxo financeiro", href: "/financeiro/fluxo", modulo: "financeiro", icone: "financeiro" },
    { rotulo: "Equipe", href: "/pessoas/equipe", modulo: "pessoas", icone: "equipe" },
    { rotulo: "Folha e retiradas", href: "/em-breve/folha", modulo: "pessoas", icone: "folha", fase: "F4" },
  ] },
  { rotulo: "Configurações", itens: [
    { rotulo: "Acessos", href: "/configuracoes/acessos", modulo: "configuracoes", icone: "acessos" },
    { rotulo: "Cadastros", href: "/configuracoes/cadastros", modulo: "configuracoes", icone: "cadastros" },
    { rotulo: "Parceiros", href: "/configuracoes/parceiros", modulo: "configuracoes", icone: "parceiros" },
  ] },
];

/** Menu filtrado pelas permissões de quem está logado. */
export function menuPara(pode: (modulo: Modulo, acao?: Acao) => boolean): GrupoMenu[] {
  return MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => pode(i.modulo, i.acao)) })).filter((g) => g.itens.length);
}

export const EM_BREVE: Record<string, { titulo: string; fase: string; texto: string }> = {
  fichas: { titulo: "Fichas técnicas", fase: "Fase 1", texto: "A ficha técnica e a precificação do sistema antigo passam a ficar ligadas a cada produto do catálogo." },
  quadro: { titulo: "Quadro de produção", fase: "Fase 2", texto: "Cada card é uma ordem de produção, do desenvolvimento ao estoque. Substitui o Trello." },
  faccoes: { titulo: "Facções e corte", fase: "Fase 2", texto: "Remessas, retornos, saldo de peças em cada facção, corte terceirizado por diária e fechamento do pagamento." },
  caixa: { titulo: "Caixa", fase: "Fase 3", texto: "Venda por código de barras, NFC-e emitida pela API e baixa automática no estoque." },
  clientes: { titulo: "Clientes", fase: "Fase 3", texto: "O CRM atual, ligado às vendas feitas no caixa." },
  marketing: { titulo: "Peças para fotos", fase: "Fase 4", texto: "Saídas e devoluções de peças para fotos, com quem está cada peça e o que está atrasado." },
  folha: { titulo: "Folha e retiradas", fase: "Fase 4", texto: "Retiradas ligadas ao estoque e descontadas no fechamento da folha." },
  financeiro: { titulo: "Caixa e contas", fase: "Fase 5", texto: "Fluxo de caixa, contas a pagar e receber e DRE lidos dos lançamentos." },
};

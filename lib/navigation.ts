import { Banknote, Boxes, BriefcaseBusiness, ChartNoAxesCombined, ContactRound, PackageCheck, ReceiptText, Shirt, Users, Wallet } from "lucide-react";
export type NavigationRole = "admin" | "chefe" | "conferente" | "vendedora";
export const navigationGroups = [
  { id: "financeiro", label: "Financeiro", icon: Wallet, description: "Caixa, resultados e remuneração da equipe.", items: [
    { href: "/analise-financeira", label: "Análise financeira", icon: ChartNoAxesCombined, roles: ["admin", "chefe"] },
    { href: "/dre", label: "DRE", icon: ReceiptText, roles: ["admin", "chefe"] },
    { href: "/fluxo-financeiro", label: "Fluxo financeiro", icon: Banknote, roles: ["admin", "chefe"] },
    { href: "/folha-comissao", label: "Folha e comissão", icon: Users, roles: ["admin"] },
    { href: "/retiradas", label: "Retiradas", icon: Shirt, roles: ["admin"] },
  ] },
  { id: "comercial", label: "Comercial", icon: BriefcaseBusiness, description: "Relacionamento com clientes e desempenho das vendas.", items: [
    { href: "/crm", label: "CRM de clientes", icon: ContactRound, roles: ["admin", "vendedora"] },
    { href: "/vendas-comparativos", label: "Vendas e comparativos", icon: ChartNoAxesCombined, roles: ["admin", "chefe"] },
  ] },
  { id: "estoque", label: "Estoque", icon: Boxes, description: "Recebimentos, insumos e formação de preços.", items: [
    { href: "/recebimentos", label: "Recebimentos", icon: PackageCheck, roles: ["admin", "conferente"] },
    { href: "/estoque-precificacao", label: "Custos e precificação", icon: ReceiptText, roles: ["admin"] },
  ] },
];
export const roleLabels: Record<NavigationRole, string> = { admin: "Administrador", chefe: "Gestão", conferente: "Conferência", vendedora: "Vendedora" };
export function groupsForRole(role: NavigationRole | null) {
  return navigationGroups.map(group => ({ ...group, items: group.items.filter(item => role && item.roles.includes(role)) })).filter(group => group.items.length);
}
export function canAccessPage(path: string, role: NavigationRole) {
  if (path === "/") return true;
  if (path === "/usuarios") return role === "admin";
  return navigationGroups.some(group => group.items.some(item => item.href === path && item.roles.includes(role)));
}

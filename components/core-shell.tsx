"use client";

import { useEffect, useState } from "react";
import { BarChart3, Banknote, Boxes, ClipboardList, ContactRound, Menu, PackageCheck, Shirt, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "/", label: "Recebimento", icon: PackageCheck, roles: ["admin","conferente"] },
  { href: "/estoque-precificacao", label: "Estoque & Precificação", icon: Boxes, roles: ["admin"] },
  { href: "/retiradas", label: "Retiradas", icon: Shirt, roles: ["admin"] },
  { href: "/folha-comissao", label: "Folha & Comissão", icon: Users, roles: ["admin"] },
  { href: "/fluxo-financeiro", label: "Fluxo Financeiro", icon: Banknote, roles: ["admin","chefe"] },
  { href: "/vendas-comparativos", label: "Vendas & Comparativos", icon: BarChart3, roles: ["admin","chefe"] },
  { href: "/analise-financeira", label: "Análise Financeira", icon: ClipboardList, roles: ["admin","chefe"] },
  { href: "/crm", label: "CRM de Clientes", icon: ContactRound, roles: ["admin","vendedora"] },
  { href: "/usuarios", label: "Usuários e Acessos", icon: UserCog, roles: ["admin"] },
];

function Brand() {
  return <div className="flex items-center gap-3"><img src="/coreto-logo.png" alt="Coreto" className="h-14 w-auto object-contain"/><span className="sr-only">Coreto - Gestão interna</span></div>;
}

function Navigation({ active, role, mobile = false }: { active: string; role: string | null; mobile?: boolean }) {
  return <nav className="space-y-1 p-4" aria-label="Navegação principal">{links.filter((link) => role && link.roles.includes(role)).map((link) => {
    const Icon = link.icon;
    const item = <Link prefetch key={link.href} href={link.href} aria-current={active === link.href ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${active === link.href ? "bg-[#147bc4] font-semibold shadow-lg" : "hover:bg-white/10"}`}><Icon size={18}/>{link.label}</Link>;
    return mobile ? <SheetClose asChild key={link.href}>{item}</SheetClose> : item;
  })}</nav>;
}

export function CoreShell({ active, title, subtitle, children }: { active: string; title: string; subtitle: string; children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { fetch("/api/session").then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => { if (!response.ok) return; const nextRole = data.user.role as string; setRole(nextRole); const allowed = links.some((link) => link.href === active && link.roles.includes(nextRole)); if (!allowed) window.location.replace(nextRole === "vendedora" ? "/crm" : "/"); }); }, [active]);
  return <div className="min-h-screen bg-[#f4f7fa] text-[#17304c]">
    <aside className="coreto-scrollbar fixed inset-y-0 left-0 hidden w-[268px] flex-col overflow-y-auto bg-[#14375f] text-white lg:flex"><div className="border-b border-white/10 px-7 py-6"><Brand/></div><Navigation active={active} role={role}/><div className="mt-auto border-t border-white/10 p-5 text-xs text-blue-100/60">Sistema interno Coreto</div></aside>
    <main className="lg:ml-[268px]">
      <header className="border-b border-[#dce5ed] bg-white px-5 py-6 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1500px]">
        <Sheet>
          <SheetTrigger asChild><button type="button" className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#147bc4] shadow-sm lg:hidden" aria-label="Abrir menu principal"><Menu size={18}/>Menu</button></SheetTrigger>
          <SheetContent side="left" className="w-[290px] gap-0 border-0 bg-[#14375f] p-0 text-white">
            <SheetHeader className="border-b border-white/10 px-7 py-6 text-left"><SheetTitle className="sr-only">Menu principal</SheetTitle><SheetDescription className="sr-only">Escolha uma página do sistema Coreto.</SheetDescription><Brand/></SheetHeader>
            <Navigation active={active} role={role} mobile/>
            <div className="mt-auto border-t border-white/10 p-5 text-xs text-blue-100/60">Sistema interno Coreto</div>
          </SheetContent>
        </Sheet>
        <p className="text-xs text-[#708398]">{subtitle}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-[#14375f]">{title}</h1>
      </div></header>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">{children}</div>
    </main>
  </div>;
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#dfe7ee] bg-white shadow-sm"><h2 className="border-b px-5 py-4 font-bold text-[#14375f]">{title}</h2><div className="p-5">{children}</div></section>; }
export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const isoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

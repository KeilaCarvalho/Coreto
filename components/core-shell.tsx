"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, LayoutDashboard, Menu, RotateCw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { canAccessPage, groupsForRole, navigationGroups, roleLabels, type NavigationRole } from "@/lib/navigation";
type SessionUser = { name: string; email: string; role: NavigationRole; active: boolean };
type SessionState = { user: SessionUser | null; loading: boolean; error: string | null; retry: () => void };
const SessionContext = createContext<SessionState>({ user: null, loading: true, error: null, retry: () => {} });
export function useCoreSession() { return useContext(SessionContext); }
export function CoreSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, "retry">>({ user: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.user?.active) throw new Error(response.status === 403 || data.user?.active === false ? "Sua conta não tem acesso ativo ao Coreto. Entre em contato com a administração." : "Não foi possível verificar seu acesso.");
      setState({ user: data.user, loading: false, error: null });
    }).catch(error => { if (!controller.signal.aborted) setState({ user: null, loading: false, error: error.message || "Não foi possível conectar ao sistema." }); });
    return () => controller.abort();
  }, [attempt]);
  return <SessionContext.Provider value={{ ...state, retry: () => { setState({ user: null, loading: true, error: null }); setAttempt(value => value + 1); } }}>{children}</SessionContext.Provider>;
}
function Brand() {
  return <Link href="/" className="core-brand" aria-label="Coreto — Dashboard"><span className="core-brand-mark" aria-hidden="true">c<span>·</span></span><span>coreto<span className="core-brand-caption">GESTÃO INTERNA</span></span></Link>;
}
function Navigation({ active, mobile = false }: { active: string; mobile?: boolean }) {
  const { user } = useCoreSession();
  const groups = groupsForRole(user?.role || null);
  const wrap = (item: React.ReactElement, key: string) => mobile ? <SheetClose asChild key={key}>{item}</SheetClose> : item;
  return <nav className="core-navigation" aria-label="Menu principal">
    {wrap(<Link key="dashboard" href="/" className={`core-nav-main ${active === "/" ? "is-active" : ""}`} aria-current={active === "/" ? "page" : undefined}><LayoutDashboard size={19}/><span>Dashboard</span></Link>, "dashboard")}
    <p className="core-nav-caption">ÁREAS DE GESTÃO</p>
    {groups.map(group => { const Icon = group.icon; const selected = group.items.some(item => item.href === active); return <details key={`${group.id}-${active}`} className="core-nav-group" open>
      <summary className={selected ? "is-selected" : ""}><Icon size={19}/><span>{group.label}</span><ChevronDown size={15} className="core-nav-chevron"/></summary>
      <div className="core-nav-children">{group.items.map(item => wrap(<Link key={item.href} href={item.href} className={`core-nav-child ${active === item.href ? "is-active" : ""}`} aria-current={active === item.href ? "page" : undefined}><span className="core-nav-dot"/>{item.label}</Link>, item.href))}</div>
    </details>; })}
    {user?.role === "admin" && <div className="core-nav-settings"><p className="core-nav-caption">ADMINISTRAÇÃO</p>{wrap(<Link href="/usuarios" className={`core-nav-main ${active === "/usuarios" ? "is-active" : ""}`} aria-current={active === "/usuarios" ? "page" : undefined}><SlidersHorizontal size={19}/><span>Usuários e acessos</span></Link>, "users")}</div>}
  </nav>;
}
export function CoreShell({ active, title, subtitle, children }: { active: string; title: string; subtitle: string; children: React.ReactNode }) {
  const { user, loading, error, retry } = useCoreSession();
  const group = navigationGroups.find(group => group.items.some(item => item.href === active));
  const allowed = user && canAccessPage(active, user.role);
  const initials = user?.name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "C";
  return <div className="core-app">
    <a href="#page-content" className="core-skip-link">Pular para o conteúdo</a>
    <aside className="core-sidebar"><div className="core-brand-area"><Brand/></div><Navigation active={active}/><div className="core-sidebar-footer"><span className="core-avatar">{initials}</span><div><strong>{user?.name || "Coreto"}</strong><span>{user ? roleLabels[user.role] : "Gestão interna"}</span></div></div></aside>
    <div className="core-workspace">
      <header className="core-topbar"><div className="flex min-w-0 items-center gap-3"><Sheet><SheetTrigger asChild><button className="core-mobile-menu" aria-label="Abrir menu principal"><Menu size={21}/></button></SheetTrigger><SheetContent side="left" className="core-mobile-sidebar"><SheetHeader><SheetTitle className="sr-only">Menu principal</SheetTitle><SheetDescription className="sr-only">Navegue pelas áreas do Coreto.</SheetDescription><Brand/></SheetHeader><Navigation active={active} mobile/></SheetContent></Sheet><div className="core-breadcrumb"><Link href="/">Coreto</Link><ChevronRight size={14}/><span>{group?.label || (active === "/" ? "Visão geral" : "Administração")}</span></div></div><div className="core-topbar-account"><span className="core-account-label">{user ? roleLabels[user.role] : "Gestão interna"}</span><span className="core-avatar" aria-label={user?.name || "Coreto"}>{initials}</span></div></header>
      <main id="page-content" className="core-content" tabIndex={-1}><div className="core-page-heading"><div><p className="core-eyebrow">{group?.label || (active === "/" ? "SEU ESPAÇO DE GESTÃO" : "CONFIGURAÇÕES")}</p><h1>{title}</h1><p className="core-page-description">{subtitle}</p></div><span className="core-heading-date">{isoToday().split("-").reverse().join(" / ")}</span></div>
        {loading ? <div className="core-loading" role="status"><span className="core-loading-dot"/>Carregando seu espaço…</div> : error ? <section className="core-access-state" role="alert"><CircleAlert size={28}/><h2>Não foi possível abrir seu espaço</h2><p>{error}</p><button onClick={retry}><RotateCw size={16}/>Tentar novamente</button></section> : !allowed ? <section className="core-access-state"><CircleAlert size={28}/><h2>Área restrita</h2><p>Seu perfil não tem acesso a esta área.</p><Link href="/">Voltar ao Dashboard</Link></section> : children}
      </main><footer className="core-page-footer"><span>Coreto</span><span>Gestão interna</span></footer>
    </div>
  </div>;
}
export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="core-panel"><div className="core-panel-heading"><h2>{title}</h2>{action}</div><div className="core-panel-body">{children}</div></section>; }
export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const isoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

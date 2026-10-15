"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type LucideIcon, CalendarDays, ClipboardList, FileText, LayoutDashboard, LogOut,
  MessageCircle, Moon, Palette, Settings2, Smartphone,
  Sparkles, Sun, UsersRound, KanbanSquare, ArrowUpRight,
} from "lucide-react";

type IconType = LucideIcon;
type NavItem = { href: string; label: string; short: string; icon: IconType };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Trabalho",
    items: [
      { href: "/", label: "Início", short: "Início", icon: LayoutDashboard },
      { href: "/inbox", label: "Atendimentos", short: "Inbox", icon: MessageCircle },
      { href: "/funil", label: "Negócios", short: "Negócios", icon: KanbanSquare },
      { href: "/crm", label: "Contatos", short: "Contatos", icon: UsersRound },
      { href: "/agenda", label: "Agenda", short: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Organização",
    items: [
      { href: "/propostas", label: "Propostas", short: "Propostas", icon: FileText },
      { href: "/ordens", label: "Ordens de serviço", short: "Serviços", icon: ClipboardList },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/conexoes", label: "Conexões", short: "Conexões", icon: Smartphone },
      { href: "/automacoes", label: "Automações", short: "Automações", icon: Sparkles },
      { href: "/marca", label: "Minha marca", short: "Marca", icon: Palette },
      { href: "/configuracoes", label: "Configurações", short: "Ajustes", icon: Settings2 },
    ],
  },
];

const quickNavigation = groups[0].items;

function activePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export function Shell({
  children,
  currentUser,
  branding,
}: {
  children: React.ReactNode;
  currentUser?: string;
  branding?: { appName: string; tagline: string; markUrl: string };
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("nextlead-theme");
    const next = saved === "dark" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function changeTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("nextlead-theme", next);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  if (pathname === "/login") {
    return <main className="login-main">{children}</main>;
  }

  const activeItem = groups.flatMap((group) => group.items).find((item) => activePath(pathname, item.href));

  return (
    <div className="nl-shell">
      <aside className="nl-sidebar" aria-label="Menu principal">
        <Link href="/" className="nl-brand">
          <span className="nl-brand-mark">
            <img src={branding?.markUrl || "/nextlead-mark.png"} alt="" />
          </span>
          <span className="nl-brand-title">
            <strong>{branding?.appName || "NextLead"}</strong>
            <small>CRM para o seu dia a dia</small>
          </span>
        </Link>

        <div className="nl-sidebar-nav">
          {groups.map((group) => (
            <section className="nl-nav-group" key={group.label} aria-label={group.label}>
              <p className="nl-nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activePath(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={`nl-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                    <Icon size={19} strokeWidth={1.85} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>

        <div className="nl-sidebar-footer">
          <div className="nl-user-avatar" aria-hidden="true">{(currentUser || "U").slice(0, 1).toUpperCase()}</div>
          <div className="nl-user-copy">
            <strong>{currentUser || "Usuário"}</strong>
            <small>Minha conta</small>
          </div>
          <button type="button" className="nl-icon-btn" onClick={logout} aria-label="Sair da conta" title="Sair da conta">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="nl-workspace">
        <header className="nl-workspace-header">
          <div className="nl-breadcrumb">
            <span>Workspace</span>
            <span className="nl-breadcrumb-sep">/</span>
            <strong>{activeItem?.label || "NextLead"}</strong>
          </div>
          <div className="nl-header-actions">
            <button type="button" className="nl-theme-btn" onClick={changeTheme} aria-label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"} title={theme === "light" ? "Modo escuro" : "Modo claro"}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <Link className="nl-header-inbox" href="/inbox">
              <MessageCircle size={17} />
              <span>Atendimentos</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <main className="nl-main">{children}</main>
      </div>

      <nav className="nl-mobile-nav" aria-label="Acesso rápido">
        {quickNavigation.map((item) => {
          const Icon = item.icon;
          const active = activePath(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={`nl-mobile-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={20} strokeWidth={1.9} />
              <span>{item.short}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

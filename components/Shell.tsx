"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, KanbanSquare, LogOut, MessageCircle, Settings, Users } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: MessageCircle },
  { href: "/funil", label: "Funil", icon: KanbanSquare },
  { href: "/crm", label: "CRM", icon: Users },
  { href: "/ordens", label: "OS", icon: ClipboardList },
  { href: "/configuracoes", label: "Setup", icon: Settings },
];

export function Shell({ children, currentUser }: { children: React.ReactNode; currentUser?: string }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <main className="login-main">{children}</main>;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="NextLead CRM">
          <span className="brand-mark-img">
            <img src="/nextlead-mark.png" alt="" />
          </span>
          <span className="brand-copy">
            <strong>NextLead CRM</strong>
            <small>Páginas que convertem</small>
          </span>
        </Link>

        <nav className="nav">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}>
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-card user-card">
          <strong>{currentUser || "NextLead"}</strong>
          <small>Sessão protegida ativa.</small>
          <button type="button" className="sidebar-logout" onClick={logout}>
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal mobile">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={`mobile-${item.href}`} href={item.href} className={`mobile-bottom-link ${active ? "active" : ""}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

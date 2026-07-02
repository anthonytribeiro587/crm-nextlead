"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  KanbanSquare,
  LogOut,
  Megaphone,
  MessageCircle,
  Palette,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: string | number }>;
  disabled?: boolean;
  short?: string;
};

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Operação",
    items: [
      { href: "/", label: "Visão geral", short: "Visão", icon: BarChart3 },
      { href: "/inbox", label: "Atendimentos", short: "Atend.", icon: MessageCircle },
      { href: "/funil", label: "Funil", short: "Funil", icon: KanbanSquare },
      { href: "/agenda", label: "Agenda / Follow-ups", short: "Agenda", icon: CalendarClock },
      { href: "#", label: "Marketing", short: "Mkt", icon: Megaphone, disabled: true },
    ],
  },
  {
    title: "Cadastro",
    items: [
      { href: "/crm", label: "Contatos", short: "Contatos", icon: Users },
      { href: "/ordens", label: "Serviços / OS", short: "Serviços", icon: ClipboardList },
      { href: "/propostas", label: "Propostas", short: "Propostas", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/conexoes", label: "WhatsApp & conexões", short: "WhatsApp", icon: Smartphone },
      { href: "/marca", label: "Marca e empresa", short: "Marca", icon: Palette },
      { href: "/configuracoes", label: "Configurações", short: "Config.", icon: Settings },
    ],
  },
];

const mobileNav = navSections.flatMap((section) => section.items).filter((item) => ["/", "/inbox", "/funil", "/crm", "/ordens"].includes(item.href));

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
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
    const nextTheme = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("nextlead-theme", theme);
  }, [theme]);

  const flatNav = useMemo(() => navSections.flatMap((section) => section.items), []);

  if (pathname === "/login") {
    return <main className="login-main">{children}</main>;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div className="app-shell app-shell-v14">
      <aside className="sidebar sidebar-v14">
        <Link className="brand" href="/" aria-label={branding?.appName || "NextLead CRM"}>
          <span className="brand-mark-img">
            <img src={branding?.markUrl || "/nextlead-mark.png"} alt="" />
          </span>
          <span className="brand-copy">
            <strong>{branding?.appName || "NextLead CRM"}</strong>
            <small>{branding?.tagline || "Páginas que convertem"}</small>
          </span>
        </Link>

        <nav className="nav nav-v14" aria-label="Navegação principal">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <span className="nav-section-title">{section.title}</span>
              <div className="nav-section-list">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  if (item.disabled) {
                    return (
                      <span key={item.label} className="nav-link nav-link-disabled" title="Em breve">
                        <Icon size={17} />
                        <span>{item.label}</span>
                        <em>futuro</em>
                      </span>
                    );
                  }
                  return (
                    <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}>
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-card user-card user-card-v14">
          <strong>{currentUser || "NextLead"}</strong>
          <small>Sessão protegida ativa.</small>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Modo escuro" : "Modo claro"}
          </button>
          <button type="button" className="sidebar-logout" onClick={logout}>
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>
      <main className="main main-v14">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal mobile">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link key={`mobile-${item.href}`} href={item.href} className={`mobile-bottom-link ${active ? "active" : ""}`}>
              <Icon size={18} />
              <span>{item.short || item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

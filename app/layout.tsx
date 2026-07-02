import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { getCurrentUser } from "@/lib/auth-server";
import { getTenantContext } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "NextLead CRM WhatsApp",
  description: "CRM próprio com WhatsApp Cloud API, funil comercial e inbox.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();
  const tenant = await getTenantContext();

  return (
    <html lang="pt-BR" data-theme="light">
      <body
        style={{
          "--primary": tenant.primaryColor,
          "--primary-2": tenant.secondaryColor,
          "--violet": tenant.primaryColor,
        } as React.CSSProperties}
      >
        <Shell currentUser={user?.name} branding={{ appName: tenant.appName, tagline: tenant.tagline, markUrl: tenant.markUrl }}>{children}</Shell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { getCurrentUser } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "NextLead CRM WhatsApp",
  description: "CRM próprio com WhatsApp Cloud API, funil comercial e inbox.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();

  return (
    <html lang="pt-BR">
      <body>
        <Shell currentUser={user?.name}>{children}</Shell>
      </body>
    </html>
  );
}

import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth-server";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginPage() {
  const user = getCurrentUser();
  if (user) redirect("/");
  const tenant = await getTenantContext();

  return <LoginForm branding={{ appName: tenant.appName, tagline: tenant.tagline, logoUrl: tenant.logoUrl }} />;
}

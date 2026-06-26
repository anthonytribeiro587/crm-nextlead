import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  const user = getCurrentUser();
  if (user) redirect("/");

  return <LoginForm />;
}

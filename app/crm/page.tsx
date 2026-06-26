export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { ContactTable } from "@/components/ContactTable";
import { getCrmData } from "@/lib/data";

export default async function CrmPage() {
  const { contacts, deals } = await getCrmData();

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>Contatos, histórico e origem.</h1>
          <p className="description">Organize leads por origem, responsável, temperatura, oportunidade e último contato.</p>
        </div>
        <Link className="btn" href="/#entrada-lead">Novo contato</Link>
      </div>
      <ContactTable contacts={contacts} deals={deals} />
    </>
  );
}

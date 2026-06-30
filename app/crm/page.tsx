export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { ContactTable } from "@/components/ContactTable";
import { getCrmData } from "@/lib/data";

export default async function CrmPage() {
  const { contacts, deals, messages, activities, stages, serviceOrders, serviceOrdersReady } = await getCrmData();

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>Contatos, histórico e origem.</h1>
          <p className="description">Veja a ficha do cliente, histórico comercial, oportunidades e ordens de serviço vinculadas.</p>
        </div>
        <div className="actions">
          <Link className="btn secondary" href="/ordens">Ordens</Link>
          <Link className="btn" href="/#entrada-lead">Novo contato</Link>
        </div>
      </div>
      <ContactTable
        contacts={contacts}
        deals={deals}
        messages={messages}
        activities={activities}
        stages={stages}
        serviceOrders={serviceOrders}
        serviceOrdersReady={serviceOrdersReady}
      />
    </>
  );
}

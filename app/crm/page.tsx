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
          <p className="eyebrow">Contatos</p>
          <h1>Contatos e histórico.</h1>
          <p className="description">Consulte clientes, origem, oportunidades, conversas e serviços vinculados.</p>
        </div>
        <div className="actions">
          <Link className="btn secondary" href="/ordens">Serviços</Link>
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

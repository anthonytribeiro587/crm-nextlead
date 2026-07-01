export const dynamic = "force-dynamic";
export const revalidate = 0;

import { InboxClient } from "@/components/InboxClient";
import { getCrmData } from "@/lib/data";

export default async function InboxPage({ searchParams }: { searchParams?: { contact?: string } }) {
  const { contacts, messages, deals, stages, activities, serviceOrders } = await getCrmData();

  return (
    <>
      <div className="topbar inbox-topbar">
        <div>
          <p className="eyebrow">WhatsApp Inbox</p>
          <h1>Atendimento centralizado.</h1>
          <p className="description">Veja conversas, responda leads e mantenha o histórico conectado ao CRM.</p>
        </div>
        <span className="badge hot">Evolution API conectada</span>
      </div>
      <InboxClient contacts={contacts} messages={messages} deals={deals} stages={stages} activities={activities} serviceOrders={serviceOrders} initialSelectedId={searchParams?.contact} />
    </>
  );
}

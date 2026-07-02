export const dynamic = "force-dynamic";
export const revalidate = 0;

import { InboxClient } from "@/components/InboxClient";
import { getCrmData } from "@/lib/data";

export default async function InboxPage({ searchParams }: { searchParams?: { contact?: string } }) {
  const { contacts, messages, deals, pipelines, stages, activities, serviceOrders } = await getCrmData();

  return (
    <>
      <div className="topbar inbox-topbar">
        <div>
          <p className="eyebrow">Atendimentos</p>
          <h1>Atendimentos pelo WhatsApp.</h1>
          <p className="description">Responda conversas, acompanhe o contexto do lead e avance oportunidades sem sair da tela.</p>
        </div>
        <span className="badge hot">Evolution API conectada</span>
      </div>
      <InboxClient contacts={contacts} messages={messages} deals={deals} pipelines={pipelines} stages={stages} activities={activities} serviceOrders={serviceOrders} initialSelectedId={searchParams?.contact} />
    </>
  );
}

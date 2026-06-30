export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ServiceOrdersClient } from "@/components/ServiceOrdersClient";
import { getCrmData } from "@/lib/data";

export default async function ServiceOrdersPage() {
  const { contacts, deals, serviceOrders, serviceOrdersReady, serviceOrdersError } = await getCrmData();

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Ordens de serviço</p>
          <h1>Da venda para a execução.</h1>
          <p className="description">Controle demandas, prazos, responsáveis e status operacional vinculado ao histórico do cliente.</p>
        </div>
      </div>
      <ServiceOrdersClient
        contacts={contacts}
        deals={deals}
        serviceOrders={serviceOrders}
        serviceOrdersReady={serviceOrdersReady}
        serviceOrdersError={serviceOrdersError}
      />
    </>
  );
}

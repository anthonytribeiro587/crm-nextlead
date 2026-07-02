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
          <p className="eyebrow">Serviços / OS</p>
          <h1>Serviços e ordens.</h1>
          <p className="description">Acompanhe demandas, prazos, responsáveis e execução vinculada ao cliente.</p>
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

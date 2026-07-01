export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { KanbanBoard } from "@/components/KanbanBoard";
import { getCrmData } from "@/lib/data";

export default async function FunilPage() {
  const { contacts, deals, pipelines, stages } = await getCrmData();

  return (
    <div className="pipeline-page-v2">
      <div className="topbar pipeline-hero-v2">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1>Funil comercial.</h1>
          <p className="description">Veja oportunidades por etapa, priorize o próximo contato e mova negócios sem perder o contexto.</p>
        </div>
        <div className="actions">
          <Link className="btn secondary" href="/crm">Novo contato</Link>
          <Link className="btn" href="/inbox">Abrir Inbox</Link>
        </div>
      </div>
      <KanbanBoard contacts={contacts} deals={deals} pipelines={pipelines} stages={stages} />
    </div>
  );
}

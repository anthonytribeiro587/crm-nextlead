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
          <h1>Funil de vendas.</h1>
          <p className="description">Organize oportunidades por etapa, acompanhe propostas e mova negócios com contexto.</p>
        </div>
        <div className="actions">
          <Link className="btn secondary" href="/crm">Novo contato</Link>
          <Link className="btn" href="/inbox">Atendimentos</Link>
        </div>
      </div>
      <KanbanBoard contacts={contacts} deals={deals} pipelines={pipelines} stages={stages} />
    </div>
  );
}

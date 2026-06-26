export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { KanbanBoard } from "@/components/KanbanBoard";
import { getCrmData } from "@/lib/data";

export default async function FunilPage() {
  const { contacts, deals, stages } = await getCrmData();

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1>Funil comercial próprio.</h1>
          <p className="description">Arraste oportunidades entre etapas, edite valor/previsão e acompanhe o pipeline por fase.</p>
        </div>
        <div className="actions">
          <button className="btn secondary">Exportar</button>
          <Link className="btn" href="/#entrada-lead">Nova oportunidade</Link>
        </div>
      </div>
      <KanbanBoard contacts={contacts} deals={deals} stages={stages} />
    </>
  );
}

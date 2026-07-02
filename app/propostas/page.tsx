export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getCrmData } from "@/lib/data";
import { money, shortDate } from "@/lib/format";

export default async function PropostasPage() {
  const { contacts, deals, stages } = await getCrmData();
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const proposals = deals
    .filter((deal) => stageById.get(deal.stageId)?.title.toLowerCase().includes("proposta") || deal.title.toLowerCase().includes("proposta"))
    .sort((a, b) => new Date((b as any).updatedAt || b.createdAt).getTime() - new Date((a as any).updatedAt || a.createdAt).getTime());
  const total = proposals.reduce((sum, deal) => sum + deal.value, 0);

  return (
    <>
      <div className="topbar page-heading-v14">
        <div>
          <p className="eyebrow">Propostas</p>
          <h1>Propostas comerciais.</h1>
          <p className="description">Acompanhe propostas enviadas e retome negociações sem procurar no histórico.</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/funil">Ver funil</Link>
          <Link className="btn secondary" href="/inbox">Atendimentos</Link>
        </div>
      </div>

      <section className="card standard-card-v14">
        <div className="dash-section-head compact">
          <div>
            <p className="eyebrow-small">Pipeline</p>
            <h2>{proposals.length} proposta(s)</h2>
            <p className="muted">Total em propostas: {money(total)}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposta</th>
                <th>Contato</th>
                <th>Etapa</th>
                <th>Valor</th>
                <th>Atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {proposals.length === 0 ? (
                <tr><td colSpan={6}>Nenhuma proposta aberta no momento.</td></tr>
              ) : proposals.map((deal) => {
                const contact = contactById.get(deal.contactId);
                return (
                  <tr key={deal.id}>
                    <td><strong>{deal.title}</strong></td>
                    <td>{contact?.name || "Contato"}</td>
                    <td>{stageById.get(deal.stageId)?.title || "Etapa"}</td>
                    <td>{money(deal.value)}</td>
                    <td>{shortDate((deal as any).updatedAt || deal.createdAt)}</td>
                    <td><Link className="btn mini" href={`/inbox?contact=${deal.contactId}`}>Abrir</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

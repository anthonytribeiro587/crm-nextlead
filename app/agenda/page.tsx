export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getCrmData } from "@/lib/data";
import { shortDate } from "@/lib/format";

export default async function AgendaPage() {
  const { contacts, activities } = await getCrmData();
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const pending = activities
    .filter((activity) => !activity.done)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const done = activities
    .filter((activity) => activity.done)
    .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())
    .slice(0, 8);

  return (
    <>
      <div className="topbar page-heading-v14">
        <div>
          <p className="eyebrow">Agenda</p>
          <h1>Follow-ups e tarefas.</h1>
          <p className="description">Veja quem precisa de retorno hoje e mantenha a rotina comercial organizada.</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/inbox">Abrir atendimentos</Link>
        </div>
      </div>

      <section className="standard-grid-v14 two">
        <article className="card standard-card-v14">
          <div className="dash-section-head compact">
            <div>
              <p className="eyebrow-small">Pendente</p>
              <h2>Próximos retornos</h2>
            </div>
            <span className="badge">{pending.length} aberto(s)</span>
          </div>
          <div className="activity-list">
            {pending.length === 0 ? (
              <div className="dash-empty">Nenhum follow-up pendente.</div>
            ) : pending.slice(0, 12).map((activity) => {
              const contact = contactById.get(activity.contactId);
              return (
                <Link className="activity-card" href={`/inbox?contact=${activity.contactId}`} key={activity.id}>
                  <span>
                    <strong>{activity.title}</strong>
                    <small className="muted">{contact?.name || "Contato"} · {shortDate(activity.dueAt)}</small>
                  </span>
                  <span className="btn mini secondary">Abrir</span>
                </Link>
              );
            })}
          </div>
        </article>

        <article className="card standard-card-v14">
          <div className="dash-section-head compact">
            <div>
              <p className="eyebrow-small">Histórico</p>
              <h2>Concluídos recentes</h2>
            </div>
          </div>
          <div className="activity-list">
            {done.length === 0 ? (
              <div className="dash-empty">Nenhuma tarefa concluída recentemente.</div>
            ) : done.map((activity) => {
              const contact = contactById.get(activity.contactId);
              return (
                <Link className="activity-card done" href={`/inbox?contact=${activity.contactId}`} key={activity.id}>
                  <span>
                    <strong>{activity.title}</strong>
                    <small className="muted">{contact?.name || "Contato"} · {shortDate(activity.dueAt)}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </>
  );
}

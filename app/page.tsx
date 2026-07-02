export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getCrmData } from "@/lib/data";
import { money, shortDate } from "@/lib/format";

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function activityKey(activity: { contactId: string; title: string; dueAt: string; done: boolean }) {
  const date = new Date(activity.dueAt);
  const day = Number.isNaN(date.getTime()) ? activity.dueAt.slice(0, 10) : date.toISOString().slice(0, 10);
  return `${activity.contactId}:${activity.title}:${day}:${activity.done ? "done" : "pending"}`;
}

function previewText(value?: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 88) || "Sem prévia";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function DashboardPage() {
  const { contacts, deals, messages, activities, stages, serviceOrders, serviceOrdersReady, isDemo } = await getCrmData();
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const openDeals = deals.filter((deal) => deal.status === "aberto");
  const totalPipeline = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const proposalDeals = openDeals.filter((deal) => stageById.get(deal.stageId)?.title.toLowerCase().includes("proposta"));
  const hotLeads = contacts.filter((contact) => contact.temperature === "quente").length;
  const openServiceOrders = serviceOrders.filter((order) => !["concluida", "entregue", "cancelada"].includes(order.status));
  const lateServiceOrders = openServiceOrders.filter((order) => order.dueAt && new Date(order.dueAt).getTime() < now.getTime()).length;

  const pendingActivityMap = new Map<string, typeof activities[number]>();
  activities
    .filter((activity) => !activity.done)
    .forEach((activity) => {
      const key = activityKey(activity);
      if (!pendingActivityMap.has(key)) pendingActivityMap.set(key, activity);
    });
  const pendingActivities = Array.from(pendingActivityMap.values()).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const overdueActivities = pendingActivities.filter((activity) => new Date(activity.dueAt).getTime() < now.getTime()).length;
  const todayActivities = pendingActivities.filter((activity) => {
    const due = new Date(activity.dueAt);
    return due >= today && due < tomorrow;
  }).length;

  const messagesByContact = new Map<string, typeof messages>();
  messages.forEach((message) => {
    const current = messagesByContact.get(message.contactId) || [];
    current.push(message);
    messagesByContact.set(message.contactId, current);
  });

  const leadsWaitingReply = contacts
    .map((contact) => {
      const thread = (messagesByContact.get(contact.id) || []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const last = thread.at(-1);
      return { contact, last };
    })
    .filter((item) => item.last?.direction === "inbound" && item.last.status !== "read")
    .sort((a, b) => new Date(b.last?.createdAt || 0).getTime() - new Date(a.last?.createdAt || 0).getTime());

  const recentConversations = contacts
    .slice()
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  const salesQueue = [
    ...leadsWaitingReply.slice(0, 4).map(({ contact, last }) => ({
      id: `reply-${contact.id}`,
      label: "Responder",
      title: contact.name,
      detail: previewText(last?.body),
      href: `/inbox?contact=${contact.id}`,
      tone: "urgent",
      meta: last ? shortDate(last.createdAt) : "",
    })),
    ...pendingActivities.slice(0, 4).map((activity) => {
      const contact = contactById.get(activity.contactId);
      return {
        id: `activity-${activity.id}`,
        label: "Follow-up",
        title: contact?.name || "Lead",
        detail: activity.title,
        href: `/inbox?contact=${activity.contactId}`,
        tone: new Date(activity.dueAt).getTime() < now.getTime() ? "late" : "normal",
        meta: shortDate(activity.dueAt),
      };
    }),
  ].slice(0, 6);

  const proposalsValue = proposalDeals.reduce((sum, deal) => sum + deal.value, 0);

  return (
    <>
      <section className="dash-command card">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Bom dia, Anthony.</h1>
          <p className="description">Veja o que precisa de atenção agora: conversas, follow-ups, propostas e serviços.</p>
        </div>
        <div className="dash-command-actions">
          <span className={`system-status ${isDemo ? "demo" : "online"}`}>{isDemo ? "Modo demo" : "Supabase conectado"}</span>
          <Link className="btn" href="/inbox">Atendimentos</Link>
          <Link className="btn secondary" href="/funil">Funil</Link>
          <Link className="btn secondary" href="/ordens">Serviços</Link>
        </div>
      </section>

      <section className="dash-kpi-strip">
        <article className="dash-kpi primary">
          <span>Pipeline aberto</span>
          <strong>{money(totalPipeline)}</strong>
          <small>{openDeals.length} oportunidade(s)</small>
        </article>
        <article className="dash-kpi">
          <span>Sem resposta</span>
          <strong>{leadsWaitingReply.length}</strong>
          <small>cliente falou por último</small>
        </article>
        <article className="dash-kpi">
          <span>Follow-ups</span>
          <strong>{pendingActivities.length}</strong>
          <small>{todayActivities} hoje · {overdueActivities} atrasado(s)</small>
        </article>
        <article className="dash-kpi">
          <span>Propostas</span>
          <strong>{proposalDeals.length}</strong>
          <small>{money(proposalsValue)}</small>
        </article>
        <article className="dash-kpi">
          <span>OS abertas</span>
          <strong>{openServiceOrders.length}</strong>
          <small>{serviceOrdersReady ? `${lateServiceOrders} atrasada(s)` : "ativar tabela"}</small>
        </article>
      </section>

      <section className="dash-board-clean">
        <article className="dash-main-card card">
          <div className="dash-section-head">
            <div>
              <p className="eyebrow-small">Fila de trabalho</p>
              <h2>O que fazer agora</h2>
              <p className="muted">Ordem sugerida para o atendimento comercial de hoje.</p>
            </div>
            <Link className="btn mini secondary" href="/inbox">Abrir atendimentos</Link>
          </div>

          <div className="dash-task-list">
            {salesQueue.length === 0 ? (
              <div className="dash-empty">Nenhuma ação urgente agora.</div>
            ) : (
              salesQueue.map((item) => (
                <Link key={item.id} className={`dash-task-row ${item.tone}`} href={item.href}>
                  <span className="dash-task-label">{item.label}</span>
                  <span className="dash-task-copy">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <em>{item.meta}</em>
                </Link>
              ))
            )}
          </div>
        </article>

        <aside className="dash-side-column">
          <article className="dash-small-card card">
            <div className="dash-section-head compact">
              <div>
                <p className="eyebrow-small">Pipeline</p>
                <h2>Propostas abertas</h2>
              </div>
              <Link className="btn mini secondary" href="/funil">Ver</Link>
            </div>
            <div className="dash-mini-list">
              {proposalDeals.length === 0 ? (
                <div className="dash-empty mini">Nenhuma proposta aberta.</div>
              ) : proposalDeals.slice(0, 4).map((deal) => {
                const contact = contactById.get(deal.contactId);
                return (
                  <Link key={deal.id} className="dash-mini-row" href={`/inbox?contact=${deal.contactId}`}>
                    <span>
                      <strong>{deal.title}</strong>
                      <small>{contact?.name || "Lead"} · {stageById.get(deal.stageId)?.title || "Funil"}</small>
                    </span>
                    <em>{money(deal.value)}</em>
                  </Link>
                );
              })}
            </div>
          </article>

          <article className="dash-small-card card">
            <div className="dash-section-head compact">
              <div>
                <p className="eyebrow-small">Operação</p>
                <h2>Ordens abertas</h2>
              </div>
              <Link className="btn mini secondary" href="/ordens">Serviços</Link>
            </div>
            <div className="dash-mini-list">
              {!serviceOrdersReady ? (
                <div className="dash-empty mini">Rode a migration de OS.</div>
              ) : openServiceOrders.length === 0 ? (
                <div className="dash-empty mini">Nenhuma OS aberta.</div>
              ) : openServiceOrders.slice(0, 4).map((order) => {
                const contact = contactById.get(order.contactId);
                return (
                  <Link key={order.id} className="dash-mini-row" href="/ordens">
                    <span>
                      <strong>{order.title}</strong>
                      <small>{contact?.name || "Contato"} · {statusLabel(order.status)}</small>
                    </span>
                    <em>{order.dueAt ? shortDate(order.dueAt) : money(order.estimatedValue)}</em>
                  </Link>
                );
              })}
            </div>
          </article>
        </aside>
      </section>

      <section className="dash-recent card">
        <div className="dash-section-head compact">
          <div>
            <p className="eyebrow-small">Movimento</p>
            <h2>Conversas recentes</h2>
          </div>
          <span className="badge warm">{hotLeads} quente(s)</span>
        </div>
        <div className="dash-recent-grid">
          {recentConversations.map((contact) => (
            <Link key={contact.id} className="dash-mini-row" href={`/inbox?contact=${contact.id}`}>
              <span>
                <strong>{contact.name}</strong>
                <small>{contact.company || contact.source}</small>
              </span>
              <em>{shortDate(contact.lastMessageAt)}</em>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

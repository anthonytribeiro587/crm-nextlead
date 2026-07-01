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
    .slice(0, 82) || "Sem prévia";
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
  const proposalsOpen = openDeals.filter((deal) => stageById.get(deal.stageId)?.title.toLowerCase().includes("proposta"));
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
    .slice(0, 6);

  const nextAction = leadsWaitingReply[0]
    ? {
        label: "Responder agora",
        title: leadsWaitingReply[0].contact.name,
        detail: previewText(leadsWaitingReply[0].last?.body),
        href: `/inbox?contact=${leadsWaitingReply[0].contact.id}`,
      }
    : pendingActivities[0]
      ? {
          label: "Fazer follow-up",
          title: contactById.get(pendingActivities[0].contactId)?.name || "Lead",
          detail: new Date(pendingActivities[0].dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          href: `/inbox?contact=${pendingActivities[0].contactId}`,
        }
      : {
          label: "Operação em dia",
          title: "Nenhuma urgência agora",
          detail: "Acompanhe novas mensagens e oportunidades pelo Inbox.",
          href: "/inbox",
        };

  return (
    <>
      <section className="dashboard-v2-hero card">
        <div className="dashboard-v2-hero-copy">
          <p className="eyebrow">Painel comercial</p>
          <h1>Central de comando.</h1>
          <p className="description">Um resumo direto do que precisa de ação: responder, seguir proposta, fazer follow-up ou executar OS.</p>
          <div className="dashboard-v2-actions">
            <span className={`system-status ${isDemo ? "demo" : "online"}`}>{isDemo ? "Modo demo" : "Supabase conectado"}</span>
            <Link className="btn" href="/inbox">Abrir Inbox</Link>
            <Link className="btn secondary" href="/funil">Funil</Link>
            <Link className="btn secondary" href="/ordens">OS</Link>
          </div>
        </div>

        <Link className="dashboard-v2-next" href={nextAction.href}>
          <span>{nextAction.label}</span>
          <strong>{nextAction.title}</strong>
          <small>{nextAction.detail}</small>
        </Link>
      </section>

      <section className="dashboard-v2-metrics">
        <article className="dashboard-v2-metric primary">
          <span>Pipeline aberto</span>
          <strong>{money(totalPipeline)}</strong>
          <small>{openDeals.length} oportunidade(s)</small>
        </article>
        <article className="dashboard-v2-metric">
          <span>Sem resposta</span>
          <strong>{leadsWaitingReply.length}</strong>
          <small>cliente falou por último</small>
        </article>
        <article className="dashboard-v2-metric">
          <span>Follow-ups</span>
          <strong>{pendingActivities.length}</strong>
          <small>{todayActivities} hoje · {overdueActivities} atrasado(s)</small>
        </article>
        <article className="dashboard-v2-metric">
          <span>Propostas</span>
          <strong>{proposalsOpen.length}</strong>
          <small>{money(proposalsOpen.reduce((sum, deal) => sum + deal.value, 0))}</small>
        </article>
        <article className="dashboard-v2-metric">
          <span>OS abertas</span>
          <strong>{openServiceOrders.length}</strong>
          <small>{serviceOrdersReady ? `${lateServiceOrders} atrasada(s)` : "ativar tabela"}</small>
        </article>
      </section>

      <section className="dashboard-v2-grid">
        <article className="dashboard-v2-card dashboard-v2-card-main card">
          <div className="dashboard-v2-section-head">
            <div>
              <p className="eyebrow-small">Atenção</p>
              <h2>Responder primeiro</h2>
              <p className="muted">Conversas em que o cliente falou por último.</p>
            </div>
            <Link className="btn mini secondary" href="/inbox">Inbox</Link>
          </div>

          <div className="dashboard-v2-list">
            {leadsWaitingReply.length === 0 ? (
              <div className="dashboard-v2-empty">Nenhum lead aguardando resposta.</div>
            ) : (
              leadsWaitingReply.slice(0, 5).map(({ contact, last }) => (
                <Link key={contact.id} className="dashboard-v2-row urgent" href={`/inbox?contact=${contact.id}`}>
                  <span className="dashboard-v2-avatar">{contact.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{contact.name}</strong>
                    <small>{previewText(last?.body)}</small>
                  </span>
                  <em>{last ? shortDate(last.createdAt) : ""}</em>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="dashboard-v2-card card">
          <div className="dashboard-v2-section-head">
            <div>
              <p className="eyebrow-small">Agenda</p>
              <h2>Follow-ups</h2>
              <p className="muted">Próximos contatos comerciais.</p>
            </div>
          </div>
          <div className="dashboard-v2-list compact">
            {pendingActivities.length === 0 ? (
              <div className="dashboard-v2-empty">Nenhum follow-up pendente.</div>
            ) : (
              pendingActivities.slice(0, 5).map((activity) => {
                const contact = contactById.get(activity.contactId);
                return (
                  <Link key={activity.id} className="dashboard-v2-row" href={`/inbox?contact=${activity.contactId}`}>
                    <span>
                      <strong>{activity.title}</strong>
                      <small>{contact?.name || "Lead"}</small>
                    </span>
                    <em>{shortDate(activity.dueAt)}</em>
                  </Link>
                );
              })
            )}
          </div>
        </article>

        <article className="dashboard-v2-card card">
          <div className="dashboard-v2-section-head">
            <div>
              <p className="eyebrow-small">Pipeline</p>
              <h2>Propostas abertas</h2>
              <p className="muted">Oportunidades aguardando avanço.</p>
            </div>
            <Link className="btn mini secondary" href="/funil">Ver</Link>
          </div>
          <div className="dashboard-v2-list compact">
            {proposalsOpen.length === 0 ? (
              <div className="dashboard-v2-empty">Nenhuma proposta em aberto.</div>
            ) : (
              proposalsOpen.slice(0, 4).map((deal) => {
                const contact = contactById.get(deal.contactId);
                return (
                  <Link key={deal.id} className="dashboard-v2-row" href={`/inbox?contact=${deal.contactId}`}>
                    <span>
                      <strong>{deal.title}</strong>
                      <small>{contact?.name || "Lead"} · {contact?.company || "sem empresa"}</small>
                    </span>
                    <em>{money(deal.value)}</em>
                  </Link>
                );
              })
            )}
          </div>
        </article>

        <article className="dashboard-v2-card card">
          <div className="dashboard-v2-section-head">
            <div>
              <p className="eyebrow-small">Operação</p>
              <h2>Ordens abertas</h2>
              <p className="muted">Demandas que viraram execução.</p>
            </div>
            <Link className="btn mini secondary" href="/ordens">OS</Link>
          </div>
          <div className="dashboard-v2-list compact">
            {!serviceOrdersReady ? (
              <div className="dashboard-v2-empty">Rode a migration de OS no Supabase.</div>
            ) : openServiceOrders.length === 0 ? (
              <div className="dashboard-v2-empty">Nenhuma OS aberta.</div>
            ) : (
              openServiceOrders.slice(0, 4).map((order) => {
                const contact = contactById.get(order.contactId);
                return (
                  <Link key={order.id} className="dashboard-v2-row" href="/ordens">
                    <span>
                      <strong>{order.code}</strong>
                      <small>{order.title} · {contact?.name || "Contato"}</small>
                    </span>
                    <em>{order.dueAt ? shortDate(order.dueAt) : money(order.estimatedValue)}</em>
                  </Link>
                );
              })
            )}
          </div>
        </article>

        <article className="dashboard-v2-card dashboard-v2-card-wide card">
          <div className="dashboard-v2-section-head">
            <div>
              <p className="eyebrow-small">Movimento</p>
              <h2>Conversas recentes</h2>
              <p className="muted">Últimos contatos movimentados no CRM.</p>
            </div>
            <span className="badge warm">{hotLeads} quente(s)</span>
          </div>
          <div className="dashboard-v2-recent-grid">
            {recentConversations.map((contact) => (
              <Link key={contact.id} className="dashboard-v2-row" href={`/inbox?contact=${contact.id}`}>
                <span>
                  <strong>{contact.name}</strong>
                  <small>{contact.company || contact.source}</small>
                </span>
                <em>{shortDate(contact.lastMessageAt)}</em>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

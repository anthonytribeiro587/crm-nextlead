export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { MetricCard } from "@/components/MetricCard";
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
  const hotLeads = contacts.filter((contact) => contact.temperature === "quente").length;
  const proposalsOpen = openDeals.filter((deal) => stageById.get(deal.stageId)?.title.toLowerCase().includes("proposta"));
  const openServiceOrders = serviceOrders.filter((order) => !["concluida", "entregue", "cancelada"].includes(order.status));
  const lateServiceOrders = openServiceOrders.filter((order) => order.dueAt && new Date(order.dueAt).getTime() < now.getTime()).length;

  const pendingActivityKeys = new Set(
    activities
      .filter((activity) => !activity.done)
      .map(activityKey),
  );
  const pendingActivities = pendingActivityKeys.size;
  const overdueActivities = activities.filter((activity) => !activity.done && new Date(activity.dueAt).getTime() < now.getTime()).length;
  const todayActivities = activities.filter((activity) => {
    const due = new Date(activity.dueAt);
    return !activity.done && due >= today && due < tomorrow;
  }).length;
  const newToday = contacts.filter((contact) => new Date(contact.lastMessageAt).getTime() >= today.getTime()).length;

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
    .filter((item) => item.last?.direction === "inbound")
    .slice(0, 5);

  const recentConversations = contacts
    .slice()
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  return (
    <>
      <section className="dashboard-intro card dashboard-exec-hero">
        <div>
          <p className="eyebrow">Painel comercial</p>
          <h1>Comando da operação.</h1>
          <p className="description">Veja o que precisa de atenção hoje: novos leads, tarefas, propostas e conversas sem resposta.</p>
        </div>
        <div className="dashboard-intro-actions">
          <span className={`system-status ${isDemo ? "demo" : "online"}`}>{isDemo ? "Modo demo" : "Supabase conectado"}</span>
          <Link className="btn" href="/inbox">Abrir Inbox</Link>
          <Link className="btn secondary" href="/funil">Ver Funil</Link>
          <Link className="btn secondary" href="/ordens">Ordens</Link>
        </div>
      </section>

      <section className="grid cols-4 dashboard-metrics-grid" style={{ marginBottom: 14 }}>
        <MetricCard label="Pipeline aberto" value={money(totalPipeline)} hint={`${openDeals.length} oportunidades ativas`} />
        <MetricCard label="Tarefas pendentes" value={String(pendingActivities)} hint={`${todayActivities} para hoje · ${overdueActivities} atrasada(s)`} />
        <MetricCard label="Propostas abertas" value={String(proposalsOpen.length)} hint={money(proposalsOpen.reduce((sum, deal) => sum + deal.value, 0))} />
        <MetricCard label="Leads quentes" value={String(hotLeads)} hint={`${newToday} atualização(ões) hoje`} />
        <MetricCard label="Ordens abertas" value={String(openServiceOrders.length)} hint={serviceOrdersReady ? `${lateServiceOrders} atrasada(s)` : "ative a tabela OS"} />
      </section>

      <section className="dashboard-grid-pro">
        <article className="card dashboard-panel-pro">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">Prioridade</p>
              <h2>Próximas ações</h2>
              <p className="muted">Conclua follow-ups e abra o atendimento direto.</p>
            </div>
            <Link className="btn mini secondary" href="/inbox">Abrir Inbox</Link>
          </div>
          <ActivityList activities={activities} contacts={contacts} />
        </article>

        <article className="card dashboard-panel-pro">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">Atenção</p>
              <h2>Sem resposta</h2>
              <p className="muted">Conversas em que o cliente falou por último.</p>
            </div>
          </div>
          <div className="compact-list-pro">
            {leadsWaitingReply.length === 0 ? (
              <div className="empty-state mini-empty">Nenhum lead aguardando resposta.</div>
            ) : (
              leadsWaitingReply.map(({ contact, last }) => (
                <Link key={contact.id} className="compact-row-pro" href={`/inbox?contact=${contact.id}`}>
                  <span>
                    <strong>{contact.name}</strong>
                    <small>{last?.body || "Mensagem recebida"}</small>
                  </span>
                  <em>{last ? shortDate(last.createdAt) : ""}</em>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="card dashboard-panel-pro">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">Pipeline</p>
              <h2>Propostas em aberto</h2>
              <p className="muted">Oportunidades que precisam de avanço ou follow-up.</p>
            </div>
            <Link className="btn mini secondary" href="/funil">Funil</Link>
          </div>
          <div className="compact-list-pro">
            {proposalsOpen.length === 0 ? (
              <div className="empty-state mini-empty">Nenhuma proposta em aberto.</div>
            ) : (
              proposalsOpen.slice(0, 5).map((deal) => {
                const contact = contactById.get(deal.contactId);
                return (
                  <Link key={deal.id} className="compact-row-pro" href={`/inbox?contact=${deal.contactId}`}>
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

        <article className="card dashboard-panel-pro">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">Operação</p>
              <h2>Ordens em aberto</h2>
              <p className="muted">Demandas que já viraram execução ou entrega.</p>
            </div>
            <Link className="btn mini secondary" href="/ordens">OS</Link>
          </div>
          <div className="compact-list-pro">
            {!serviceOrdersReady ? (
              <div className="empty-state mini-empty">Rode a migration-v3-service-orders.sql para ativar.</div>
            ) : openServiceOrders.length === 0 ? (
              <div className="empty-state mini-empty">Nenhuma OS aberta.</div>
            ) : (
              openServiceOrders.slice(0, 5).map((order) => {
                const contact = contactById.get(order.contactId);
                return (
                  <Link key={order.id} className="compact-row-pro" href="/ordens">
                    <span>
                      <strong>{order.code} · {order.title}</strong>
                      <small>{contact?.name || "Contato"} · {order.status.replaceAll("_", " ")}</small>
                    </span>
                    <em>{order.dueAt ? shortDate(order.dueAt) : money(order.estimatedValue)}</em>
                  </Link>
                );
              })
            )}
          </div>
        </article>

        <article className="card dashboard-panel-pro">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">Movimento</p>
              <h2>Conversas recentes</h2>
              <p className="muted">Últimos contatos movimentados no CRM.</p>
            </div>
          </div>
          <div className="compact-list-pro">
            {recentConversations.map((contact) => (
              <Link key={contact.id} className="compact-row-pro" href={`/inbox?contact=${contact.id}`}>
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

      <section className="grid cols-2 dashboard-lower-pro">
        <LeadCaptureForm />
        <article className="card dashboard-panel-pro dashboard-playbook">
          <p className="eyebrow-small">Processo sugerido</p>
          <h2>Rotina comercial diária</h2>
          <div className="playbook-steps">
            <span>1. Responder leads sem resposta</span>
            <span>2. Concluir follow-ups atrasados</span>
            <span>3. Mover oportunidades no funil</span>
            <span>4. Enviar propostas pendentes</span>
          </div>
        </article>
      </section>
    </>
  );
}

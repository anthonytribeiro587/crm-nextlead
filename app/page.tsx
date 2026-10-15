export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import {
  ArrowRight, CalendarClock,
  FileText, KanbanSquare, MessageCircle,
} from "lucide-react";
import { getCrmData } from "@/lib/data";
import { money, shortDate } from "@/lib/format";

function isSameDay(value: string, date: Date) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toDateString() === date.toDateString();
}

function safeText(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 90) || "Sem mensagem recente";
}

function Metric({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: typeof MessageCircle;
}) {
  return (
    <article className="nl-metric">
      <div className="nl-metric-top">
        <span className="nl-metric-title">{title}</span>
        <span className="nl-metric-icon"><Icon size={16} /></span>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export default async function DashboardPage() {
  const { contacts, deals, messages, activities, stages, serviceOrders, serviceOrdersReady, isDemo, error } = await getCrmData();
  const now = new Date();
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  const openDeals = deals.filter((deal) => deal.status === "aberto");
  const pipelineValue = openDeals.reduce((total, deal) => total + deal.value, 0);
  const proposals = openDeals.filter((deal) => /proposta|orçamento/i.test(stageById.get(deal.stageId)?.title || ""));
  const pending = activities
    .filter((activity) => !activity.done)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const overdue = pending.filter((activity) => new Date(activity.dueAt).getTime() < now.getTime()).length;
  const dueToday = pending.filter((activity) => isSameDay(activity.dueAt, now)).length;
  const openOrders = serviceOrders.filter((order) => !["concluida", "entregue", "cancelada"].includes(order.status));

  const messagesByContact = new Map<string, typeof messages>();
  for (const message of messages) {
    const list = messagesByContact.get(message.contactId) || [];
    list.push(message);
    messagesByContact.set(message.contactId, list);
  }

  const unanswered = contacts
    .map((contact) => {
      const last = (messagesByContact.get(contact.id) || [])
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return { contact, last };
    })
    .filter(({ last }) => last?.direction === "inbound" && last.status !== "read")
    .sort((a, b) => new Date(b.last?.createdAt || 0).getTime() - new Date(a.last?.createdAt || 0).getTime());

  const workQueue = [
    ...unanswered.slice(0, 4).map(({ contact, last }) => ({
      id: "message-" + contact.id,
      title: contact.name,
      detail: safeText(last?.body),
      kind: "Responder",
      href: "/inbox?contact=" + encodeURIComponent(contact.id),
      meta: last ? shortDate(last.createdAt) : "",
      urgent: true,
    })),
    ...pending.slice(0, 5).map((activity) => ({
      id: "activity-" + activity.id,
      title: activity.title,
      detail: contactById.get(activity.contactId)?.name || "Contato",
      kind: "Atividade",
      href: "/inbox?contact=" + encodeURIComponent(activity.contactId),
      meta: shortDate(activity.dueAt),
      urgent: new Date(activity.dueAt).getTime() < now.getTime(),
    })),
  ].sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 7);

  const recentContacts = contacts
    .slice()
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  return (
    <div className="nl-dashboard">
      <header className="nl-page-heading">
        <div>
          <span className="nl-page-kicker">Visão geral</span>
          <h1>Seu dia em um só lugar</h1>
          <p>Acompanhe conversas, oportunidades e o que precisa da sua atenção.</p>
        </div>
        <div className="nl-page-actions">
          <Link className="nl-action" href="/funil"><KanbanSquare size={17} /> Ver funil</Link>
          <Link className="nl-action nl-action-primary" href="/inbox"><MessageCircle size={17} /> Abrir atendimentos</Link>
        </div>
      </header>

      {(isDemo || error) && (
        <div className="nl-demo-alert" role="status">
          <span aria-hidden="true">!</span>
          {isDemo
            ? "Você está visualizando dados de demonstração. Eles não representam vendas ou clientes reais."
            : "Não foi possível carregar todos os dados. Confira a conexão com o banco antes de utilizar o CRM."}
        </div>
      )}

      <section className="nl-metrics" aria-label="Resumo dos indicadores">
        <Metric title="Aguardando resposta" value={unanswered.length} hint="Conversas que pedem retorno" icon={MessageCircle} />
        <Metric title="Tarefas pendentes" value={pending.length} hint={dueToday + " para hoje · " + overdue + " atrasadas"} icon={CalendarClock} />
        <Metric title="Negócios abertos" value={openDeals.length} hint="Oportunidades em andamento" icon={KanbanSquare} />
        <Metric title="Valor em negociação" value={money(pipelineValue)} hint="Soma dos negócios em aberto" icon={FileText} />
      </section>

      <div className="nl-dashboard-grid">
        <section className="nl-panel">
          <header className="nl-panel-head">
            <div>
              <h2>Prioridades de hoje</h2>
              <p>Respostas e atividades para não perder oportunidades.</p>
            </div>
            <Link href="/agenda" className="nl-inline-link">Agenda <ArrowRight size={14} /></Link>
          </header>
          <div className="nl-list">
            {workQueue.length === 0 ? (
              <p className="nl-empty">Tudo em dia por aqui. Novas mensagens e tarefas aparecerão nesta lista.</p>
            ) : workQueue.map((item) => (
              <Link className="nl-list-row" href={item.href} key={item.id}>
                <span className={`nl-list-avatar ${item.urgent ? "urgent" : ""}`} aria-hidden="true">
                  {item.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="nl-list-content">
                  <strong><span className="nl-list-tag">{item.kind}</span>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="nl-list-meta">{item.meta}</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="nl-panel-stack">
          <section className="nl-panel">
            <header className="nl-panel-head">
              <div><h2>Resumo comercial</h2><p>Negócios e serviços em andamento.</p></div>
              <Link className="nl-inline-link" href="/funil">Ver tudo <ArrowRight size={14} /></Link>
            </header>
            <div className="nl-mini-stat"><strong>Propostas abertas</strong><em>{proposals.length}</em></div>
            <div className="nl-mini-stat"><span>Valor das propostas</span><em>{money(proposals.reduce((sum, deal) => sum + deal.value, 0))}</em></div>
            <div className="nl-mini-stat"><strong>Ordens de serviço</strong><em>{serviceOrdersReady ? openOrders.length : "—"}</em></div>
            <div className="nl-mini-stat"><span>Contatos cadastrados</span><em>{contacts.length}</em></div>
            {!serviceOrdersReady && <p className="nl-panel-note">O módulo de serviços ainda precisa ser configurado no banco.</p>}
          </section>

          <section className="nl-panel">
            <header className="nl-panel-head">
              <div><h2>Conversas recentes</h2><p>Retome o contato de onde parou.</p></div>
              <Link href="/inbox" className="nl-inline-link">Inbox <ArrowRight size={14} /></Link>
            </header>
            <div className="nl-list">
              {recentContacts.length === 0 ? (
                <p className="nl-empty">Seus contatos aparecerão aqui quando começarem a conversar.</p>
              ) : recentContacts.map((contact) => (
                <Link key={contact.id} className="nl-list-row" href={"/inbox?contact=" + encodeURIComponent(contact.id)}>
                  <span className="nl-list-avatar" aria-hidden="true">{contact.name.slice(0, 1).toUpperCase()}</span>
                  <span className="nl-list-content"><strong>{contact.name}</strong><small>{contact.company || contact.source}</small></span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

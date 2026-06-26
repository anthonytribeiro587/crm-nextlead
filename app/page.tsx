export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { MetricCard } from "@/components/MetricCard";
import { getCrmData } from "@/lib/data";
import { money } from "@/lib/format";

export default async function DashboardPage() {
  const { contacts, deals, activities, isDemo } = await getCrmData();
  const openDeals = deals.filter((deal) => deal.status === "aberto");
  const totalPipeline = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const hotLeads = contacts.filter((contact) => contact.temperature === "quente").length;
  const pendingActivityKeys = new Set(
    activities
      .filter((activity) => !activity.done)
      .map((activity) => `${activity.contactId}:${activity.title}:${new Date(activity.dueAt).toISOString().slice(0, 10)}`),
  );
  const pendingActivities = pendingActivityKeys.size;

  return (
    <>
      <section className="dashboard-intro card">
        <div>
          <p className="eyebrow">Painel comercial</p>
          <h1>Visão rápida da operação.</h1>
          <p className="description">Acompanhe leads, tarefas e oportunidades sem ocupar a tela com informações repetidas.</p>
        </div>
        <div className="dashboard-intro-actions">
          <span className={`system-status ${isDemo ? "demo" : "online"}`}>{isDemo ? "Modo demo" : "Supabase conectado"}</span>
          <Link className="btn" href="/inbox">Abrir Inbox</Link>
          <Link className="btn secondary" href="/configuracoes">Setup</Link>
        </div>
      </section>

      <section className="grid cols-4" style={{ marginBottom: 14 }}>
        <MetricCard label="Leads cadastrados" value={String(contacts.length)} hint={isDemo ? "Base demo do CRM" : "Base real no Supabase"} />
        <MetricCard label="Pipeline aberto" value={money(totalPipeline)} hint={`${openDeals.length} oportunidades`} />
        <MetricCard label="Leads quentes" value={String(hotLeads)} hint="Prioridade de abordagem" />
        <MetricCard label="Tarefas pendentes" value={String(pendingActivities)} hint="Follow-ups do dia" />
      </section>

      <section className="grid cols-2">
        <LeadCaptureForm />
        <article className="card">
          <div className="section-headline">
            <div>
              <h2>Próximas ações</h2>
              <p className="muted">Conclua tarefas sem sair do dashboard.</p>
            </div>
            <Link className="btn mini secondary" href="/inbox">Abrir Inbox</Link>
          </div>
          <ActivityList activities={activities} contacts={contacts} />
        </article>
      </section>
    </>
  );
}

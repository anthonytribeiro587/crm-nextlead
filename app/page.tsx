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
      <section className="hero">
        <article className="card hero-card hero-card-main">
          <div>
            <div className="hero-logo">
              <img src="/nextlead-logo.png" alt="NextLead" />
            </div>
            <p className="eyebrow">Sistema próprio</p>
            <h1>CRM WhatsApp + funil para vender mais landing pages.</h1>
            <p className="description">
              Painel compacto para controlar conversas, leads, propostas e oportunidades da NextLead. O lead entra pela landing page, vira contato no CRM e já cai no funil comercial.
            </p>
          </div>
          <div className="flow-line">
            <span className="flow-chip">Landing Page</span>
            <span className="flow-chip">WhatsApp</span>
            <span className="flow-chip">CRM</span>
            <span className="flow-chip">Funil</span>
            <span className="flow-chip">Fechamento</span>
          </div>
        </article>

        <article className="card hero-card">
          <div>
            <p className="eyebrow">{isDemo ? "Modo demonstração" : "Supabase conectado"}</p>
            <h2>{isDemo ? "Configure o Supabase" : "Banco real ativado"}</h2>
            <p className="description">
              {isDemo
                ? "O painel está usando dados de demonstração. Configure as variáveis do Supabase na Vercel para salvar e listar leads reais."
                : "Leads, contatos, oportunidades, tarefas e mensagens agora são carregados do Supabase."}
            </p>
          </div>
          <div className="actions">
            <Link className="btn" href="/inbox">Abrir Inbox</Link>
            <Link className="btn secondary" href="/configuracoes">Ver setup</Link>
          </div>
        </article>
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

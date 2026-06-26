import { EvolutionSetupPanel } from "@/components/EvolutionSetupPanel";
import { WhatsAppTestPanel } from "@/components/WhatsAppTestPanel";
import { getWhatsAppProvider } from "@/lib/whatsapp";

function statusBadge(active: boolean, label: string) {
  return <span className={`status-dot ${active ? "ok" : "warn"}`}>{label}</span>;
}

function mask(value?: string) {
  if (!value) return "não configurado";
  if (value.length <= 12) return "configurado";
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

export default function ConfigPage() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://nextlead-crm.vercel.app").replace(/\/$/, "");
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const webhookUrl = `${appUrl}/api/whatsapp/webhook${webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ""}`;
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasLeadCors = Boolean(process.env.NEXTLEAD_ALLOWED_ORIGINS);
  const provider = getWhatsAppProvider();
  const hasEvolution = Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
  const hasMeta = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const whatsappReady = provider !== "demo";

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Setup</p>
          <h1>Configuração da integração.</h1>
          <p className="description">CRM protegido, landing pages conectadas e WhatsApp via Evolution API rodando na Oracle.</p>
        </div>
      </div>

      <section className="grid cols-3 setup-status-grid">
        <article className="card compact-status">
          <small className="muted">Banco de dados</small>
          <strong>Supabase</strong>
          {statusBadge(hasSupabase, hasSupabase ? "conectado" : "pendente")}
        </article>
        <article className="card compact-status">
          <small className="muted">Landing pages</small>
          <strong>Entrada de leads</strong>
          {statusBadge(hasLeadCors, hasLeadCors ? "liberada" : "sem CORS")}
        </article>
        <article className="card compact-status">
          <small className="muted">WhatsApp</small>
          <strong>{provider === "evolution" ? "Evolution API" : provider === "meta" ? "Meta Cloud API" : "Não configurado"}</strong>
          {statusBadge(whatsappReady, whatsappReady ? "envio ativo" : "pendente")}
        </article>
      </section>

      <section className="grid cols-2" style={{ marginTop: 18 }}>
        <article className="card">
          <h2>Variáveis do projeto</h2>
          <p className="description">Estas são as variáveis principais usadas na Vercel. A Evolution API é o provedor ativo neste momento.</p>
          <pre className="code">{`NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_DEFAULT_PIPELINE_ID=00000000-0000-0000-0000-000000000001

NEXTLEAD_AUTH_SECRET=
NEXTLEAD_ANTHONY_PASSWORD=
NEXTLEAD_FELIPE_PASSWORD=

NEXTLEAD_ALLOWED_ORIGINS=*
NEXTLEAD_LEADS_API_KEY=

WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=${process.env.EVOLUTION_API_URL || "http://147.15.89.173:8080"}
EVOLUTION_API_KEY=${mask(process.env.EVOLUTION_API_KEY)}
EVOLUTION_INSTANCE=${process.env.EVOLUTION_INSTANCE || "nextlead"}
WHATSAPP_WEBHOOK_SECRET=${webhookSecret ? mask(webhookSecret) : "opcional"}`}</pre>
        </article>

        <article className="card">
          <h2>Webhook da Evolution API</h2>
          <p className="description" style={{ marginBottom: 14 }}>Use esta URL na Evolution para receber mensagens no CRM e salvar histórico no Supabase.</p>
          <div className="setup-list">
            <div>
              <small className="muted">Webhook URL</small>
              <pre className="code inline-code">{webhookUrl}</pre>
            </div>
            <div>
              <small className="muted">Status das variáveis</small>
              <div style={{ marginTop: 8 }}>{statusBadge(hasEvolution, hasEvolution ? "Evolution configurada" : "configure Evolution")}</div>
            </div>
            <div>
              <small className="muted">Diagnóstico</small>
              <pre className="code inline-code">{`${appUrl}/api/debug/whatsapp`}</pre>
            </div>
          </div>
          <EvolutionSetupPanel />
          <p className="description" style={{ marginTop: 14 }}>Se o botão não configurar automaticamente, abra o Manager da Evolution, entre na instância <strong>nextlead</strong> e configure o webhook manualmente com a URL acima.</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Fluxo atual</h2>
        <div className="steps-grid">
          <div className="setup-step">
            <span>1</span>
            <strong>Lead entra</strong>
            <p>A landing page envia o formulário para /api/leads e cria contato + oportunidade.</p>
          </div>
          <div className="setup-step">
            <span>2</span>
            <strong>Atendimento pelo Inbox</strong>
            <p>O CRM envia mensagens pelo endpoint da Evolution API hospedado na Oracle.</p>
          </div>
          <div className="setup-step">
            <span>3</span>
            <strong>Webhook recebe respostas</strong>
            <p>Mensagens recebidas no WhatsApp entram no Supabase e aparecem no Inbox.</p>
          </div>
          <div className="setup-step">
            <span>4</span>
            <strong>Funil comercial</strong>
            <p>Novas conversas criam oportunidade automática no estágio Novo lead.</p>
          </div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 18 }}>
        <article className="card">
          <h2>Teste de envio pelo WhatsApp</h2>
          <p className="description">Com a instância <strong>nextlead</strong> conectada, envie uma mensagem real por aqui usando DDI + DDD + número.</p>
          <WhatsAppTestPanel defaultMessage="Olá! Aqui é a NextLead. Recebemos seu contato e vamos te ajudar com sua landing page." />
        </article>

        <article className="card">
          <h2>Rotas úteis</h2>
          <p className="description">Use estas rotas para diagnóstico rápido depois de cada deploy.</p>
          <pre className="code">{`${appUrl}/api/debug/whatsapp
${appUrl}/api/whatsapp/evolution/status
${appUrl}/api/whatsapp/webhook`}</pre>
          <p className="description" style={{ marginTop: 14 }}>O webhook precisa estar apontado na Evolution API para as respostas aparecerem no Inbox.</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Contrato para landing pages</h2>
        <p className="description">Qualquer landing page pode mandar lead direto para este endpoint:</p>
        <pre className="code">{`POST ${appUrl}/api/leads
{
  "name": "Nome do lead",
  "phone": "51999999999",
  "company": "Academia Exemplo",
  "source": "Landing Page Academia",
  "interest": "Orçamento de Landing Page",
  "value": 1200,
  "temperature": "quente",
  "owner": "Anthony",
  "expectedCloseDate": "2026-07-05",
  "tags": "site, orçamento",
  "notes": "Mensagem do formulário"
}`}</pre>
      </section>
    </>
  );
}

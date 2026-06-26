import { WhatsAppTestPanel } from "@/components/WhatsAppTestPanel";

function statusBadge(active: boolean, label: string) {
  return <span className={`status-dot ${active ? "ok" : "warn"}`}>{label}</span>;
}

export default function ConfigPage() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://nextlead-crm.vercel.app").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasLeadCors = Boolean(process.env.NEXTLEAD_ALLOWED_ORIGINS);
  const hasWhatsAppToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const hasPhoneId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasVerifyToken = Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  const whatsappReady = hasWhatsAppToken && hasPhoneId;
  const webhookReady = hasVerifyToken && Boolean(appUrl);

  return (
    <>
      <div className="topbar">
        <div>
          <p className="eyebrow">Setup</p>
          <h1>Configuração da integração.</h1>
          <p className="description">CRM protegido, landing pages conectadas e WhatsApp Cloud API pronto para ativar.</p>
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
          <strong>Cloud API</strong>
          {statusBadge(whatsappReady, whatsappReady ? "envio ativo" : "aguardando Meta")}
        </article>
      </section>

      <section className="grid cols-2" style={{ marginTop: 18 }}>
        <article className="card">
          <h2>Variáveis do projeto</h2>
          <p className="description">Estas são as variáveis usadas no CRM, Supabase, login, landing pages e WhatsApp.</p>
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

META_GRAPH_VERSION=v20.0
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=`}</pre>
        </article>

        <article className="card">
          <h2>Webhook da Meta</h2>
          <p className="description" style={{ marginBottom: 14 }}>Use estes dados no painel da Meta para validar o webhook.</p>
          <div className="setup-list">
            <div>
              <small className="muted">Callback URL</small>
              <pre className="code inline-code">{webhookUrl}</pre>
            </div>
            <div>
              <small className="muted">Verify token</small>
              <pre className="code inline-code">Mesmo valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN</pre>
            </div>
            <div>
              <small className="muted">Status</small>
              <div style={{ marginTop: 8 }}>{statusBadge(webhookReady, webhookReady ? "pronto para validar" : "configure o verify token")}</div>
            </div>
          </div>
        </article>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Próximo passo: ativar WhatsApp Cloud API</h2>
        <div className="steps-grid">
          <div className="setup-step">
            <span>1</span>
            <strong>Criar app na Meta</strong>
            <p>Entre no Meta for Developers, crie ou acesse o app e adicione o produto WhatsApp.</p>
          </div>
          <div className="setup-step">
            <span>2</span>
            <strong>Copiar credenciais</strong>
            <p>Copie access token, phone number ID e WABA ID para as variáveis da Vercel.</p>
          </div>
          <div className="setup-step">
            <span>3</span>
            <strong>Validar webhook</strong>
            <p>Use o Callback URL acima e o verify token que você definiu na Vercel.</p>
          </div>
          <div className="setup-step">
            <span>4</span>
            <strong>Assinar eventos</strong>
            <p>No webhook da Meta, assine o campo messages para receber mensagens e status.</p>
          </div>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 18 }}>
        <article className="card">
          <h2>Teste de envio pelo WhatsApp</h2>
          <p className="description">Depois de configurar as credenciais da Meta, envie uma mensagem de teste por aqui. Sem credenciais, ela fica salva no CRM em modo demo.</p>
          <WhatsAppTestPanel defaultMessage="Olá! Aqui é a NextLead. Recebemos seu contato e vamos te ajudar com sua landing page." />
        </article>

        <article className="card">
          <h2>Diagnóstico rápido</h2>
          <p className="description">Após o deploy, abra esta rota logado para conferir se a Vercel reconheceu as variáveis do WhatsApp.</p>
          <pre className="code">{`${appUrl}/api/debug/whatsapp`}</pre>
          <p className="description" style={{ marginTop: 14 }}>O envio real precisa de access token e phone number ID. O recebimento real precisa do webhook validado na Meta.</p>
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

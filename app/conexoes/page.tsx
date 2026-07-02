export const dynamic = "force-dynamic";
export const revalidate = 0;

import { EvolutionSetupPanel } from "@/components/EvolutionSetupPanel";
import { WhatsAppTestPanel } from "@/components/WhatsAppTestPanel";

export default function ConexoesPage() {
  return (
    <>
      <div className="topbar page-heading-v14">
        <div>
          <p className="eyebrow">WhatsApp & conexões</p>
          <h1>Conexões do atendimento.</h1>
          <p className="description">Configure a Evolution API, teste envios e verifique se as respostas estão chegando ao CRM.</p>
        </div>
      </div>
      <section className="standard-grid-v14 two">
        <article className="card standard-card-v14"><p className="eyebrow-small">Webhook</p><h2>Evolution API</h2><p className="muted">Atualize o webhook usado para receber mensagens, status e confirmações do WhatsApp.</p><EvolutionSetupPanel /></article>
        <article className="card standard-card-v14"><p className="eyebrow-small">Teste</p><h2>Envio pelo WhatsApp</h2><p className="muted">Envie uma mensagem real para validar a conexão ativa.</p><WhatsAppTestPanel defaultMessage="Olá! Aqui é a NextLead. Recebemos seu contato e vamos te ajudar com sua página." /></article>
      </section>
    </>
  );
}

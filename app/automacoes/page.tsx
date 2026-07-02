export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Bot, CheckCircle2, Clock, KeyRound, MessageCircle, PlayCircle, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { getAutomationsData } from "@/lib/automations";
import { shortDate } from "@/lib/format";

function modeLabel(mode: string) {
  if (mode === "auto") return "Automático";
  if (mode === "suggest") return "Sugestão";
  return "Desligado";
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    sdr_nextlead: "SDR",
    welcome: "Boas-vindas",
    followup: "Follow-up",
    post_proposal: "Pós-proposta",
  };
  return labels[type] || type;
}

export default async function AutomacoesPage() {
  const { automations, runs, tableReady, error } = await getAutomationsData();
  const active = automations.filter((automation) => automation.enabled && automation.mode !== "off");
  const sdr = automations.find((automation) => automation.type === "sdr_nextlead") || automations[0];
  const sdrMode = sdr?.mode || "suggest";
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const autoSendEnabled = process.env.NEXTLEAD_ENABLE_AUTO_SDR === "true";
  const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  return (
    <>
      <div className="topbar page-heading-v14 automation-heading-v15">
        <div>
          <p className="eyebrow">Automações</p>
          <h1>Agente SDR da NextLead.</h1>
          <p className="description">Configure o robô comercial de forma simples: ele qualifica o lead, sugere a próxima resposta e só envia automático quando você liberar.</p>
        </div>
        <div className="actions">
          <a className="btn secondary" href="/inbox">Testar no atendimento</a>
        </div>
      </div>

      {!tableReady && (
        <section className="card standard-card-v14 setup-needed-card-v15">
          <div>
            <strong>Falta ativar o banco de automações.</strong>
            <p className="muted">Rode a migration abaixo no Supabase para salvar configurações e histórico real do agente.</p>
          </div>
          <code>scripts/migration-v7-automations-sdr.sql</code>
          {error && <small>Detalhe técnico: {error}</small>}
        </section>
      )}

      <section className="standard-grid-v14 three automation-kpi-grid automation-summary-v15">
        <article className="card standard-card-v14 mini-kpi-card"><Workflow size={20} /><span>Automações ativas</span><strong>{active.length}</strong></article>
        <article className="card standard-card-v14 mini-kpi-card"><Bot size={20} /><span>Modo do SDR</span><strong>{modeLabel(sdrMode)}</strong></article>
        <article className="card standard-card-v14 mini-kpi-card"><Clock size={20} /><span>Execuções registradas</span><strong>{runs.length}</strong></article>
      </section>

      <section className="standard-grid-v14 two automation-main-grid automation-main-v15">
        <article className="card standard-card-v14 automation-sdr-card automation-sdr-v15">
          <div className="dash-section-head compact">
            <div>
              <p className="eyebrow-small">Agente principal</p>
              <h2>SDR NextLead</h2>
              <p className="muted">Para leads que chegam pela landing, Instagram ou WhatsApp. O agente descobre o negócio, entende a necessidade e prepara a entrega para você.</p>
            </div>
            <span className={`status-pill ${sdr?.enabled ? "success" : "neutral"}`}>{sdr?.enabled ? "ativo" : "desligado"}</span>
          </div>

          <form id="sdr-mode-form" className="automation-form automation-form-v15" action="/api/automations" method="post">
            <input type="hidden" name="automationId" value={sdr?.id || "sdr-nextlead-default"} />
            <input type="hidden" name="type" value="sdr_nextlead" />

            <div className="mode-choice-group-v15" role="radiogroup" aria-label="Modo de operação do SDR">
              <label className="mode-choice-v15">
                <input type="radio" name="mode" value="off" defaultChecked={sdrMode === "off"} />
                <span>
                  <strong>Desligado</strong>
                  <small>O agente não analisa nem sugere respostas.</small>
                </span>
              </label>
              <label className="mode-choice-v15 recommended">
                <input type="radio" name="mode" value="suggest" defaultChecked={sdrMode === "suggest"} />
                <span>
                  <strong>Sugerir resposta</strong>
                  <small>Melhor para teste: a IA escreve, você revisa e envia.</small>
                </span>
              </label>
              <label className="mode-choice-v15">
                <input type="radio" name="mode" value="auto" defaultChecked={sdrMode === "auto"} />
                <span>
                  <strong>Responder automático</strong>
                  <small>Usar só depois de validar. Também exige NEXTLEAD_ENABLE_AUTO_SDR=true.</small>
                </span>
              </label>
            </div>

            <label className="checkbox-row-v14 automation-enabled-v15">
              <input type="checkbox" name="enabled" defaultChecked={sdr?.enabled !== false} />
              <span>Automação ativa</span>
            </label>

            <div className="automation-safe-note">
              <ShieldCheck size={18} />
              <span>O SDR não promete preço, prazo fechado nem garantia de clientes. Ele faz perguntas, qualifica e entrega o lead quente para atendimento humano.</span>
            </div>

            <button className="btn automation-save-v15" type="submit">Salvar configuração do SDR</button>
          </form>

          <div className="automation-flow-preview automation-flow-v15">
            <div><span>1</span><strong>Recebe</strong><small>Nova mensagem ou lead</small></div>
            <div><span>2</span><strong>Pergunta</strong><small>Negócio, site e WhatsApp</small></div>
            <div><span>3</span><strong>Classifica</strong><small>Frio, morno ou quente</small></div>
            <div><span>4</span><strong>Entrega</strong><small>Lead quente para você</small></div>
          </div>
        </article>

        <aside className="automation-side-v15">
          <article className="card standard-card-v14 gemini-card-v15">
            <div className="dash-section-head compact">
              <div>
                <p className="eyebrow-small">Gemini</p>
                <h2>Conexão da IA</h2>
                <p className="muted">Sem chave, o CRM usa uma análise local simples. Com Gemini, as sugestões ficam mais naturais.</p>
              </div>
              <span className={`status-pill ${geminiConfigured ? "success" : "neutral"}`}>{geminiConfigured ? "conectado" : "local"}</span>
            </div>
            <div className="gemini-steps-v15">
              <div><KeyRound size={16} /><span>1. Gere uma API key no Google AI Studio.</span></div>
              <div><Sparkles size={16} /><span>2. Adicione na Vercel como <code>GEMINI_API_KEY</code>.</span></div>
              <div><CheckCircle2 size={16} /><span>3. Adicione <code>GEMINI_MODEL={geminiModel}</code> e faça redeploy.</span></div>
            </div>
            <div className="gemini-env-v15">
              <span>Envio automático</span>
              <strong>{autoSendEnabled ? "Liberado" : "Bloqueado por segurança"}</strong>
              <small>Para liberar no futuro: NEXTLEAD_ENABLE_AUTO_SDR=true</small>
            </div>
          </article>

          <article className="card standard-card-v14">
            <div className="dash-section-head compact"><div><p className="eyebrow-small">Modelos futuros</p><h2>Automações prontas</h2><p className="muted">Depois do SDR, estes fluxos podem ser ativados sem canvas complexo.</p></div></div>
            <div className="automation-template-list automation-template-list-v15">
              {automations.filter((automation) => automation.type !== "sdr_nextlead").map((automation) => (
                <div className="automation-template-item" key={automation.id}>
                  <span className="template-icon"><MessageCircle size={17} /></span>
                  <div>
                    <strong>{automation.name}</strong>
                    <small>{typeLabel(automation.type)} • {modeLabel(automation.mode)}</small>
                    <p>{automation.description}</p>
                  </div>
                  <span className={`status-pill ${automation.enabled ? "success" : "neutral"}`}>{automation.enabled ? "on" : "off"}</span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="card standard-card-v14 automation-history-v15">
        <div className="dash-section-head compact"><div><p className="eyebrow-small">Histórico</p><h2>Últimas execuções</h2><p className="muted">Toda ação do agente deve deixar rastro para auditoria e suporte.</p></div><PlayCircle size={20} /></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Status</th><th>Resumo</th><th>Contato</th></tr></thead>
            <tbody>
              {runs.length === 0 ? (
                <tr><td colSpan={4}>Nenhuma execução registrada ainda.</td></tr>
              ) : runs.map((run) => (
                <tr key={run.id}>
                  <td>{shortDate(run.createdAt)}</td>
                  <td><span className={`status-pill ${run.status === "success" ? "success" : run.status === "error" ? "danger" : "neutral"}`}>{run.status}</span></td>
                  <td>{run.summary || run.error || "Execução registrada"}</td>
                  <td>{run.contactId || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

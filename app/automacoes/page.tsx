export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Bot, Clock, MessageCircle, PlayCircle, ShieldCheck, Workflow } from "lucide-react";
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

  return (
    <>
      <div className="topbar page-heading-v14">
        <div>
          <p className="eyebrow">Automações</p>
          <h1>Regras inteligentes do CRM.</h1>
          <p className="description">Configure fluxos simples para atendimento, follow-up e qualificação com IA sem virar um n8n complexo para o cliente.</p>
        </div>
        <div className="actions">
          <button className="btn" type="button" form="sdr-mode-form">Salvar SDR</button>
          <a className="btn secondary" href="/inbox">Testar no atendimento</a>
        </div>
      </div>

      {!tableReady && (
        <section className="card standard-card-v14 warning-card-v14">
          <strong>Banco ainda sem tabelas de automação.</strong>
          <p className="muted">Rode <code>scripts/migration-v7-automations-sdr.sql</code> no Supabase para ativar salvamento, histórico e automações reais. Enquanto isso, a tela mostra os modelos padrão.</p>
          {error && <p className="muted">Detalhe: {error}</p>}
        </section>
      )}

      <section className="standard-grid-v14 three automation-kpi-grid">
        <article className="card standard-card-v14 mini-kpi-card"><Workflow size={20} /><span>Ativas</span><strong>{active.length}</strong></article>
        <article className="card standard-card-v14 mini-kpi-card"><Bot size={20} /><span>Modo SDR</span><strong>{modeLabel(sdr?.mode || "suggest")}</strong></article>
        <article className="card standard-card-v14 mini-kpi-card"><Clock size={20} /><span>Execuções</span><strong>{runs.length}</strong></article>
      </section>

      <section className="standard-grid-v14 two automation-main-grid">
        <article className="card standard-card-v14 automation-sdr-card">
          <div className="dash-section-head compact">
            <div>
              <p className="eyebrow-small">Agente principal</p>
              <h2>SDR NextLead</h2>
              <p className="muted">Recebe a pessoa, identifica o negócio, pergunta sobre site/landing e qualifica interesse em captar clientes pelo WhatsApp.</p>
            </div>
            <span className={`status-pill ${sdr?.enabled ? "success" : "neutral"}`}>{sdr?.enabled ? "ativo" : "desligado"}</span>
          </div>

          <form id="sdr-mode-form" className="automation-form" action="/api/automations" method="post">
            <input type="hidden" name="automationId" value={sdr?.id || "sdr-nextlead-default"} />
            <input type="hidden" name="type" value="sdr_nextlead" />
            <label className="form-row">Modo de operação
              <select className="input input-compact" name="mode" defaultValue={sdr?.mode || "suggest"}>
                <option value="off">Desligado</option>
                <option value="suggest">Sugerir resposta</option>
                <option value="auto">Automático SDR</option>
              </select>
            </label>
            <label className="form-row checkbox-row-v14">
              <input type="checkbox" name="enabled" defaultChecked={sdr?.enabled !== false} />
              <span>Automação ativa</span>
            </label>
            <div className="automation-safe-note">
              <ShieldCheck size={18} />
              <span>Por segurança, o modo automático só deve ser usado depois de testes. O agente não promete preço, prazo fechado nem garantia de clientes.</span>
            </div>
          </form>

          <div className="automation-flow-preview">
            <div><span>1</span><strong>Recebe</strong><small>Nova mensagem/lead</small></div>
            <div><span>2</span><strong>Qualifica</strong><small>Negócio, site e WhatsApp</small></div>
            <div><span>3</span><strong>Classifica</strong><small>Frio, morno ou quente</small></div>
            <div><span>4</span><strong>Entrega</strong><small>Lead quente para humano</small></div>
          </div>
        </article>

        <article className="card standard-card-v14">
          <div className="dash-section-head compact"><div><p className="eyebrow-small">Modelos prontos</p><h2>Mini n8n do CRM</h2><p className="muted">Automações guiadas, sem canvas complexo.</p></div></div>
          <div className="automation-template-list">
            {automations.map((automation) => (
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
      </section>

      <section className="card standard-card-v14">
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

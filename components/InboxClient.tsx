"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Contact, Deal, LeadTemperature, Message, Stage } from "@/lib/types";
import { money, shortDate } from "@/lib/format";

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tomorrowBusinessTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return formatDateTimeLocal(date);
}

function messageStatusLabel(status: string) {
  const map: Record<string, string> = {
    queued: "enviando",
    sent: "enviado",
    received: "recebido",
    delivered: "entregue",
    read: "lido",
    failed: "falhou",
  };
  return map[status] || status;
}

function firstName(name?: string) {
  const clean = String(name || "").trim();
  return clean ? clean.split(" ")[0] : "tudo bem";
}

export function InboxClient({
  contacts: initialContacts,
  messages: initialMessages,
  deals: initialDeals,
  stages,
  activities: initialActivities,
  initialSelectedId,
}: {
  contacts: Contact[];
  messages: Message[];
  deals: Deal[];
  stages: Stage[];
  activities: Activity[];
  initialSelectedId?: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [selectedId, setSelectedId] = useState(initialContacts.find((contact) => contact.id === initialSelectedId)?.id || initialContacts[0]?.id);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [draft, setDraft] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"acoes" | "proposta" | "assistente" | "historico">("acoes");
  const [showInspector, setShowInspector] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [updatingLead, setUpdatingLead] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingDeal, setEditingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [followUpAt, setFollowUpAt] = useState(tomorrowBusinessTime);
  const [dealForm, setDealForm] = useState({ title: "", value: "", expectedClose: "" });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const selected = contacts.find((contact) => contact.id === selectedId) || contacts[0];
  const selectedDeal = useMemo(() => deals.find((deal) => deal.contactId === selected?.id), [deals, selected?.id]);
  const selectedStage = useMemo(() => stages.find((stage) => stage.id === selectedDeal?.stageId), [stages, selectedDeal?.stageId]);
  const selectedDealStatus = selectedDeal?.status === "perdido" ? "perdido" : selectedDeal?.stageId || "";
  const targetStages = useMemo(() => {
    const wanted = ["Contato feito", "Diagnóstico", "Proposta enviada", "Negociação", "Fechado"];
    return wanted
      .map((title) => stages.find((stage) => stage.title.toLowerCase() === title.toLowerCase()))
      .filter(Boolean) as Stage[];
  }, [stages]);
  const threadMessages = useMemo(() => {
    return messages
      .filter((message) => message.contactId === selected?.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, selected?.id]);
  const contactActivities = useMemo(() => activities.filter((activity) => activity.contactId === selected?.id), [activities, selected?.id]);

  const quickReplies = useMemo(() => {
    const name = firstName(selected?.name);
    return [
      {
        label: "Abordagem",
        text: `Olá ${name}, tudo bem? Aqui é da NextLead. Vi seu interesse e posso te ajudar a entender o melhor caminho para sua página captar mais orçamentos.`,
      },
      {
        label: "Perguntas",
        text: `Perfeito, ${name}. Para eu te orientar melhor: qual serviço principal você quer divulgar, em qual cidade atende e hoje seus clientes chegam mais por indicação, Instagram ou Google?`,
      },
      {
        label: "Follow-up",
        text: `Oi ${name}, passando para saber se você conseguiu olhar a ideia. Posso te mandar uma sugestão objetiva de como ficaria a página para o seu negócio.`,
      },
    ];
  }, [selected?.name]);

  const commercialHistory = useMemo(() => {
    const items: Array<{ id: string; date: string; title: string; detail: string; tone?: string }> = [];

    if (selectedDeal) {
      items.push({
        id: `deal-${selectedDeal.id}`,
        date: selectedDeal.createdAt,
        title: selectedDeal.status === "perdido" ? "Oportunidade perdida" : selectedDeal.status === "ganho" ? "Oportunidade ganha" : `Etapa: ${selectedStage?.title || "Funil"}`,
        detail: `${selectedDeal.title} • ${money(selectedDeal.value)}`,
        tone: selectedDeal.status === "perdido" ? "danger" : selectedDeal.status === "ganho" ? "success" : "info",
      });
    }

    threadMessages.slice(-6).forEach((message) => {
      items.push({
        id: `message-${message.id}`,
        date: message.createdAt,
        title: message.direction === "outbound" ? "Mensagem enviada" : "Mensagem recebida",
        detail: message.body,
        tone: message.direction === "outbound" ? "info" : "neutral",
      });
    });

    contactActivities.slice(-6).forEach((activity) => {
      items.push({
        id: `activity-${activity.id}`,
        date: activity.dueAt,
        title: activity.done ? "Tarefa concluída" : "Tarefa pendente",
        detail: activity.title,
        tone: activity.done ? "success" : "warning",
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [contactActivities, selectedDeal, selectedStage?.title, threadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedId, threadMessages.length]);

  useEffect(() => {
    setEditingDeal(false);
    setAssistantNote(null);
    setActionMessage(null);
    setFollowUpAt(tomorrowBusinessTime());
    setActivePanel("acoes");
    setShowInspector(false);
  }, [selected?.id]);

  function openInspector(panel: "acoes" | "proposta" | "assistente" | "historico") {
    setActivePanel(panel);
    setShowInspector(true);
  }

  async function moveSelectedDeal(stage: Stage) {
    if (!selected || !selectedDeal) {
      setActionMessage("Este contato ainda não tem oportunidade vinculada.");
      return;
    }

    const isClosed = stage.title.toLowerCase().includes("fechado");
    setMoving(stage.id);
    setActionMessage(null);

    try {
      const response = await fetch("/api/pipeline/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: selectedDeal.id,
          stageId: stage.id,
          status: isClosed ? "ganho" : "aberto",
          lostReason: null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao mover oportunidade.");

      setDeals((current) =>
        current.map((deal) =>
          deal.id === selectedDeal.id
            ? { ...deal, stageId: stage.id, status: isClosed ? "ganho" : "aberto", lostReason: undefined }
            : deal,
        ),
      );
      setActionMessage(`Oportunidade movida para ${stage.title}.`);
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao mover oportunidade.");
    } finally {
      setMoving(null);
    }
  }

  async function markSelectedDealLost() {
    if (!selectedDeal) {
      setActionMessage("Este contato ainda não tem oportunidade vinculada.");
      return;
    }

    const lostReason = window.prompt("Motivo da perda?", selectedDeal.lostReason || "Sem retorno do cliente");
    if (lostReason === null) return;

    setMoving("perdido");
    setActionMessage(null);

    try {
      const response = await fetch("/api/pipeline/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: selectedDeal.id,
          status: "perdido",
          lostReason,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao marcar como perdido.");

      setDeals((current) => current.map((deal) => (deal.id === selectedDeal.id ? { ...deal, status: "perdido", lostReason } : deal)));
      setActionMessage("Oportunidade marcada como perdida.");
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao marcar como perdido.");
    } finally {
      setMoving(null);
    }
  }

  function handleStageChange(value: string) {
    if (!value) return;
    if (value === "perdido") {
      markSelectedDealLost();
      return;
    }

    const stage = targetStages.find((item) => item.id === value);
    if (stage) moveSelectedDeal(stage);
  }

  async function updateTemperature(temperature: LeadTemperature) {
    if (!selected) return;
    setUpdatingLead(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/contacts/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao atualizar lead.");

      setContacts((current) => current.map((contact) => (contact.id === selected.id ? { ...contact, temperature } : contact)));
      setActionMessage(`Lead marcado como ${temperature}.`);
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao atualizar lead.");
    } finally {
      setUpdatingLead(false);
    }
  }

  async function scheduleFollowUp(dueAtInput?: string) {
    if (!selected || schedulingFollowUp) return;

    const dueAt = dueAtInput ? new Date(dueAtInput).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (Number.isNaN(new Date(dueAt).getTime())) {
      setActionMessage("Data de follow-up inválida.");
      return;
    }

    setSchedulingFollowUp(true);
    setActionMessage(null);

    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selected.id,
          title: "Fazer follow-up",
          dueAt,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao agendar follow-up.");

      if (result.activity) {
        setActivities((current) => [
          ...current,
          {
            id: result.activity.id,
            contactId: result.activity.contact_id || selected.id,
            title: result.activity.title || "Fazer follow-up",
            dueAt: result.activity.due_at || dueAt,
            done: Boolean(result.activity.done),
          },
        ]);
      }

      setActionMessage(
        result.duplicate
          ? "Já existe um follow-up pendente para este lead neste dia."
          : `Follow-up agendado para ${new Date(dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
      );
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao agendar follow-up.");
    } finally {
      setSchedulingFollowUp(false);
    }
  }

  function openDealEditor() {
    if (!selectedDeal) return;
    setDealForm({
      title: selectedDeal.title || "",
      value: String(selectedDeal.value || 0),
      expectedClose: selectedDeal.expectedClose || "",
    });
    setEditingDeal(true);
    setActionMessage(null);
  }

  async function saveDeal() {
    if (!selectedDeal) return;
    setSavingDeal(true);
    setActionMessage(null);

    try {
      const response = await fetch("/api/pipeline/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: selectedDeal.id,
          title: dealForm.title,
          value: dealForm.value,
          expectedClose: dealForm.expectedClose || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao salvar oportunidade.");

      setDeals((current) =>
        current.map((deal) =>
          deal.id === selectedDeal.id
            ? {
                ...deal,
                title: dealForm.title || deal.title,
                value: Number(String(dealForm.value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0,
                expectedClose: dealForm.expectedClose || undefined,
              }
            : deal,
        ),
      );
      setEditingDeal(false);
      setActionMessage("Oportunidade atualizada.");
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao salvar oportunidade.");
    } finally {
      setSavingDeal(false);
    }
  }

  function generateProposalDraft() {
    if (!selected) return;
    const name = firstName(selected.name);
    const dealTitle = selectedDeal?.title || "solução digital";
    const valueText = selectedDeal?.value ? money(selectedDeal.value) : "valor a definir";
    const deadlineText = selectedDeal?.expectedClose ? `com previsão para ${new Date(selectedDeal.expectedClose).toLocaleDateString("pt-BR")}` : "com prazo alinhado após confirmação";

    const text = `Perfeito, ${name}. Com base no que conversamos, minha sugestão é avançarmos com ${dealTitle}.\n\nA ideia é entregar uma estrutura profissional para captar contatos pelo WhatsApp, organizar os leads no CRM e acompanhar cada oportunidade pelo funil comercial.\n\nInvestimento estimado: ${valueText}.\nEntrega: ${deadlineText}.\n\nSe fizer sentido para você, posso te mandar o próximo passo para começarmos.`;
    setDraft(text);
    setActionMessage("Proposta gerada no campo de mensagem. Revise antes de enviar.");
  }

  function summarizeConversation() {
    const inbound = threadMessages.filter((message) => message.direction === "inbound");
    const outbound = threadMessages.filter((message) => message.direction === "outbound");
    const lastInbound = inbound[inbound.length - 1]?.body;
    const status = selectedDeal?.status === "perdido" ? "perdida" : selectedDeal?.status === "ganho" ? "ganha" : selectedStage?.title || "sem etapa definida";

    setAssistantNote(
      `Resumo: ${selected?.name || "Lead"} está em ${status}. A conversa tem ${inbound.length} mensagem(ns) recebida(s) e ${outbound.length} enviada(s). ${lastInbound ? `Último retorno do cliente: “${lastInbound.slice(0, 150)}”.` : "Ainda não há retorno do cliente registrado."}`,
    );
  }

  function suggestNextReply() {
    const name = firstName(selected?.name);
    const lastInbound = threadMessages.filter((message) => message.direction === "inbound").at(-1)?.body || "";
    const text = lastInbound.includes("[áudio]")
      ? `Boa, ${name}. Recebi teu áudio. Vou analisar aqui e já te retorno com o melhor caminho para organizar isso em uma solução simples e prática.`
      : selectedDeal?.status === "perdido"
        ? `Oi ${name}, tudo bem? Passando só para deixar a porta aberta caso você queira retomar a ideia mais para frente. Posso te mandar uma opção mais simples para começarmos?`
        : `Perfeito, ${name}. Pelo que você comentou, faz sentido eu te mandar uma proposta objetiva com o que entraria, prazo e investimento. Posso seguir por esse caminho?`;
    setDraft(text);
    setAssistantNote("Sugestão colocada no campo de mensagem. Revise antes de enviar.");
  }

  async function deleteConversation(contactId: string) {
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact) return;

    const ok = window.confirm(`Excluir a conversa de ${contact.name}? Isso também remove as mensagens e a oportunidade vinculada.`);
    if (!ok) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao excluir conversa.");

      const remainingContacts = contacts.filter((item) => item.id !== contactId);
      setContacts(remainingContacts);
      setMessages((current) => current.filter((message) => message.contactId !== contactId));
      setDeals((current) => current.filter((deal) => deal.contactId !== contactId));
      setActivities((current) => current.filter((activity) => activity.contactId !== contactId));
      setSelectedId((current) => (current === contactId ? remainingContacts[0]?.id : current));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao excluir conversa.");
    } finally {
      setDeleting(false);
    }
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !selected) return;

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      contactId: selected.id,
      direction: "outbound",
      body,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setDraft("");

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selected.phone, contactId: selected.id, message: body }),
      });
      const result = await response.json();
      setMessages((current) =>
        current.map((message) =>
          message.id === optimistic.id
            ? { ...message, status: response.ok ? "sent" : "failed", providerMessageId: result.providerMessageId }
            : message,
        ),
      );
    } catch {
      setMessages((current) => current.map((message) => (message.id === optimistic.id ? { ...message, status: "failed" } : message)));
    }
  }

  if (contacts.length === 0) {
    return (
      <section className="card inbox empty-inbox">
        <div className="empty-state">
          <strong>Nenhuma conversa ainda.</strong>
          <p className="muted">Quando alguém chamar no WhatsApp, a conversa vai aparecer aqui automaticamente.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`card inbox inbox-fixed inbox-pro ${showInspector ? "inspector-open" : ""}`}>
      <aside className="thread-list thread-list-pro">
        <div className="thread-list-head">
          <div>
            <h2>Conversas</h2>
            <span className="muted">Atendimentos ativos</span>
          </div>
          <span className="thread-count">{contacts.length}</span>
        </div>

        <div className="thread-stack">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              className={`thread thread-pro ${contact.id === selected?.id ? "active" : ""}`}
              onClick={() => {
                setSelectedId(contact.id);
                setActionMessage(null);
              }}
            >
              <span className="avatar">{contact.name.slice(0, 1)}</span>
              <span className="thread-copy">
                <strong>{contact.name}</strong>
                <span className="muted">{contact.company || contact.source}</span>
              </span>
              <span className={`thread-temp ${contact.temperature}`}>{contact.temperature}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="chat chat-fixed chat-pro">
        <header className="chat-head-pro">
          <div className="contact-title-block">
            <span className="eyebrow-small">Contato em atendimento</span>
            <h2>{selected?.name}</h2>
            <span className="muted">{selected?.phone} • {selected?.company || "sem empresa"}</span>
          </div>
          <div className="chat-head-actions-pro">
            <div className="chat-context-pill">
              <span>{selectedStage?.title || (selectedDeal?.status === "perdido" ? "Perdido" : "Sem etapa")}</span>
              <strong>{selectedDeal ? money(selectedDeal.value) : "R$ 0,00"}</strong>
            </div>
            <button className="btn mini" onClick={() => openInspector("acoes")}>Ferramentas</button>
          </div>
        </header>

        <div className="messages messages-scroll messages-pro">
          {threadMessages.length === 0 && (
            <div className="message-empty">
              <p className="muted">Nenhuma mensagem ainda. Envie a primeira mensagem para testar o fluxo.</p>
            </div>
          )}
          {threadMessages.map((message) => (
            <div key={message.id} className={`message ${message.direction === "outbound" ? "outbound" : ""} ${message.status === "failed" ? "failed" : ""}`}>
              <span>{message.body}</span>
              <small>{shortDate(message.createdAt)} • {messageStatusLabel(message.status)}</small>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <footer className="composer composer-pro">
          <textarea
            className="input composer-input"
            placeholder="Digite uma mensagem..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button className="btn" onClick={sendMessage}>Enviar</button>
        </footer>
      </div>

      {showInspector && <button className="inspector-backdrop" aria-label="Fechar painel" onClick={() => setShowInspector(false)} />}

      <aside className="lead-inspector" aria-label="Painel do lead">
        <div className="inspector-drawer-head">
          <div>
            <span className="eyebrow-small">Painel do lead</span>
            <strong>{selected?.name}</strong>
          </div>
          <button className="btn mini secondary" onClick={() => setShowInspector(false)}>Fechar</button>
        </div>

        <div className="inspector-card lead-status-card">
          <div className="inspector-headline">
            <span className="eyebrow-small">Dados comerciais</span>
            <strong>{selectedDeal?.title || "Sem oportunidade"}</strong>
          </div>

          <div className="inspector-fields">
            <label className="action-field">
              <span>Temperatura</span>
              <select
                className="mini-select"
                value={selected?.temperature || "morno"}
                onChange={(event) => updateTemperature(event.target.value as LeadTemperature)}
                disabled={updatingLead || !selected}
              >
                <option value="frio">Frio</option>
                <option value="morno">Morno</option>
                <option value="quente">Quente</option>
              </select>
            </label>

            <label className="action-field">
              <span>Etapa</span>
              <select
                className={`mini-select ${selectedDeal?.status === "perdido" ? "danger-select" : ""}`}
                value={selectedDealStatus}
                onChange={(event) => handleStageChange(event.target.value)}
                disabled={!selectedDeal || Boolean(moving)}
              >
                <option value="" disabled>Sem oportunidade</option>
                {targetStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.title}</option>
                ))}
                <option value="perdido">Perdido</option>
              </select>
            </label>
          </div>

          <div className="inspector-actions">
            <button className="btn mini secondary" onClick={openDealEditor} disabled={!selectedDeal}>Editar oportunidade</button>
            <button className="btn mini secondary danger-soft" onClick={() => selected && deleteConversation(selected.id)} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir conversa"}
            </button>
          </div>

          {actionMessage && <span className="stage-feedback inspector-feedback">{actionMessage}</span>}
        </div>

        {editingDeal && selectedDeal && (
          <div className="inspector-card deal-edit-panel-pro">
            <div className="inspector-headline">
              <span className="eyebrow-small">Editar oportunidade</span>
              <strong>Ajustes rápidos</strong>
            </div>
            <label className="form-row">
              Título
              <input className="input" value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <div className="form-grid compact-grid">
              <label className="form-row">
                Valor
                <input className="input" value={dealForm.value} onChange={(event) => setDealForm((current) => ({ ...current, value: event.target.value }))} />
              </label>
              <label className="form-row">
                Previsão
                <input className="input" type="date" value={dealForm.expectedClose} onChange={(event) => setDealForm((current) => ({ ...current, expectedClose: event.target.value }))} />
              </label>
            </div>
            <div className="inspector-actions">
              <button className="btn mini" onClick={saveDeal} disabled={savingDeal}>{savingDeal ? "Salvando..." : "Salvar"}</button>
              <button className="btn mini secondary" onClick={() => setEditingDeal(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="inspector-tabs" role="tablist" aria-label="Ferramentas do atendimento">
          <button className={activePanel === "acoes" ? "active" : ""} onClick={() => setActivePanel("acoes")}>Ações</button>
          <button className={activePanel === "proposta" ? "active" : ""} onClick={() => setActivePanel("proposta")}>Proposta</button>
          <button className={activePanel === "assistente" ? "active" : ""} onClick={() => setActivePanel("assistente")}>IA</button>
          <button className={activePanel === "historico" ? "active" : ""} onClick={() => setActivePanel("historico")}>Histórico</button>
        </div>

        <div className="inspector-card inspector-content-card">
          {activePanel === "acoes" && (
            <div className="inspector-section">
              <div className="inspector-headline">
                <span className="eyebrow-small">Respostas rápidas</span>
                <strong>Próximo contato</strong>
              </div>
              <div className="quick-replies-grid">
                {quickReplies.map((reply) => (
                  <button key={reply.label} type="button" className="quick-reply" onClick={() => setDraft(reply.text)}>
                    {reply.label}
                  </button>
                ))}
              </div>

              <div className="followup-box">
                <span className="eyebrow-small">Follow-up</span>
                <input className="input input-compact" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
                <button className="btn mini secondary" onClick={() => scheduleFollowUp(followUpAt)} disabled={!selected || schedulingFollowUp}>
                  {schedulingFollowUp ? "Agendando..." : "Agendar follow-up"}
                </button>
              </div>
            </div>
          )}

          {activePanel === "proposta" && (
            <div className="inspector-section">
              <div className="inspector-headline">
                <span className="eyebrow-small">Proposta</span>
                <strong>Gerar rascunho</strong>
              </div>
              <p className="muted tool-hint">Cria um texto no campo de mensagem usando oportunidade, valor e prazo. Você revisa antes de enviar.</p>
              <button className="btn mini" onClick={generateProposalDraft} disabled={!selected}>Gerar texto de proposta</button>
              <div className="proposal-summary">
                <span>Serviço</span>
                <strong>{selectedDeal?.title || "Solução digital"}</strong>
                <span>Valor</span>
                <strong>{selectedDeal ? money(selectedDeal.value) : "A definir"}</strong>
              </div>
            </div>
          )}

          {activePanel === "assistente" && (
            <div className="inspector-section">
              <div className="inspector-headline">
                <span className="eyebrow-small">Assistente IA</span>
                <strong>Ajuda de atendimento</strong>
              </div>
              <div className="quick-replies-grid">
                <button className="quick-reply" onClick={summarizeConversation}>Resumo</button>
                <button className="quick-reply" onClick={suggestNextReply}>Sugerir resposta</button>
              </div>
              {assistantNote ? <p className="assistant-note">{assistantNote}</p> : <p className="muted tool-hint">Use para resumir a conversa ou montar uma resposta inicial. Ainda é local, sem API externa.</p>}
            </div>
          )}

          {activePanel === "historico" && (
            <div className="inspector-section">
              <div className="inspector-headline">
                <span className="eyebrow-small">Histórico</span>
                <strong>Linha do tempo</strong>
              </div>
              <div className="timeline-list timeline-list-pro">
                {commercialHistory.length === 0 ? (
                  <p className="muted tool-hint">Nenhum histórico ainda.</p>
                ) : (
                  commercialHistory.map((item) => (
                    <div key={item.id} className={`timeline-item ${item.tone || "neutral"}`}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <small>{shortDate(item.date)}</small>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}

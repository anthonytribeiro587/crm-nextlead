"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, LeadTemperature, Message, Stage } from "@/lib/types";
import { shortDate } from "@/lib/format";

export function InboxClient({
  contacts: initialContacts,
  messages: initialMessages,
  deals: initialDeals,
  stages,
  initialSelectedId,
}: {
  contacts: Contact[];
  messages: Message[];
  deals: Deal[];
  stages: Stage[];
  initialSelectedId?: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [selectedId, setSelectedId] = useState(initialContacts.find((contact) => contact.id === initialSelectedId)?.id || initialContacts[0]?.id);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [draft, setDraft] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [updatingLead, setUpdatingLead] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const selected = contacts.find((contact) => contact.id === selectedId) || contacts[0];
  const selectedDeal = useMemo(() => deals.find((deal) => deal.contactId === selected?.id), [deals, selected?.id]);
  const selectedDealStatus = selectedDeal?.status === "perdido" ? "perdido" : selectedDeal?.stageId || "";
  const targetStages = useMemo(() => {
    const wanted = ["Contato feito", "Diagnóstico", "Proposta enviada", "Negociação", "Fechado"];
    return wanted
      .map((title) => stages.find((stage) => stage.title.toLowerCase() === title.toLowerCase()))
      .filter(Boolean) as Stage[];
  }, [stages]);
  const threadMessages = useMemo(() => messages.filter((message) => message.contactId === selected?.id), [messages, selected?.id]);

  const quickReplies = useMemo(() => {
    const name = selected?.name?.split(" ")[0] || "tudo bem";
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

    const lostReason = window.prompt("Motivo da perda?", "Sem retorno do cliente");
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

  async function scheduleFollowUp(hours = 24) {
    if (!selected || schedulingFollowUp) return;

    const dueAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
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

      setActionMessage(
        result.duplicate
          ? "Já existe um follow-up pendente para este lead."
          : `Follow-up agendado para ${new Date(dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
      );
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao agendar follow-up.");
    } finally {
      setSchedulingFollowUp(false);
    }
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
    <section className="card inbox">
      <aside className="thread-list">
        <div className="thread-list-head">
          <h2>Conversas</h2>
          <span className="thread-count">{contacts.length}</span>
        </div>

        {contacts.map((contact) => (
          <button key={contact.id} className={`thread ${contact.id === selected?.id ? "active" : ""}`} onClick={() => { setSelectedId(contact.id); setActionMessage(null); }}>
            <span className="avatar">{contact.name.slice(0, 1)}</span>
            <span className="thread-copy">
              <strong>{contact.name}</strong>
              <span className="muted">{contact.company || contact.source}</span>
            </span>
          </button>
        ))}
      </aside>

      <div className="chat">
        <header className="chat-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>{selected?.name}</h2>
            <span className="muted">{selected?.phone} • {selected?.company || "sem empresa"}</span>
          </div>
          <div className="chat-head-actions">
            <div className="lead-action-controls">
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

              <label className="action-field action-field-wide">
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

              <button className="btn mini secondary" onClick={() => scheduleFollowUp(24)} disabled={!selected || schedulingFollowUp}>
                {schedulingFollowUp ? "Agendando..." : "Follow-up amanhã"}
              </button>
              <button className="btn mini secondary" onClick={() => selected && deleteConversation(selected.id)} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir conversa"}
              </button>
            </div>
            {actionMessage && <span className="stage-feedback">{actionMessage}</span>}
          </div>
        </header>

        <div className="quick-replies" aria-label="Respostas rápidas">
          <span className="muted">Respostas rápidas:</span>
          {quickReplies.map((reply) => (
            <button key={reply.label} type="button" className="quick-reply" onClick={() => setDraft(reply.text)}>
              {reply.label}
            </button>
          ))}
        </div>

        <div className="messages">
          {threadMessages.length === 0 && (
            <div className="message-empty">
              <p className="muted">Nenhuma mensagem ainda. Envie a primeira mensagem para testar o fluxo.</p>
            </div>
          )}
          {threadMessages.map((message) => (
            <div key={message.id} className={`message ${message.direction === "outbound" ? "outbound" : ""}`}>
              {message.body}
              <br />
              <small style={{ opacity: 0.72 }}>{shortDate(message.createdAt)} • {message.status}</small>
            </div>
          ))}
        </div>

        <footer className="composer">
          <input
            className="input"
            placeholder="Digite uma mensagem..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") sendMessage();
            }}
          />
          <button className="btn" onClick={sendMessage}>Enviar</button>
        </footer>
      </div>
    </section>
  );
}

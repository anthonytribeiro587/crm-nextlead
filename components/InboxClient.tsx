"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Message } from "@/lib/types";
import { shortDate } from "@/lib/format";

export function InboxClient({ contacts: initialContacts, messages: initialMessages }: { contacts: Contact[]; messages: Message[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [selectedId, setSelectedId] = useState(initialContacts[0]?.id);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const selected = contacts.find((contact) => contact.id === selectedId) || contacts[0];
  const threadMessages = useMemo(() => messages.filter((message) => message.contactId === selected?.id), [messages, selected?.id]);

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
          <button key={contact.id} className={`thread ${contact.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(contact.id)}>
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
            <span className="badge">{selected?.temperature}</span>
            <button className="btn mini secondary" onClick={() => selected && deleteConversation(selected.id)} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir conversa"}
            </button>
          </div>
        </header>

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

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, DealStatus, Stage } from "@/lib/types";
import { money } from "@/lib/format";

type EditingState = {
  deal: Deal;
  title: string;
  value: string;
  expectedClose: string;
  stageId: string;
  status: DealStatus;
  lostReason: string;
};

export function KanbanBoard({ contacts: initialContacts, deals: initialDeals, stages }: { contacts: Contact[]; deals: Deal[]; stages: Stage[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const closedStageId = useMemo(() => stages.find((stage) => stage.title.toLowerCase().includes("fechado"))?.id || stages[stages.length - 1]?.id || "", [stages]);

  async function patchDeal(dealId: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/pipeline/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, ...payload }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Erro ao atualizar oportunidade.");
    return result;
  }

  function moveDeal(dealId: string, stageId: string) {
    setDeals((current) => current.map((deal) => (deal.id === dealId ? { ...deal, stageId } : deal)));
    patchDeal(dealId, { stageId })
      .then(() => setMessage("Etapa atualizada."))
      .catch(() => setMessage("Não consegui salvar a mudança de etapa."));
  }

  function openEditor(deal: Deal) {
    setMessage(null);
    setEditing({
      deal,
      title: deal.title,
      value: String(deal.value || 0),
      expectedClose: deal.expectedClose || "",
      stageId: deal.stageId,
      status: deal.status,
      lostReason: deal.lostReason || "",
    });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setMessage("Salvando oportunidade...");

    try {
      await patchDeal(editing.deal.id, {
        title: editing.title,
        value: editing.value,
        expectedClose: editing.expectedClose,
        stageId: editing.stageId,
        status: editing.status,
        lostReason: editing.lostReason,
      });

      setDeals((current) =>
        current.map((deal) =>
          deal.id === editing.deal.id
            ? {
                ...deal,
                title: editing.title,
                value: Number(editing.value || 0),
                expectedClose: editing.expectedClose || undefined,
                stageId: editing.stageId,
                status: editing.status,
                lostReason: editing.lostReason || undefined,
              }
            : deal,
        ),
      );
      setEditing(null);
      setMessage("Oportunidade atualizada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(contactId: string) {
    const contact = contactsById.get(contactId);
    const ok = window.confirm(`Excluir o lead ${contact?.name || "selecionado"}? Isso remove também a oportunidade do funil.`);
    if (!ok) return;

    setMessage("Excluindo lead...");
    try {
      const response = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao excluir lead.");

      setDeals((current) => current.filter((deal) => deal.contactId !== contactId));
      setContacts((current) => current.filter((item) => item.id !== contactId));
      setEditing(null);
      setMessage("Lead excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir lead.");
    }
  }

  return (
    <>
      {message && <div className="inline-alert">{message}</div>}
      <div className="pipeline" aria-label="Funil de vendas">
        {stages.map((stage) => {
          const stageDeals = deals.filter((deal) => deal.stageId === stage.id && deal.status !== "perdido");
          const total = stageDeals.reduce((sum, deal) => sum + deal.value, 0);

          return (
            <section
              key={stage.id}
              className={`stage ${draggingId ? "stage-drop-ready" : ""}`}
              style={{ "--stage-color": stage.color } as React.CSSProperties}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingId) moveDeal(draggingId, stage.id);
                setDraggingId(null);
              }}
            >
              <div className="stage-head">
                <span className="stage-title">
                  <span className="dot" style={{ background: stage.color }} />
                  {stage.title}
                </span>
                <span className="badge">{stageDeals.length}</span>
              </div>
              <div className="muted" style={{ margin: "0 4px 14px" }}>{money(total)}</div>

              {stageDeals.map((deal) => {
                const contact = contactsById.get(deal.contactId);
                return (
                  <article
                    key={deal.id}
                    className="deal-card"
                    draggable
                    onDragStart={() => setDraggingId(deal.id)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <div>
                      <strong>{deal.title}</strong>
                      <p className="muted" style={{ margin: "6px 0 0" }}>{contact?.name || "Lead"} • {contact?.company || "sem empresa"}</p>
                      <div className="deal-tags">
                        <span className={`badge ${contact?.temperature === "quente" ? "hot" : contact?.temperature === "frio" ? "cold" : "warm"}`}>
                          {contact?.temperature || "morno"}
                        </span>
                        <span className="badge">{contact?.owner || "NextLead"}</span>
                      </div>
                    </div>
                    <div className="deal-meta">
                      <span>{money(deal.value)}</span>
                      <span>{deal.expectedClose ? `Prev. ${deal.expectedClose.split("-").reverse().join("/")}` : "sem previsão"}</span>
                    </div>
                    <div className="deal-actions">
                      <button type="button" className="btn mini secondary" onClick={() => openEditor(deal)}>Editar</button>
                      <button
                        type="button"
                        className="btn mini secondary"
                        onClick={() => {
                          setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, status: "ganho", stageId: closedStageId } : item));
                          patchDeal(deal.id, { status: "ganho", stageId: closedStageId }).catch(() => setMessage("Não consegui marcar como fechado."));
                        }}
                      >
                        Fechar
                      </button>
                      <button type="button" className="btn mini danger" onClick={() => contact && deleteContact(contact.id)}>Excluir</button>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editar oportunidade">
          <form className="modal-card" onSubmit={saveEdit}>
            <div className="topbar" style={{ marginBottom: 14 }}>
              <div>
                <p className="eyebrow">Editar oportunidade</p>
                <h2>{contactsById.get(editing.deal.contactId)?.name || "Lead"}</h2>
              </div>
              <button type="button" className="btn mini secondary" onClick={() => setEditing(null)}>Fechar</button>
            </div>

            <label className="form-row">
              Título
              <input className="input" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
            </label>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="form-row">
                Valor
                <input className="input" type="number" min="0" step="50" value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} />
              </label>
              <label className="form-row">
                Previsão
                <input className="input" type="date" value={editing.expectedClose} onChange={(event) => setEditing({ ...editing, expectedClose: event.target.value })} />
              </label>
              <label className="form-row">
                Etapa do funil
                <select className="select" value={editing.stageId} onChange={(event) => setEditing({ ...editing, stageId: event.target.value })}>
                  {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
                </select>
              </label>
              <label className="form-row">
                Status
                <select className="select" value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as DealStatus })}>
                  <option value="aberto">Aberto</option>
                  <option value="ganho">Ganho</option>
                  <option value="perdido">Perdido</option>
                </select>
              </label>
              <label className="form-row">
                Motivo de perda
                <input className="input" value={editing.lostReason} onChange={(event) => setEditing({ ...editing, lostReason: event.target.value })} placeholder="Só se marcar como perdido" />
              </label>
            </div>

            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alteração"}</button>
              <button className="btn secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn danger" type="button" onClick={() => deleteContact(editing.deal.contactId)}>Excluir lead</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, DealStatus, LeadTemperature, Stage } from "@/lib/types";
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

const temperatureOptions: Array<{ value: "todos" | LeadTemperature; label: string }> = [
  { value: "todos", label: "Todas" },
  { value: "quente", label: "Quentes" },
  { value: "morno", label: "Mornos" },
  { value: "frio", label: "Frios" },
];

function tempClass(value?: LeadTemperature) {
  if (value === "quente") return "hot";
  if (value === "frio") return "cold";
  return "warm";
}

function daysSince(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export function KanbanBoard({ contacts: initialContacts, deals: initialDeals, stages }: { contacts: Contact[]; deals: Deal[]; stages: Stage[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const [temperatureFilter, setTemperatureFilter] = useState<"todos" | LeadTemperature>("todos");
  const [ageFilter, setAgeFilter] = useState("todos");
  const [showLost, setShowLost] = useState(false);
  const router = useRouter();

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const closedStageId = useMemo(() => stages.find((stage) => stage.title.toLowerCase().includes("fechado"))?.id || stages[stages.length - 1]?.id || "", [stages]);
  const firstStageId = stages[0]?.id || "";
  const owners = useMemo(() => {
    const preferred = ["Anthony", "Felipe"];
    const current = contacts
      .map((contact) => contact.owner || "NextLead")
      .filter(Boolean);

    return Array.from(new Set([...preferred, ...current])).sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  }, [contacts]);

  const visibleDeals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return deals.filter((deal) => {
      const contact = contactsById.get(deal.contactId);
      if (!showLost && deal.status === "perdido") return false;
      if (ownerFilter !== "todos" && (contact?.owner || "NextLead") !== ownerFilter) return false;
      if (temperatureFilter !== "todos" && (contact?.temperature || "morno") !== temperatureFilter) return false;
      const waitingDays = daysSince(contact?.lastMessageAt) || 0;
      if (ageFilter === "7d" && waitingDays < 7) return false;
      if (ageFilter === "14d" && waitingDays < 14) return false;
      if (ageFilter === "sem-previsao" && deal.expectedClose) return false;
      if (!normalizedQuery) return true;

      const haystack = [deal.title, contact?.name, contact?.company, contact?.phone, contact?.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [ageFilter, contactsById, deals, ownerFilter, query, showLost, temperatureFilter]);

  const pipelineValue = visibleDeals.filter((deal) => deal.status === "aberto").reduce((sum, deal) => sum + deal.value, 0);
  const staleDeals = visibleDeals.filter((deal) => (daysSince(contactsById.get(deal.contactId)?.lastMessageAt) || 0) >= 7).length;
  const proposalDeals = visibleDeals.filter((deal) => stages.find((stage) => stage.id === deal.stageId)?.title.toLowerCase().includes("proposta")).length;
  const wonDeals = deals.filter((deal) => deal.status === "ganho").length;

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
    setDeals((current) =>
      current.map((deal) =>
        deal.id === dealId ? { ...deal, stageId, status: "aberto", lostReason: undefined } : deal,
      ),
    );
    patchDeal(dealId, { stageId, status: "aberto", lostReason: null })
      .then(() => {
        setMessage("Etapa atualizada.");
        router.refresh();
      })
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
        lostReason: editing.status === "perdido" ? editing.lostReason : null,
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
                lostReason: editing.status === "perdido" ? editing.lostReason || undefined : undefined,
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

  async function markAsWon(deal: Deal) {
    setDeals((current) => current.map((item) => (item.id === deal.id ? { ...item, status: "ganho", stageId: closedStageId } : item)));
    patchDeal(deal.id, { status: "ganho", stageId: closedStageId })
      .then(() => router.refresh())
      .catch(() => setMessage("Não consegui marcar como fechado."));
  }

  async function reopenDeal(deal: Deal) {
    const targetStageId = deal.stageId || firstStageId;
    setDeals((current) => current.map((item) => (item.id === deal.id ? { ...item, status: "aberto", stageId: targetStageId, lostReason: undefined } : item)));
    patchDeal(deal.id, { status: "aberto", stageId: targetStageId, lostReason: null })
      .then(() => {
        setMessage("Oportunidade reaberta.");
        router.refresh();
      })
      .catch(() => setMessage("Não consegui reabrir a oportunidade."));
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
      <div className="pipeline-command card">
        <div>
          <p className="eyebrow-small">Visão comercial</p>
          <h2>Funil organizado</h2>
          <p className="muted">Filtre, mova oportunidades e abra o atendimento sem sair do pipeline.</p>
        </div>
        <div className="pipeline-summary-inline" aria-label="Resumo do funil">
          <span><strong>{visibleDeals.length}</strong> oportunidades</span>
          <span><strong>{proposalDeals}</strong> propostas</span>
          <span><strong>{staleDeals}</strong> paradas +7d</span>
          <span><strong>{wonDeals}</strong> fechadas</span>
          <b>{money(pipelineValue)}</b>
        </div>
      </div>

      <div className="pipeline-toolbar card">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, empresa, telefone..." />
        <select className="select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="todos">Todos responsáveis</option>
          {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
        <select className="select" value={temperatureFilter} onChange={(event) => setTemperatureFilter(event.target.value as "todos" | LeadTemperature)}>
          {temperatureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className="select" value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)}>
          <option value="todos">Todos prazos</option>
          <option value="7d">Parados +7 dias</option>
          <option value="14d">Parados +14 dias</option>
          <option value="sem-previsao">Sem previsão</option>
        </select>
        <button type="button" className={`btn secondary ${showLost ? "active-filter" : ""}`} onClick={() => setShowLost((current) => !current)}>
          {showLost ? "Ocultar perdidos" : "Mostrar perdidos"}
        </button>
      </div>

      {message && <div className="inline-alert">{message}</div>}

      <div className="pipeline pipeline-pro" aria-label="Funil de vendas">
        {stages.map((stage) => {
          const stageDeals = visibleDeals.filter((deal) => deal.stageId === stage.id);
          const total = stageDeals.reduce((sum, deal) => sum + deal.value, 0);

          return (
            <section
              key={stage.id}
              className={`stage stage-pro ${draggingId ? "stage-drop-ready" : ""}`}
              style={{ "--stage-color": stage.color } as React.CSSProperties}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingId) moveDeal(draggingId, stage.id);
                setDraggingId(null);
              }}
            >
              <div className="stage-head stage-head-pro">
                <div>
                  <span className="stage-title">
                    <span className="dot" style={{ background: stage.color }} />
                    {stage.title}
                  </span>
                  <span className="stage-total">{money(total)}</span>
                </div>
                <span className="badge">{stageDeals.length}</span>
              </div>

              <div className="stage-card-list">
                {stageDeals.length === 0 && <div className="stage-empty">Sem oportunidades nesta etapa.</div>}
                {stageDeals.map((deal) => {
                  const contact = contactsById.get(deal.contactId);
                  return (
                    <article
                      key={deal.id}
                      className={`deal-card deal-card-pro ${deal.status === "perdido" ? "lost" : ""}`}
                      draggable
                      onDragStart={() => setDraggingId(deal.id)}
                      onDragEnd={() => setDraggingId(null)}
                    >
                      <div className="deal-card-topline">
                        <span className={`badge ${tempClass(contact?.temperature)}`}>{contact?.temperature || "morno"}</span>
                        {deal.status !== "aberto" && <span className={`badge status-${deal.status}`}>{deal.status}</span>}
                      </div>
                      <div>
                        <strong>{deal.title}</strong>
                        <p className="muted">{contact?.name || "Lead"} • {contact?.company || "sem empresa"}</p>
                      </div>
                      <div className="deal-meta">
                        <span>{money(deal.value)}</span>
                        <span>{deal.expectedClose ? `Prev. ${deal.expectedClose.split("-").reverse().join("/")}` : "sem previsão"}</span>
                      </div>
                      {(() => {
                        const idleDays = daysSince(contact?.lastMessageAt);
                        return idleDays !== null && idleDays >= 3 ? <span className="idle-chip">sem contato há {idleDays}d</span> : null;
                      })()}
                      <div className="deal-actions deal-actions-pro">
                        <Link className="btn mini secondary" href={`/inbox?contact=${deal.contactId}`}>Abrir</Link>
                        <button type="button" className="btn mini secondary" onClick={() => openEditor(deal)}>Editar</button>
                        {deal.status === "perdido" ? (
                          <button type="button" className="btn mini secondary" onClick={() => reopenDeal(deal)}>Reabrir</button>
                        ) : (
                          <button type="button" className="btn mini secondary" onClick={() => markAsWon(deal)}>Fechar</button>
                        )}
                        <button type="button" className="btn mini danger" onClick={() => contact && deleteContact(contact.id)}>Excluir</button>
                      </div>
                    </article>
                  );
                })}
              </div>
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

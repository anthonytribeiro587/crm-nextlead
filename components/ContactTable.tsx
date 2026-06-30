"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Contact, Deal, Message, ServiceOrder, Stage } from "@/lib/types";
import { money, shortDate } from "@/lib/format";

const temperatureClass = {
  frio: "cold",
  morno: "warm",
  quente: "hot",
};

const orderStatusLabel: Record<string, string> = {
  aberta: "Aberta",
  diagnostico: "Em diagnóstico",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovada: "Aprovada",
  execucao: "Em execução",
  aguardando_material: "Aguardando material",
  concluida: "Concluída",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export function ContactTable({
  contacts,
  deals,
  messages,
  activities,
  stages,
  serviceOrders,
  serviceOrdersReady = true,
}: {
  contacts: Contact[];
  deals: Deal[];
  messages: Message[];
  activities: Activity[];
  stages: Stage[];
  serviceOrders: ServiceOrder[];
  serviceOrdersReady?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Contact[]>(contacts);
  const [localDeals, setLocalDeals] = useState<Deal[]>(deals);
  const [localOrders, setLocalOrders] = useState<ServiceOrder[]>(serviceOrders);
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id || null);
  const [status, setStatus] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const router = useRouter();

  const stageById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const selected = rows.find((contact) => contact.id === selectedId) || rows[0];

  const dealByContact = useMemo(() => {
    const map = new Map<string, Deal>();
    localDeals.forEach((deal) => {
      if (!map.has(deal.contactId) || deal.status === "aberto") map.set(deal.contactId, deal);
    });
    return map;
  }, [localDeals]);

  const ordersByContact = useMemo(() => {
    const map = new Map<string, ServiceOrder[]>();
    localOrders.forEach((order) => {
      const list = map.get(order.contactId) || [];
      list.push(order);
      map.set(order.contactId, list);
    });
    return map;
  }, [localOrders]);

  const filtered = useMemo(() => {
    const text = query.toLowerCase().trim();
    if (!text) return rows;
    return rows.filter((contact) => {
      const deal = dealByContact.get(contact.id);
      const orders = ordersByContact.get(contact.id) || [];
      return [contact.name, contact.phone, contact.email, contact.company, contact.source, contact.owner, contact.tags.join(" "), deal?.title, ...orders.map((order) => `${order.code} ${order.title}`)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [rows, dealByContact, ordersByContact, query]);

  const selectedDeal = selected ? dealByContact.get(selected.id) : undefined;
  const selectedOrders = selected ? (ordersByContact.get(selected.id) || []) : [];
  const selectedMessages = useMemo(() => (selected ? messages.filter((message) => message.contactId === selected.id) : []), [messages, selected]);
  const selectedActivities = useMemo(() => (selected ? activities.filter((activity) => activity.contactId === selected.id) : []), [activities, selected]);

  const timeline = useMemo(() => {
    if (!selected) return [];
    const items: Array<{ id: string; date: string; title: string; detail: string; tone?: string }> = [];

    items.push({
      id: `contact-${selected.id}`,
      date: selected.lastMessageAt,
      title: "Contato atualizado",
      detail: `${selected.source} · ${selected.owner}`,
      tone: "info",
    });

    if (selectedDeal) {
      items.push({
        id: `deal-${selectedDeal.id}`,
        date: selectedDeal.createdAt,
        title: selectedDeal.status === "perdido" ? "Oportunidade perdida" : selectedDeal.status === "ganho" ? "Oportunidade fechada" : `Etapa: ${stageById.get(selectedDeal.stageId)?.title || "Funil"}`,
        detail: `${selectedDeal.title} · ${money(selectedDeal.value)}`,
        tone: selectedDeal.status === "perdido" ? "danger" : selectedDeal.status === "ganho" ? "success" : "info",
      });
    }

    selectedOrders.forEach((order) => {
      items.push({
        id: `os-${order.id}`,
        date: order.updatedAt || order.createdAt,
        title: `${order.code} · ${orderStatusLabel[order.status] || order.status}`,
        detail: `${order.title} · ${money(order.finalValue || order.estimatedValue)}`,
        tone: ["concluida", "entregue"].includes(order.status) ? "success" : order.status === "cancelada" ? "danger" : "warning",
      });
    });

    selectedMessages.slice(-8).forEach((message) => {
      items.push({
        id: `msg-${message.id}`,
        date: message.createdAt,
        title: message.direction === "outbound" ? "Mensagem enviada" : "Mensagem recebida",
        detail: message.body,
        tone: message.direction === "outbound" ? "info" : "neutral",
      });
    });

    selectedActivities.slice(-8).forEach((activity) => {
      items.push({
        id: `act-${activity.id}`,
        date: activity.dueAt,
        title: activity.done ? "Tarefa concluída" : "Tarefa pendente",
        detail: activity.title,
        tone: activity.done ? "success" : "warning",
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 18);
  }, [selected, selectedActivities, selectedDeal, selectedMessages, selectedOrders, stageById]);

  async function deleteContact(contact: Contact) {
    const ok = window.confirm(`Excluir o lead ${contact.name}? Isso também remove oportunidades, tarefas e mensagens ligadas a ele.`);
    if (!ok) return;

    setStatus("Excluindo lead...");
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao excluir lead.");

      setRows((current) => current.filter((item) => item.id !== contact.id));
      setLocalDeals((current) => current.filter((deal) => deal.contactId !== contact.id));
      setLocalOrders((current) => current.filter((order) => order.contactId !== contact.id));
      setSelectedId((current) => (current === contact.id ? rows.find((item) => item.id !== contact.id)?.id || null : current));
      setStatus("Lead excluído.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao excluir lead.");
    }
  }

  async function createServiceOrder(contact: Contact) {
    if (!serviceOrdersReady) {
      setStatus("Rode a migration-v3-service-orders.sql no Supabase antes de criar OS.");
      return;
    }

    const deal = dealByContact.get(contact.id);
    setCreatingOrder(true);
    setStatus(null);
    try {
      const response = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          dealId: deal?.id || null,
          title: deal?.title || `Atendimento operacional - ${contact.name}`,
          description: contact.notes || "Demanda criada a partir da ficha do contato.",
          priority: contact.temperature,
          owner: contact.owner,
          estimatedValue: deal?.value || 0,
          status: "aberta",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "Erro ao criar OS.");
      if (result.serviceOrder) {
        setLocalOrders((current) => [
          {
            id: result.serviceOrder.id,
            contactId: result.serviceOrder.contact_id,
            dealId: result.serviceOrder.deal_id || undefined,
            code: result.serviceOrder.code,
            title: result.serviceOrder.title,
            description: result.serviceOrder.description || undefined,
            status: result.serviceOrder.status,
            priority: result.serviceOrder.priority,
            owner: result.serviceOrder.owner,
            estimatedValue: Number(result.serviceOrder.estimated_value || 0),
            finalValue: Number(result.serviceOrder.final_value || 0),
            dueAt: result.serviceOrder.due_at || undefined,
            startedAt: result.serviceOrder.started_at || undefined,
            completedAt: result.serviceOrder.completed_at || undefined,
            internalNotes: result.serviceOrder.internal_notes || undefined,
            createdAt: result.serviceOrder.created_at,
            updatedAt: result.serviceOrder.updated_at,
          },
          ...current,
        ]);
      }
      setStatus("Ordem de serviço criada.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar OS.");
    } finally {
      setCreatingOrder(false);
    }
  }

  return (
    <section className="crm-workspace">
      <article className="card crm-list-card">
        <div className="crm-list-head">
          <div>
            <h2>Contatos e leads</h2>
            <p className="description">Clique em um contato para ver histórico, oportunidades e ordens de serviço.</p>
          </div>
          <input className="input" placeholder="Buscar lead, telefone, origem..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {status && <div className="inline-alert">{status}</div>}

        {filtered.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum lead ainda.</strong>
            <p className="muted">Use o formulário do Dashboard ou envie um POST para /api/leads para testar a entrada real no Supabase.</p>
          </div>
        ) : (
          <div className="crm-contact-list">
            {filtered.map((contact) => {
              const deal = dealByContact.get(contact.id);
              const orders = ordersByContact.get(contact.id) || [];
              return (
                <button type="button" className={`crm-contact-row ${selected?.id === contact.id ? "active" : ""}`} key={contact.id} onClick={() => setSelectedId(contact.id)}>
                  <span className="avatar-small">{contact.name.charAt(0).toUpperCase()}</span>
                  <span>
                    <strong>{contact.name}</strong>
                    <small>{contact.company || contact.email || "Sem empresa"}</small>
                    <em>{deal?.title || "Sem oportunidade"}</em>
                  </span>
                  <span className="crm-row-meta">
                    <span className={`badge ${temperatureClass[contact.temperature]}`}>{contact.temperature}</span>
                    <small>{orders.length} OS</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </article>

      <aside className="card crm-detail-card">
        {!selected ? (
          <div className="empty-state"><strong>Selecione um contato.</strong></div>
        ) : (
          <>
            <div className="crm-detail-head">
              <div>
                <p className="eyebrow-small">Ficha do contato</p>
                <h2>{selected.name}</h2>
                <p className="muted">{selected.phone} · {selected.company || "sem empresa"}</p>
              </div>
              <span className={`badge ${temperatureClass[selected.temperature]}`}>{selected.temperature}</span>
            </div>

            <div className="crm-detail-actions">
              <Link className="btn mini" href={`/inbox?contact=${selected.id}`}>Abrir conversa</Link>
              <button className="btn mini secondary" onClick={() => createServiceOrder(selected)} disabled={creatingOrder}>{creatingOrder ? "Criando..." : "Criar OS"}</button>
              <Link className="btn mini secondary" href="/ordens">Ver OS</Link>
              <button type="button" className="btn mini danger" onClick={() => deleteContact(selected)}>Excluir</button>
            </div>

            <div className="crm-summary-grid">
              <div><span>Origem</span><strong>{selected.source}</strong></div>
              <div><span>Responsável</span><strong>{selected.owner}</strong></div>
              <div><span>Último contato</span><strong>{shortDate(selected.lastMessageAt)}</strong></div>
              <div><span>Oportunidade</span><strong>{selectedDeal ? money(selectedDeal.value) : "—"}</strong></div>
            </div>

            {selectedDeal && (
              <div className="crm-linked-card">
                <p className="eyebrow-small">Oportunidade ativa</p>
                <strong>{selectedDeal.title}</strong>
                <span>{stageById.get(selectedDeal.stageId)?.title || "Funil"} · {selectedDeal.status}</span>
              </div>
            )}

            <div className="crm-orders-strip">
              <div className="section-headline compact">
                <div>
                  <p className="eyebrow-small">Ordens de serviço</p>
                  <h3>{selectedOrders.length ? `${selectedOrders.length} vinculada(s)` : "Nenhuma OS"}</h3>
                </div>
              </div>
              {selectedOrders.length === 0 ? (
                <div className="empty-state mini-empty">Crie uma OS quando o atendimento virar execução.</div>
              ) : selectedOrders.slice(0, 4).map((order) => (
                <Link className="crm-os-row" key={order.id} href="/ordens">
                  <span>
                    <strong>{order.code}</strong>
                    <small>{order.title}</small>
                  </span>
                  <em>{orderStatusLabel[order.status] || order.status}</em>
                </Link>
              ))}
            </div>

            <div className="crm-timeline-panel">
              <p className="eyebrow-small">Histórico completo</p>
              <div className="timeline-list-pro crm-timeline-list">
                {timeline.map((item) => (
                  <div key={item.id} className={`timeline-item ${item.tone || "neutral"}`}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    <small>{shortDate(item.date)}</small>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

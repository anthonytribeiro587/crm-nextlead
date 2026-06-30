"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, LeadTemperature, ServiceOrder, ServiceOrderStatus } from "@/lib/types";
import { money, shortDate } from "@/lib/format";

const statusLabels: Record<ServiceOrderStatus, string> = {
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

const statusOrder: ServiceOrderStatus[] = ["aberta", "diagnostico", "aguardando_aprovacao", "aprovada", "execucao", "aguardando_material", "concluida", "entregue", "cancelada"];

const priorityLabels = {
  frio: "baixa",
  morno: "média",
  quente: "alta",
};

function dateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyOrderForm() {
  return {
    contactId: "",
    dealId: "",
    title: "",
    description: "",
    status: "aberta" as ServiceOrderStatus,
    priority: "morno" as LeadTemperature,
    owner: "NextLead",
    estimatedValue: "0",
    finalValue: "0",
    dueAt: "",
    internalNotes: "",
  };
}

export function ServiceOrdersClient({
  serviceOrders: initialOrders,
  contacts,
  deals,
  serviceOrdersReady = true,
  serviceOrdersError,
}: {
  serviceOrders: ServiceOrder[];
  contacts: Contact[];
  deals: Deal[];
  serviceOrdersReady?: boolean;
  serviceOrdersError?: string;
}) {
  const [orders, setOrders] = useState<ServiceOrder[]>(initialOrders);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceOrderStatus | "todas">("todas");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(serviceOrdersError || null);
  const [form, setForm] = useState(emptyOrderForm);
  const router = useRouter();

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const dealById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);
  const owners = useMemo(() => Array.from(new Set([...contacts.map((contact) => contact.owner), ...orders.map((order) => order.owner)].filter(Boolean))).sort(), [contacts, orders]);

  const filtered = useMemo(() => {
    const text = query.toLowerCase().trim();
    return orders.filter((order) => {
      const contact = contactById.get(order.contactId);
      const deal = order.dealId ? dealById.get(order.dealId) : undefined;
      const matchText = !text || [order.code, order.title, order.description, order.owner, order.internalNotes, contact?.name, contact?.phone, contact?.company, deal?.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
      const matchStatus = statusFilter === "todas" || order.status === statusFilter;
      const matchOwner = ownerFilter === "todos" || order.owner === ownerFilter;
      return matchText && matchStatus && matchOwner;
    });
  }, [contactById, dealById, orders, ownerFilter, query, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<ServiceOrderStatus, ServiceOrder[]>();
    statusOrder.forEach((status) => map.set(status, []));
    filtered.forEach((order) => map.get(order.status)?.push(order));
    return map;
  }, [filtered]);

  const openOrders = orders.filter((order) => !["concluida", "entregue", "cancelada"].includes(order.status));
  const lateOrders = openOrders.filter((order) => order.dueAt && new Date(order.dueAt).getTime() < Date.now()).length;
  const executionOrders = orders.filter((order) => ["execucao", "aguardando_material"].includes(order.status)).length;
  const totalEstimated = openOrders.reduce((sum, order) => sum + order.estimatedValue, 0);

  function startCreate(contactId?: string) {
    const contact = contactId ? contactById.get(contactId) : undefined;
    const deal = contact ? deals.find((item) => item.contactId === contact.id && item.status !== "perdido") : undefined;
    setEditingId(null);
    setForm({
      ...emptyOrderForm(),
      contactId: contact?.id || contacts[0]?.id || "",
      dealId: deal?.id || "",
      title: deal?.title || "Novo atendimento operacional",
      priority: contact?.temperature || "morno",
      owner: contact?.owner || "NextLead",
      estimatedValue: String(deal?.value || 0),
    });
    setShowForm(true);
    setFeedback(null);
  }

  function startEdit(order: ServiceOrder) {
    setEditingId(order.id);
    setForm({
      contactId: order.contactId,
      dealId: order.dealId || "",
      title: order.title,
      description: order.description || "",
      status: order.status,
      priority: order.priority,
      owner: order.owner,
      estimatedValue: String(order.estimatedValue || 0),
      finalValue: String(order.finalValue || 0),
      dueAt: dateTimeLocal(order.dueAt),
      internalNotes: order.internalNotes || "",
    });
    setShowForm(true);
    setFeedback(null);
  }

  async function saveOrder() {
    if (!form.contactId) {
      setFeedback("Selecione um contato para criar a OS.");
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/service-orders", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: editingId || undefined,
          ...form,
          dealId: form.dealId || null,
          dueAt: form.dueAt || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "Erro ao salvar ordem de serviço.");
      if (result.serviceOrder) {
        const saved: ServiceOrder = {
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
        };
        setOrders((current) => (editingId ? current.map((order) => (order.id === saved.id ? saved : order)) : [saved, ...current]));
      }
      setShowForm(false);
      setFeedback(editingId ? "Ordem de serviço atualizada." : "Ordem de serviço criada.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro ao salvar ordem de serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(order: ServiceOrder, status: ServiceOrderStatus) {
    setFeedback(null);
    try {
      const response = await fetch("/api/service-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "Erro ao atualizar status.");
      setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status, updatedAt: new Date().toISOString() } : item)));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro ao atualizar status.");
    }
  }

  return (
    <>
      {!serviceOrdersReady && (
        <div className="inline-alert os-alert">
          <strong>Ative o módulo de OS no Supabase.</strong>
          <span>Rode o arquivo <code>scripts/migration-v3-service-orders.sql</code> uma vez no SQL Editor.</span>
        </div>
      )}
      {feedback && <div className="inline-alert">{feedback}</div>}

      <section className="os-command card">
        <div>
          <p className="eyebrow-small">Operação</p>
          <h2>Ordens em andamento</h2>
          <p className="muted">Controle execução, responsável, prazo e retorno para o cliente depois da venda.</p>
        </div>
        <div className="os-metrics-row">
          <span><strong>{openOrders.length}</strong> abertas</span>
          <span><strong>{executionOrders}</strong> em execução</span>
          <span><strong>{lateOrders}</strong> atrasadas</span>
          <span><strong>{money(totalEstimated)}</strong></span>
        </div>
      </section>

      <section className="card os-toolbar">
        <input className="input" placeholder="Buscar OS, cliente, serviço..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ServiceOrderStatus | "todas")}>
          <option value="todas">Todos status</option>
          {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
        <select className="input" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="todos">Todos responsáveis</option>
          {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
        <button className="btn" type="button" onClick={() => startCreate()}>Nova OS</button>
      </section>

      {showForm && (
        <section className="card os-form-card">
          <div className="section-headline">
            <div>
              <p className="eyebrow-small">{editingId ? "Editar OS" : "Nova OS"}</p>
              <h2>{editingId ? "Atualizar ordem de serviço" : "Criar ordem de serviço"}</h2>
            </div>
            <button className="btn mini secondary" onClick={() => setShowForm(false)}>Fechar</button>
          </div>
          <div className="os-form-grid">
            <label>Cliente
              <select className="input" value={form.contactId} onChange={(event) => setForm((current) => ({ ...current, contactId: event.target.value }))}>
                <option value="">Selecione</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.company || contact.phone}</option>)}
              </select>
            </label>
            <label>Oportunidade
              <select className="input" value={form.dealId} onChange={(event) => setForm((current) => ({ ...current, dealId: event.target.value }))}>
                <option value="">Sem vínculo</option>
                {deals.filter((deal) => !form.contactId || deal.contactId === form.contactId).map((deal) => <option key={deal.id} value={deal.id}>{deal.title} · {money(deal.value)}</option>)}
              </select>
            </label>
            <label>Título
              <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>Status
              <select className="input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ServiceOrderStatus }))}>
                {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>Prioridade
              <select className="input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as LeadTemperature }))}>
                <option value="frio">Baixa</option>
                <option value="morno">Média</option>
                <option value="quente">Alta</option>
              </select>
            </label>
            <label>Responsável
              <input className="input" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
            </label>
            <label>Valor estimado
              <input className="input" value={form.estimatedValue} onChange={(event) => setForm((current) => ({ ...current, estimatedValue: event.target.value }))} />
            </label>
            <label>Valor final
              <input className="input" value={form.finalValue} onChange={(event) => setForm((current) => ({ ...current, finalValue: event.target.value }))} />
            </label>
            <label>Previsão
              <input className="input" type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
            </label>
            <label className="span-2">Descrição do serviço
              <textarea className="input" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="O que precisa ser feito?" />
            </label>
            <label className="span-2">Observações internas
              <textarea className="input" value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} placeholder="Informações para a equipe, materiais, combinados..." />
            </label>
          </div>
          <button className="btn" type="button" disabled={saving} onClick={saveOrder}>{saving ? "Salvando..." : editingId ? "Salvar OS" : "Criar OS"}</button>
        </section>
      )}

      <section className="os-board">
        {statusOrder.map((status) => {
          const items = grouped.get(status) || [];
          return (
            <article className="os-column" key={status}>
              <div className="os-column-head">
                <strong>{statusLabels[status]}</strong>
                <span>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="empty-state mini-empty">Sem OS aqui.</div>
              ) : (
                items.map((order) => {
                  const contact = contactById.get(order.contactId);
                  return (
                    <div className="os-card" key={order.id}>
                      <div className="os-card-topline">
                        <span className="badge cold">{order.code}</span>
                        <span className={`badge ${order.priority === "quente" ? "hot" : order.priority === "morno" ? "warm" : "cold"}`}>{priorityLabels[order.priority]}</span>
                      </div>
                      <strong>{order.title}</strong>
                      <p className="muted">{contact?.name || "Contato"} · {contact?.company || contact?.phone || "sem empresa"}</p>
                      {order.description && <p className="os-card-desc">{order.description}</p>}
                      <div className="deal-meta">
                        <span>{money(order.finalValue || order.estimatedValue)}</span>
                        <span>{order.dueAt ? `Prev. ${shortDate(order.dueAt)}` : "sem prazo"}</span>
                      </div>
                      <div className="os-actions">
                        <Link className="btn mini secondary" href={`/inbox?contact=${order.contactId}`}>Inbox</Link>
                        <button className="btn mini secondary" type="button" onClick={() => startEdit(order)}>Editar</button>
                        <select className="input mini-select" value={order.status} onChange={(event) => updateStatus(order, event.target.value as ServiceOrderStatus)}>
                          {statusOrder.map((nextStatus) => <option key={nextStatus} value={nextStatus}>{statusLabels[nextStatus]}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

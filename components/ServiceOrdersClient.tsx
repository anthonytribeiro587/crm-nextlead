"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, LeadTemperature, ServiceOrder, ServiceOrderStatus } from "@/lib/types";
import { money, shortDate } from "@/lib/format";

const statusLabels: Record<ServiceOrderStatus, string> = {
  aberta: "Aberta",
  diagnostico: "Diagnóstico",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovada: "Aprovada",
  execucao: "Em execução",
  aguardando_material: "Aguardando material",
  concluida: "Concluída",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

const statusOrder: ServiceOrderStatus[] = ["aberta", "diagnostico", "aguardando_aprovacao", "aprovada", "execucao", "aguardando_material", "concluida", "entregue", "cancelada"];

const priorityLabels: Record<LeadTemperature, string> = {
  frio: "baixa",
  morno: "média",
  quente: "alta",
};

const closedStatuses: ServiceOrderStatus[] = ["concluida", "entregue", "cancelada"];

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

function isLate(order: ServiceOrder) {
  return Boolean(order.dueAt && new Date(order.dueAt).getTime() < Date.now() && !closedStatuses.includes(order.status));
}

function orderStatusClass(order: ServiceOrder) {
  if (order.status === "cancelada") return "danger";
  if (closedStatuses.includes(order.status)) return "success";
  if (isLate(order)) return "warning";
  if (["execucao", "aguardando_material"].includes(order.status)) return "accent";
  return "neutral";
}

function mapApiOrder(serviceOrder: any): ServiceOrder {
  return {
    id: serviceOrder.id,
    contactId: serviceOrder.contact_id,
    dealId: serviceOrder.deal_id || undefined,
    code: serviceOrder.code,
    title: serviceOrder.title,
    description: serviceOrder.description || undefined,
    status: serviceOrder.status,
    priority: serviceOrder.priority,
    owner: serviceOrder.owner,
    estimatedValue: Number(serviceOrder.estimated_value || 0),
    finalValue: Number(serviceOrder.final_value || 0),
    dueAt: serviceOrder.due_at || undefined,
    startedAt: serviceOrder.started_at || undefined,
    completedAt: serviceOrder.completed_at || undefined,
    internalNotes: serviceOrder.internal_notes || undefined,
    createdAt: serviceOrder.created_at,
    updatedAt: serviceOrder.updated_at,
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrders[0]?.id || null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(serviceOrdersError || null);
  const [form, setForm] = useState(emptyOrderForm);
  const router = useRouter();

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const dealById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);
  const owners = useMemo(() => Array.from(new Set([...contacts.map((contact) => contact.owner), ...orders.map((order) => order.owner)].filter(Boolean))).sort(), [contacts, orders]);

  const filtered = useMemo(() => {
    const text = query.toLowerCase().trim();
    return orders
      .filter((order) => {
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
      })
      .sort((a, b) => {
        if (isLate(a) !== isLate(b)) return isLate(a) ? -1 : 1;
        const aClosed = closedStatuses.includes(a.status);
        const bClosed = closedStatuses.includes(b.status);
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      });
  }, [contactById, dealById, orders, ownerFilter, query, statusFilter]);

  const openOrders = orders.filter((order) => !closedStatuses.includes(order.status));
  const lateOrders = openOrders.filter(isLate).length;
  const executionOrders = orders.filter((order) => ["execucao", "aguardando_material"].includes(order.status)).length;
  const approvalOrders = orders.filter((order) => ["aguardando_aprovacao", "aprovada"].includes(order.status)).length;
  const totalEstimated = openOrders.reduce((sum, order) => sum + (order.finalValue || order.estimatedValue), 0);

  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : null;
  const selectedContact = selectedOrder ? contactById.get(selectedOrder.contactId) : null;
  const selectedDeal = selectedOrder?.dealId ? dealById.get(selectedOrder.dealId) : null;
  const formContact = form.contactId ? contactById.get(form.contactId) : undefined;
  const formDeal = form.dealId ? dealById.get(form.dealId) : undefined;

  function startCreate(contactId?: string) {
    const contact = contactId ? contactById.get(contactId) : undefined;
    const deal = contact ? deals.find((item) => item.contactId === contact.id && item.status !== "perdido") : undefined;
    setEditingId(null);
    setForm({
      ...emptyOrderForm(),
      contactId: contact?.id || contacts[0]?.id || "",
      dealId: deal?.id || "",
      title: deal?.title || "Novo atendimento operacional",
      description: contact ? `Demanda operacional para ${contact.name}.` : "",
      priority: contact?.temperature || "morno",
      owner: contact?.owner || "NextLead",
      estimatedValue: String(deal?.value || 0),
    });
    setShowForm(true);
    setFeedback(null);
  }

  function startEdit(order: ServiceOrder) {
    setSelectedOrderId(order.id);
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

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFeedback(null);
  }

  async function saveOrder() {
    if (!form.contactId) {
      setFeedback("Selecione um contato para criar a OS.");
      return;
    }
    if (!form.title.trim()) {
      setFeedback("Informe o serviço ou demanda da OS.");
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
        const saved = mapApiOrder(result.serviceOrder);
        setOrders((current) => (editingId ? current.map((order) => (order.id === saved.id ? saved : order)) : [saved, ...current]));
        setSelectedOrderId(saved.id);
      }
      setShowForm(false);
      setEditingId(null);
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
      const saved = result.serviceOrder ? mapApiOrder(result.serviceOrder) : { ...order, status, updatedAt: new Date().toISOString() };
      setOrders((current) => current.map((item) => (item.id === order.id ? saved : item)));
      setSelectedOrderId(order.id);
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

      <section className="os-command os-command-compact card">
        <div>
          <p className="eyebrow-small">Operação</p>
          <h2>Lista de ordens</h2>
          <p className="muted">Veja rapidamente cliente, serviço, status, responsável e prazo. Clique em uma OS para abrir o detalhe.</p>
        </div>
        <div className="os-kpi-strip">
          <span><strong>{openOrders.length}</strong> abertas</span>
          <span><strong>{executionOrders}</strong> em execução</span>
          <span><strong>{approvalOrders}</strong> aprovação</span>
          <span className={lateOrders > 0 ? "danger-text" : ""}><strong>{lateOrders}</strong> atrasadas</span>
          <span><strong>{money(totalEstimated)}</strong></span>
        </div>
      </section>

      <section className="card os-toolbar os-toolbar-list">
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

      <section className="os-list-layout os-list-layout-clean">
        <article className="card os-list-card">
          <div className="os-list-title">
            <div>
              <h2>Ordens de serviço</h2>
              <p className="muted">{filtered.length} resultado(s) no filtro atual.</p>
            </div>
            <span className="badge cold">lista operacional</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state os-empty-list">
              <strong>Nenhuma OS encontrada.</strong>
              <p className="muted">Crie uma nova OS ou ajuste os filtros para visualizar demandas em andamento.</p>
            </div>
          ) : (
            <div className="os-table-list">
              {filtered.map((order) => {
                const contact = contactById.get(order.contactId);
                const deal = order.dealId ? dealById.get(order.dealId) : undefined;
                const amount = order.finalValue || order.estimatedValue;
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    className={`os-list-row ${selectedOrderId === order.id ? "active" : ""} ${isLate(order) ? "late" : ""}`}
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedOrderId(order.id); }}
                  >
                    <span className="os-list-main">
                      <span className="os-code-line">
                        <strong>{order.code}</strong>
                        <em className={`os-status-pill ${orderStatusClass(order)}`}>{isLate(order) ? "Atrasada" : statusLabels[order.status]}</em>
                      </span>
                      <span className="os-title-line">{order.title}</span>
                      <span className="os-client-line">{contact?.name || "Contato"} · {contact?.company || contact?.phone || "sem empresa"}</span>
                    </span>
                    <span className="os-list-meta desktop-only-soft">
                      <small>Responsável</small>
                      <strong>{order.owner}</strong>
                    </span>
                    <span className="os-list-meta desktop-only-soft">
                      <small>Prazo</small>
                      <strong>{order.dueAt ? shortDate(order.dueAt) : "sem prazo"}</strong>
                    </span>
                    <span className="os-list-meta desktop-only-soft">
                      <small>Valor</small>
                      <strong>{money(amount)}</strong>
                    </span>
                    <span className="os-row-actions" onClick={(event) => event.stopPropagation()}>
                      <Link className="btn mini secondary" href={`/inbox?contact=${order.contactId}`}>Inbox</Link>
                      <button className="btn mini secondary" type="button" onClick={() => startEdit(order)}>Editar</button>
                      <select className="input mini-select" value={order.status} onChange={(event) => updateStatus(order, event.target.value as ServiceOrderStatus)}>
                        {statusOrder.map((nextStatus) => <option key={nextStatus} value={nextStatus}>{statusLabels[nextStatus]}</option>)}
                      </select>
                    </span>
                    {deal && <span className="os-linked-deal">Vinculada a: {deal.title}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <aside className="card os-detail-panel os-detail-panel-clean">
          {selectedOrder ? (
            <>
              <div className="os-panel-head">
                <div>
                  <p className="eyebrow-small">OS selecionada</p>
                  <h2>{selectedOrder.code}</h2>
                </div>
                <button className="btn mini secondary" onClick={() => startEdit(selectedOrder)}>Editar</button>
              </div>
              <div className="os-selected-summary">
                <em className={`os-status-pill ${orderStatusClass(selectedOrder)}`}>{isLate(selectedOrder) ? "Atrasada" : statusLabels[selectedOrder.status]}</em>
                <strong>{selectedOrder.title}</strong>
                <p>{selectedContact?.name || "Contato"} · {selectedContact?.company || selectedContact?.phone || "sem empresa"}</p>
                <div className="crm-summary-grid">
                  <div><span>Responsável</span><strong>{selectedOrder.owner}</strong></div>
                  <div><span>Prazo</span><strong>{selectedOrder.dueAt ? shortDate(selectedOrder.dueAt) : "sem prazo"}</strong></div>
                  <div><span>Prioridade</span><strong>{priorityLabels[selectedOrder.priority]}</strong></div>
                  <div><span>Valor</span><strong>{money(selectedOrder.finalValue || selectedOrder.estimatedValue)}</strong></div>
                </div>
                {selectedDeal && <p className="os-detail-copy">Oportunidade vinculada: <strong>{selectedDeal.title}</strong></p>}
                {selectedOrder.description && <p className="os-detail-copy">{selectedOrder.description}</p>}
                {selectedOrder.internalNotes && <p className="os-detail-copy muted">Obs. interna: {selectedOrder.internalNotes}</p>}
                <div className="os-panel-actions">
                  <Link className="btn secondary" href={`/inbox?contact=${selectedOrder.contactId}`}>Abrir Inbox</Link>
                  <button className="btn secondary" type="button" onClick={() => startCreate(selectedOrder.contactId)}>Nova OS desse cliente</button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state os-empty-list">
              <strong>Selecione uma OS.</strong>
              <p className="muted">Clique em uma linha da lista para ver detalhes ou criar uma nova ordem.</p>
            </div>
          )}
        </aside>
      </section>

      {showForm && (
        <div className="os-modal-backdrop" role="dialog" aria-modal="true" aria-label={editingId ? "Editar ordem de serviço" : "Criar ordem de serviço"}>
          <div className="card os-modal-card">
            <div className="os-panel-head os-modal-head">
              <div>
                <p className="eyebrow-small">{editingId ? "Editar OS" : "Nova OS"}</p>
                <h2>{editingId ? "Ajustar ordem de serviço" : "Conferir antes de criar"}</h2>
                <p className="muted">Revise cliente, demanda, prazo, valor e observações antes de salvar.</p>
              </div>
              <button className="btn mini secondary" onClick={closeForm}>Fechar</button>
            </div>

            <div className="os-form-preview-strip">
              <span><small>Cliente</small><strong>{formContact?.name || "Selecione"}</strong></span>
              <span><small>Empresa</small><strong>{formContact?.company || formContact?.phone || "sem empresa"}</strong></span>
              <span><small>Oportunidade</small><strong>{formDeal?.title || "Sem vínculo"}</strong></span>
              <span><small>Próximo número</small><strong>{editingId ? selectedOrder?.code || "OS" : "gerado ao salvar"}</strong></span>
            </div>

            <div className="os-form-grid os-form-grid-modal">
              <label>Cliente
                <select className="input" value={form.contactId} onChange={(event) => {
                  const contact = contactById.get(event.target.value);
                  const deal = deals.find((item) => item.contactId === event.target.value && item.status !== "perdido");
                  setForm((current) => ({
                    ...current,
                    contactId: event.target.value,
                    dealId: deal?.id || "",
                    title: current.title || deal?.title || "Novo atendimento operacional",
                    priority: contact?.temperature || current.priority,
                    owner: contact?.owner || current.owner,
                    estimatedValue: current.estimatedValue !== "0" ? current.estimatedValue : String(deal?.value || 0),
                  }));
                }}>
                  <option value="">Selecione</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.company || contact.phone}</option>)}
                </select>
              </label>
              <label>Oportunidade
                <select className="input" value={form.dealId} onChange={(event) => {
                  const deal = dealById.get(event.target.value);
                  setForm((current) => ({ ...current, dealId: event.target.value, title: deal?.title || current.title, estimatedValue: deal ? String(deal.value || 0) : current.estimatedValue }));
                }}>
                  <option value="">Sem vínculo</option>
                  {deals.filter((deal) => !form.contactId || deal.contactId === form.contactId).map((deal) => <option key={deal.id} value={deal.id}>{deal.title} · {money(deal.value)}</option>)}
                </select>
              </label>
              <label className="span-2">Serviço / demanda
                <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Instalação elétrica, manutenção, landing page..." />
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
              <label>Previsão
                <input className="input" type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
              </label>
              <label>Valor estimado
                <input className="input" value={form.estimatedValue} onChange={(event) => setForm((current) => ({ ...current, estimatedValue: event.target.value }))} />
              </label>
              <label>Valor final
                <input className="input" value={form.finalValue} onChange={(event) => setForm((current) => ({ ...current, finalValue: event.target.value }))} />
              </label>
              <label className="span-2">Descrição do serviço
                <textarea className="input" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="O que precisa ser feito?" />
              </label>
              <label className="span-2">Observações internas
                <textarea className="input" value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} placeholder="Informações para equipe, materiais, combinados, restrições..." />
              </label>
            </div>
            <div className="os-modal-actions">
              <button className="btn secondary" type="button" onClick={closeForm}>Cancelar</button>
              <button className="btn" type="button" disabled={saving} onClick={saveOrder}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar OS"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

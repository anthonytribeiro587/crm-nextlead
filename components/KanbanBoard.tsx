"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal, DealStatus, LeadTemperature, Pipeline, Stage } from "@/lib/types";
import { money } from "@/lib/format";
import { PIPELINE_TEMPLATES, type PipelineTemplateKey } from "@/lib/pipeline-templates";
import { SmartSelect } from "@/components/SmartSelect";

type EditingState = {
  deal: Deal;
  title: string;
  value: string;
  expectedClose: string;
  stageId: string;
  status: DealStatus;
  lostReason: string;
};

type ViewMode = "board" | "list";

type PipelineStageDraft = {
  title: string;
  color: string;
};

type NewPipelineState = {
  name: string;
  template: PipelineTemplateKey;
  stages: PipelineStageDraft[];
};

type NewDealState = {
  contactId: string;
  title: string;
  value: string;
  expectedClose: string;
};


const ACTIVE_PIPELINE_STORAGE_KEY = "nextlead.activePipelineId";

function firstPipelineId(pipelines: Pipeline[], stages: Stage[]) {
  return pipelines[0]?.id || stages[0]?.pipelineId || "";
}

function isPipelineAvailable(pipelineId: string, pipelines: Pipeline[]) {
  return Boolean(pipelineId && pipelines.some((pipeline) => pipeline.id === pipelineId));
}

const temperatureOptions: Array<{ value: "todos" | LeadTemperature; label: string }> = [
  { value: "todos", label: "Todas temperaturas" },
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

function formatDate(value?: string) {
  if (!value) return "sem previsão";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "sem previsão";
  return `${day}/${month}/${year}`;
}

function stageLabel(stages: Stage[], stageId: string) {
  return stages.find((stage) => stage.id === stageId)?.title || "Sem etapa";
}

function templateStages(template: PipelineTemplateKey): PipelineStageDraft[] {
  const selected = PIPELINE_TEMPLATES[template] || PIPELINE_TEMPLATES.personalizado;
  return selected.stages.map((stage) => ({ title: stage.title, color: stage.color }));
}

function cleanStageDrafts(stages: PipelineStageDraft[]) {
  const clean = stages
    .map((stage) => ({
      title: stage.title.trim(),
      color: /^#[0-9a-f]{6}$/i.test(stage.color) ? stage.color : "#06b6d4",
    }))
    .filter((stage) => stage.title.length > 0);

  return clean.length ? clean : templateStages("personalizado");
}

function sortByPriority(deals: Deal[], contactsById: Map<string, Contact>) {
  const tempWeight: Record<LeadTemperature, number> = { quente: 0, morno: 1, frio: 2 };
  return [...deals].sort((a, b) => {
    const contactA = contactsById.get(a.contactId);
    const contactB = contactsById.get(b.contactId);
    const waitingA = daysSince(contactA?.lastMessageAt) || 0;
    const waitingB = daysSince(contactB?.lastMessageAt) || 0;
    const tempA = tempWeight[contactA?.temperature || "morno"];
    const tempB = tempWeight[contactB?.temperature || "morno"];
    if (tempA !== tempB) return tempA - tempB;
    if (waitingA !== waitingB) return waitingB - waitingA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function KanbanBoard({
  contacts: initialContacts,
  deals: initialDeals,
  pipelines: initialPipelines,
  stages: initialStages,
}: {
  contacts: Contact[];
  deals: Deal[];
  pipelines: Pipeline[];
  stages: Stage[];
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [pipelines, setPipelines] = useState<Pipeline[]>(initialPipelines);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [activePipelineId, setActivePipelineId] = useState(firstPipelineId(initialPipelines, initialStages));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [newPipeline, setNewPipeline] = useState<NewPipelineState | null>(null);
  const [newDeal, setNewDeal] = useState<NewDealState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const [temperatureFilter, setTemperatureFilter] = useState<"todos" | LeadTemperature>("todos");
  const [ageFilter, setAgeFilter] = useState("todos");
  const [showLost, setShowLost] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const router = useRouter();

  function selectActivePipeline(pipelineId: string) {
    if (!pipelineId) return;
    setActivePipelineId(pipelineId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_PIPELINE_STORAGE_KEY, pipelineId);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedPipelineId = window.localStorage.getItem(ACTIVE_PIPELINE_STORAGE_KEY) || "";
    if (isPipelineAvailable(savedPipelineId, pipelines)) {
      setActivePipelineId(savedPipelineId);
      return;
    }

    const fallbackPipelineId = firstPipelineId(pipelines, stages);
    if (fallbackPipelineId && !isPipelineAvailable(activePipelineId, pipelines)) {
      setActivePipelineId(fallbackPipelineId);
      window.localStorage.setItem(ACTIVE_PIPELINE_STORAGE_KEY, fallbackPipelineId);
    }
  }, [activePipelineId, pipelines, stages]);

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const activePipeline = useMemo(() => pipelines.find((pipeline) => pipeline.id === activePipelineId) || pipelines[0], [activePipelineId, pipelines]);
  const activeStages = useMemo(() => {
    const fallbackPipelineId = activePipeline?.id || activePipelineId;
    const filtered = stages.filter((stage) => stage.pipelineId === fallbackPipelineId || (!stage.pipelineId && fallbackPipelineId === activePipelineId));
    return filtered.sort((a, b) => a.order - b.order);
  }, [activePipeline?.id, activePipelineId, stages]);
  const activeStageIds = useMemo(() => new Set(activeStages.map((stage) => stage.id)), [activeStages]);
  const firstStageId = activeStages[0]?.id || stages[0]?.id || "";
  const closedStageId = useMemo(
    () => activeStages.find((stage) => stage.title.toLowerCase().includes("fechado") || stage.title.toLowerCase().includes("aprovado"))?.id || activeStages[activeStages.length - 1]?.id || "",
    [activeStages],
  );

  const owners = useMemo(() => {
    const preferred = ["Anthony", "Felipe"];
    const current = contacts.map((contact) => contact.owner || "NextLead").filter(Boolean);

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
      if (!activeStageIds.has(deal.stageId)) return false;
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
  }, [activeStageIds, ageFilter, contactsById, deals, ownerFilter, query, showLost, temperatureFilter]);

  const priorityDeals = useMemo(() => sortByPriority(visibleDeals.filter((deal) => deal.status === "aberto"), contactsById), [contactsById, visibleDeals]);
  const pipelineValue = visibleDeals.filter((deal) => deal.status === "aberto").reduce((sum, deal) => sum + deal.value, 0);
  const staleDeals = visibleDeals.filter((deal) => (daysSince(contactsById.get(deal.contactId)?.lastMessageAt) || 0) >= 7).length;
  const proposalDeals = visibleDeals.filter((deal) => stageLabel(activeStages, deal.stageId).toLowerCase().includes("proposta")).length;
  const wonDeals = visibleDeals.filter((deal) => deal.status === "ganho" || deal.stageId === closedStageId).length;
  const activeDealsCount = visibleDeals.filter((deal) => deal.status === "aberto").length;

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
    const nextStage = stages.find((stage) => stage.id === stageId);
    setDeals((current) =>
      current.map((deal) =>
        deal.id === dealId
          ? { ...deal, pipelineId: nextStage?.pipelineId || deal.pipelineId, stageId, status: "aberto", lostReason: undefined, updatedAt: new Date().toISOString() }
          : deal,
      ),
    );
    patchDeal(dealId, { stageId, status: "aberto", lostReason: null })
      .then(() => {
        setMessage(`Movido para ${stageLabel(stages, stageId)}.`);
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
                pipelineId: stages.find((stage) => stage.id === editing.stageId)?.pipelineId || deal.pipelineId,
                stageId: editing.stageId,
                status: editing.status,
                lostReason: editing.status === "perdido" ? editing.lostReason || undefined : undefined,
                updatedAt: new Date().toISOString(),
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

  async function createPipeline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPipeline) return;
    setSaving(true);
    setMessage("Criando pipeline...");
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPipeline, stages: cleanStageDrafts(newPipeline.stages) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao criar pipeline.");

      const createdPipeline = result.pipeline as Pipeline;
      const createdStages = result.stages as Stage[];
      setPipelines((current) => [...current, createdPipeline]);
      setStages((current) => [...current, ...createdStages]);
      selectActivePipeline(createdPipeline.id);
      setNewPipeline(null);
      setMessage("Pipeline criado. Agora você pode criar oportunidades nele.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar pipeline.");
    } finally {
      setSaving(false);
    }
  }

  async function createDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newDeal || !firstStageId) return;
    setSaving(true);
    setMessage("Criando oportunidade...");
    try {
      const response = await fetch("/api/pipeline/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newDeal, stageId: firstStageId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao criar oportunidade.");
      setDeals((current) => [result.deal as Deal, ...current]);
      setNewDeal(null);
      setMessage("Oportunidade criada no pipeline ativo.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar oportunidade.");
    } finally {
      setSaving(false);
    }
  }

  async function markAsWon(deal: Deal) {
    const closedStage = stages.find((stage) => stage.id === closedStageId);
    setDeals((current) => current.map((item) => (item.id === deal.id ? { ...item, pipelineId: closedStage?.pipelineId || item.pipelineId, status: "ganho", stageId: closedStageId } : item)));
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

  async function markAsLost(deal: Deal) {
    const reason = window.prompt("Motivo da perda?", deal.lostReason || "Sem retorno");
    if (reason === null) return;
    setDeals((current) => current.map((item) => (item.id === deal.id ? { ...item, status: "perdido", lostReason: reason || "Sem motivo informado" } : item)));
    patchDeal(deal.id, { status: "perdido", lostReason: reason || "Sem motivo informado" })
      .then(() => router.refresh())
      .catch(() => setMessage("Não consegui marcar como perdido."));
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

  function openNewDeal() {
    const contact = contacts[0];
    setNewDeal({
      contactId: contact?.id || "",
      title: activePipeline?.name?.toLowerCase().includes("prot") ? "Protótipo de Landing Page" : "Orçamento de Landing Page",
      value: "0",
      expectedClose: "",
    });
  }

  function DealCard({ deal }: { deal: Deal }) {
    const contact = contactsById.get(deal.contactId);
    const idleDays = daysSince(contact?.lastMessageAt);
    return (
      <article
        className={`deal-card deal-card-pro deal-card-lean ${deal.status === "perdido" ? "lost" : ""}`}
        draggable
        onDragStart={() => setDraggingId(deal.id)}
        onDragEnd={() => setDraggingId(null)}
      >
        <div className="deal-card-topline">
          <span className={`badge ${tempClass(contact?.temperature)}`}>{contact?.temperature || "morno"}</span>
          {idleDays !== null && idleDays >= 3 ? <span className="idle-chip">{idleDays}d sem contato</span> : null}
          {deal.status !== "aberto" && <span className={`badge status-${deal.status}`}>{deal.status}</span>}
        </div>
        <div className="deal-card-main-v2">
          <strong>{deal.title}</strong>
          <p className="muted">{contact?.name || "Lead"} • {contact?.company || "sem empresa"}</p>
        </div>
        <div className="deal-meta deal-meta-v2">
          <span>{money(deal.value)}</span>
          <span>{formatDate(deal.expectedClose)}</span>
        </div>
        <div className="deal-actions deal-actions-pro deal-actions-pro-v2">
          <Link className="btn mini secondary" href={`/inbox?contact=${deal.contactId}`}>Abrir</Link>
          <button type="button" className="btn mini secondary" onClick={() => openEditor(deal)}>Editar</button>
          {deal.status === "perdido" ? (
            <button type="button" className="btn mini secondary" onClick={() => reopenDeal(deal)}>Reabrir</button>
          ) : (
            <button type="button" className="btn mini secondary" onClick={() => markAsWon(deal)}>Fechar</button>
          )}
          <button type="button" className="btn mini danger" onClick={() => markAsLost(deal)}>Perder</button>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="pipeline-control-panel card">
        <div className="pipeline-control-main">
          <p className="eyebrow-small">Pipeline ativo</p>
          <div className="pipeline-select-line">
            <SmartSelect
              className="pipeline-smart-select"
              value={activePipeline?.id || ""}
              onChange={selectActivePipeline}
              ariaLabel="Selecionar pipeline ativo"
              options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
            />
            <button type="button" className="btn secondary" onClick={() => setNewPipeline({ name: "Pipeline de Protótipos", template: "prototipos", stages: templateStages("prototipos") })}>+ Pipeline</button>
            <button type="button" className="btn" onClick={openNewDeal} disabled={!contacts.length || !firstStageId}>+ Oportunidade</button>
          </div>
          <p className="muted">Use pipelines separados para comercial, protótipos, pós-venda ou execução. Cada pipeline tem etapas próprias.</p>
        </div>
        <div className="pipeline-control-kpis" aria-label="Resumo do funil">
          <span><strong>{activeDealsCount}</strong><small>ativas</small></span>
          <span><strong>{proposalDeals}</strong><small>propostas</small></span>
          <span><strong>{staleDeals}</strong><small>paradas +7d</small></span>
          <span><strong>{wonDeals}</strong><small>ganhas</small></span>
          <b>{money(pipelineValue)}</b>
        </div>
      </div>

      <div className="pipeline-toolbar card pipeline-toolbar-v2 pipeline-toolbar-lean">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, empresa, telefone..." />
        <SmartSelect
          className="filter-smart-select"
          value={ownerFilter}
          onChange={setOwnerFilter}
          ariaLabel="Filtrar por responsável"
          options={[{ value: "todos", label: "Todos responsáveis" }, ...owners.map((owner) => ({ value: owner, label: owner }))]}
        />
        <SmartSelect
          className="filter-smart-select"
          value={temperatureFilter}
          onChange={(value) => setTemperatureFilter(value as "todos" | LeadTemperature)}
          ariaLabel="Filtrar por temperatura"
          options={temperatureOptions.map((option) => ({ value: option.value, label: option.label }))}
        />
        <SmartSelect
          className="filter-smart-select"
          value={ageFilter}
          onChange={setAgeFilter}
          ariaLabel="Filtrar por prazo"
          options={[
            { value: "todos", label: "Todos prazos" },
            { value: "7d", label: "Parados +7 dias" },
            { value: "14d", label: "Parados +14 dias" },
            { value: "sem-previsao", label: "Sem previsão" },
          ]}
        />
        <div className="pipeline-view-toggle-v2" aria-label="Modo de visualização">
          <button type="button" className={viewMode === "board" ? "active" : ""} onClick={() => setViewMode("board")}>Kanban</button>
          <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>Lista</button>
        </div>
        <button type="button" className={`btn secondary ${showLost ? "active-filter" : ""}`} onClick={() => setShowLost((current) => !current)}>
          {showLost ? "Ocultar perdidos" : "Perdidos"}
        </button>
      </div>

      {message && <div className="inline-alert">{message}</div>}

      {priorityDeals[0] && (
        <div className="pipeline-next-compact">
          <span>Próximo:</span>
          <strong>{priorityDeals[0].title}</strong>
          <small>{contactsById.get(priorityDeals[0].contactId)?.name || "Lead"} • {stageLabel(activeStages, priorityDeals[0].stageId)}</small>
          <Link className="btn mini secondary" href={`/inbox?contact=${priorityDeals[0].contactId}`}>Abrir atendimento</Link>
        </div>
      )}

      {viewMode === "board" ? (
        <div className="pipeline pipeline-pro pipeline-pro-v2 pipeline-board-lean" aria-label="Funil de vendas">
          {activeStages.map((stage) => {
            const stageDeals = visibleDeals.filter((deal) => deal.stageId === stage.id);
            const total = stageDeals.reduce((sum, deal) => sum + deal.value, 0);

            return (
              <section
                key={stage.id}
                className={`stage stage-pro stage-pro-v2 stage-lean ${draggingId ? "stage-drop-ready" : ""}`}
                style={{ "--stage-color": stage.color } as React.CSSProperties}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingId) moveDeal(draggingId, stage.id);
                  setDraggingId(null);
                }}
              >
                <div className="stage-head stage-head-pro stage-head-pro-v2 stage-head-lean">
                  <div>
                    <span className="stage-title">
                      <span className="dot" style={{ background: stage.color }} />
                      {stage.title}
                    </span>
                    <span className="stage-total">{money(total)}</span>
                  </div>
                  <span className="badge">{stageDeals.length}</span>
                </div>

                <div className="stage-card-list stage-card-list-v2">
                  {stageDeals.length === 0 && <div className="stage-empty stage-empty-v2">Solte aqui</div>}
                  {stageDeals.map((deal) => <DealCard key={deal.id} deal={deal} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pipeline-list-view-v2 card" aria-label="Lista de oportunidades">
          <div className="pipeline-list-head-v2">
            <span>Oportunidade</span>
            <span>Etapa</span>
            <span>Responsável</span>
            <span>Valor</span>
            <span>Ação</span>
          </div>
          {visibleDeals.length === 0 ? (
            <div className="stage-empty">Nenhuma oportunidade no filtro atual.</div>
          ) : (
            visibleDeals.map((deal) => {
              const contact = contactsById.get(deal.contactId);
              return (
                <article key={deal.id} className="pipeline-list-row-v2">
                  <div>
                    <strong>{deal.title}</strong>
                    <p>{contact?.name || "Lead"} • {contact?.company || "sem empresa"}</p>
                  </div>
                  <span>{stageLabel(activeStages, deal.stageId)}</span>
                  <span>{contact?.owner || "NextLead"}</span>
                  <b>{money(deal.value)}</b>
                  <div>
                    <Link className="btn mini secondary" href={`/inbox?contact=${deal.contactId}`}>Abrir</Link>
                    <button type="button" className="btn mini secondary" onClick={() => openEditor(deal)}>Editar</button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {newPipeline && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Criar pipeline">
          <form className="modal-card modal-card-compact" onSubmit={createPipeline}>
            <div className="topbar" style={{ marginBottom: 14 }}>
              <div>
                <p className="eyebrow">Novo pipeline</p>
                <h2>Criar processo</h2>
              </div>
              <button type="button" className="btn mini secondary" onClick={() => setNewPipeline(null)}>Fechar</button>
            </div>
            <label className="form-row">
              Nome do pipeline
              <input className="input" value={newPipeline.name} onChange={(event) => setNewPipeline({ ...newPipeline, name: event.target.value })} />
            </label>
            <label className="form-row" style={{ marginTop: 12 }}>
              Modelo inicial
              <select
                className="select"
                value={newPipeline.template}
                onChange={(event) => {
                  const template = event.target.value as PipelineTemplateKey;
                  setNewPipeline({
                    ...newPipeline,
                    template,
                    stages: templateStages(template),
                  });
                }}
              >
                {Object.entries(PIPELINE_TEMPLATES).map(([key, template]) => (
                  <option key={key} value={key}>{template.label}</option>
                ))}
              </select>
            </label>

            <div className="stage-editor-block">
              <div className="stage-editor-head">
                <div>
                  <strong>Etapas do processo</strong>
                  <span>Edite nome, ordem e cor antes de criar.</span>
                </div>
                <button
                  type="button"
                  className="btn mini secondary"
                  onClick={() => setNewPipeline({
                    ...newPipeline,
                    stages: [...newPipeline.stages, { title: `Nova etapa ${newPipeline.stages.length + 1}`, color: "#06b6d4" }],
                  })}
                >
                  + Etapa
                </button>
              </div>

              <div className="stage-editor-list">
                {newPipeline.stages.map((stage, index) => (
                  <div className="stage-editor-row" key={`${stage.title}-${index}`}>
                    <span className="stage-editor-number">{index + 1}</span>
                    <input
                      className="stage-color-input"
                      type="color"
                      value={stage.color}
                      aria-label={`Cor da etapa ${stage.title}`}
                      onChange={(event) => {
                        const stagesDraft = [...newPipeline.stages];
                        stagesDraft[index] = { ...stage, color: event.target.value };
                        setNewPipeline({ ...newPipeline, stages: stagesDraft });
                      }}
                    />
                    <input
                      className="input"
                      value={stage.title}
                      onChange={(event) => {
                        const stagesDraft = [...newPipeline.stages];
                        stagesDraft[index] = { ...stage, title: event.target.value };
                        setNewPipeline({ ...newPipeline, stages: stagesDraft });
                      }}
                    />
                    <div className="stage-editor-actions">
                      <button
                        type="button"
                        className="btn mini secondary"
                        disabled={index === 0}
                        onClick={() => {
                          const stagesDraft = [...newPipeline.stages];
                          [stagesDraft[index - 1], stagesDraft[index]] = [stagesDraft[index], stagesDraft[index - 1]];
                          setNewPipeline({ ...newPipeline, stages: stagesDraft });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn mini secondary"
                        disabled={index === newPipeline.stages.length - 1}
                        onClick={() => {
                          const stagesDraft = [...newPipeline.stages];
                          [stagesDraft[index + 1], stagesDraft[index]] = [stagesDraft[index], stagesDraft[index + 1]];
                          setNewPipeline({ ...newPipeline, stages: stagesDraft });
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn mini danger"
                        disabled={newPipeline.stages.length <= 1}
                        onClick={() => setNewPipeline({
                          ...newPipeline,
                          stages: newPipeline.stages.filter((_, stageIndex) => stageIndex !== index),
                        })}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="stage-preview-line" aria-label="Prévia das etapas">
                {cleanStageDrafts(newPipeline.stages).map((stage, index) => (
                  <span key={`${stage.title}-preview-${index}`} style={{ "--stage-color": stage.color } as React.CSSProperties}>
                    {stage.title}
                  </span>
                ))}
              </div>
            </div>
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar pipeline"}</button>
              <button className="btn secondary" type="button" onClick={() => setNewPipeline(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {newDeal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Criar oportunidade">
          <form className="modal-card modal-card-compact" onSubmit={createDeal}>
            <div className="topbar" style={{ marginBottom: 14 }}>
              <div>
                <p className="eyebrow">Nova oportunidade</p>
                <h2>{activePipeline?.name || "Pipeline"}</h2>
              </div>
              <button type="button" className="btn mini secondary" onClick={() => setNewDeal(null)}>Fechar</button>
            </div>
            <label className="form-row">
              Cliente
              <select className="select" value={newDeal.contactId} onChange={(event) => setNewDeal({ ...newDeal, contactId: event.target.value })}>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} • {contact.company || "sem empresa"}</option>)}
              </select>
            </label>
            <label className="form-row" style={{ marginTop: 12 }}>
              Título
              <input className="input" value={newDeal.title} onChange={(event) => setNewDeal({ ...newDeal, title: event.target.value })} />
            </label>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="form-row">
                Valor
                <input className="input" type="number" min="0" step="50" value={newDeal.value} onChange={(event) => setNewDeal({ ...newDeal, value: event.target.value })} />
              </label>
              <label className="form-row">
                Previsão
                <input className="input" type="date" value={newDeal.expectedClose} onChange={(event) => setNewDeal({ ...newDeal, expectedClose: event.target.value })} />
              </label>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>Será criada na primeira etapa: {stageLabel(activeStages, firstStageId)}.</p>
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={saving || !newDeal.contactId}>{saving ? "Criando..." : "Criar oportunidade"}</button>
              <button className="btn secondary" type="button" onClick={() => setNewDeal(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

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
                  {activeStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
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

"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Contact, Deal, LeadTemperature, Message, ServiceOrder, ServiceOrderStatus, Stage } from "@/lib/types";
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


type ProposalModel = "landing-start" | "landing-pro" | "crm-whatsapp" | "automation-ia";

const proposalModels: Record<ProposalModel, { label: string; headline: string; scope: string[]; defaultDeadline: string }> = {
  "landing-start": {
    label: "Landing Page Start",
    headline: "uma landing page objetiva para apresentar sua empresa e gerar contatos pelo WhatsApp",
    defaultDeadline: "5 a 7 dias úteis após aprovação do conteúdo",
    scope: [
      "estrutura de página responsiva",
      "copy comercial para apresentação do serviço",
      "botão direto para WhatsApp",
      "formulário simples de captação",
      "publicação em link online",
    ],
  },
  "landing-pro": {
    label: "Landing Page Profissional",
    headline: "uma landing page mais completa, com posicionamento premium e foco em conversão",
    defaultDeadline: "7 a 12 dias úteis após aprovação do conteúdo",
    scope: [
      "design personalizado e responsivo",
      "copy comercial por seções",
      "formulário integrado ao CRM",
      "botões de WhatsApp e chamadas estratégicas",
      "ajustes finais para melhorar confiança e conversão",
    ],
  },
  "crm-whatsapp": {
    label: "CRM + WhatsApp",
    headline: "um fluxo para receber leads, responder pelo WhatsApp e acompanhar oportunidades pelo funil",
    defaultDeadline: "10 a 15 dias úteis após alinhamento do processo",
    scope: [
      "CRM online com contatos e histórico",
      "Inbox conectado ao WhatsApp",
      "funil comercial por etapas",
      "follow-ups e próximas ações",
      "painel de acompanhamento comercial",
    ],
  },
  "automation-ia": {
    label: "Automação / IA",
    headline: "uma camada de automação para ganhar velocidade no atendimento e padronizar respostas",
    defaultDeadline: "15 a 25 dias úteis conforme integrações necessárias",
    scope: [
      "mapeamento do processo de atendimento",
      "respostas sugeridas e classificação de leads",
      "automação de follow-ups",
      "integração com CRM e WhatsApp",
      "testes e ajustes de comportamento",
    ],
  },
};



const serviceOrderStatusLabels: Record<ServiceOrderStatus, string> = {
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

const closedServiceOrderStatuses: ServiceOrderStatus[] = ["concluida", "entregue", "cancelada"];

function mapApiServiceOrder(serviceOrder: any): ServiceOrder {
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

function contactInitials(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 1) || "?").toUpperCase();
}

function previewMessage(message?: Message) {
  if (!message) return "Sem mensagens ainda";
  if (message.mediaUrl && (message.type || "").includes("image")) return "📷 Imagem";
  if ((message.type || "").includes("audio") || message.body.includes("[áudio]")) return "🎙️ Áudio";
  if ((message.type || "").includes("video") || message.body.includes("[vídeo]")) return "🎬 Vídeo";
  if ((message.type || "").includes("document")) return "📄 Documento";
  return message.body.replace(/\s+/g, " ").trim() || "Mensagem";
}

function isMediaImage(message: Message) {
  const type = String(message.type || "").toLowerCase();
  return Boolean(message.mediaUrl && (type.includes("image") || message.mediaUrl.match(/\.(png|jpe?g|webp|gif)(\?|$)/i)));
}

function isMediaVideo(message: Message) {
  const type = String(message.type || "").toLowerCase();
  return Boolean(message.mediaUrl && (type.includes("video") || message.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i)));
}

function isMediaAudio(message: Message) {
  const type = String(message.type || "").toLowerCase();
  return Boolean(message.mediaUrl && (type.includes("audio") || message.mediaUrl.match(/\.(mp3|ogg|opus|wav|m4a)(\?|$)/i)));
}

function isMediaDocument(message: Message) {
  const type = String(message.type || "").toLowerCase();
  const body = String(message.body || "").toLowerCase();
  return Boolean(
    message.mediaUrl &&
      (type.includes("document") ||
        type.includes("arquivo") ||
        body.includes("[arquivo]") ||
        body.includes("[documento]") ||
        message.mediaUrl.match(/\.(pdf|docx?|xlsx?|pptx?|zip|rar)(\?|$)/i) ||
        message.mediaUrl.startsWith("data:application/")),
  );
}

function messageNeedsMediaResolve(message: Message) {
  const type = String(message.type || "").toLowerCase();
  const body = String(message.body || "").toLowerCase();
  if (message.mediaUrl) return false;
  return (
    type.includes("image") ||
    type.includes("video") ||
    type.includes("audio") ||
    type.includes("document") ||
    body.includes("[áudio]") ||
    body.includes("[audio]") ||
    body.includes("[imagem]") ||
    body.includes("[vídeo]") ||
    body.includes("[video]") ||
    body.includes("[arquivo]") ||
    body.includes("[documento]")
  );
}

function mediaButtonLabel(message: Message) {
  const type = String(message.type || "").toLowerCase();
  const body = String(message.body || "").toLowerCase();
  if (type.includes("audio") || body.includes("[áudio]") || body.includes("[audio]")) return "Carregar áudio";
  if (type.includes("image") || body.includes("[imagem]")) return "Carregar imagem";
  if (type.includes("video") || body.includes("[vídeo]") || body.includes("[video]")) return "Carregar vídeo";
  return "Carregar arquivo";
}

export function InboxClient({
  contacts: initialContacts,
  messages: initialMessages,
  deals: initialDeals,
  stages,
  activities: initialActivities,
  serviceOrders: initialServiceOrders,
  initialSelectedId,
}: {
  contacts: Contact[];
  messages: Message[];
  deals: Deal[];
  stages: Stage[];
  activities: Activity[];
  serviceOrders: ServiceOrder[];
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
  const [activePanel, setActivePanel] = useState<"acoes" | "ordens" | "proposta" | "assistente" | "historico">("acoes");
  const [showInspector, setShowInspector] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [updatingLead, setUpdatingLead] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingDeal, setEditingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>(initialServiceOrders);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [showQuickContact, setShowQuickContact] = useState(false);
  const [creatingQuickContact, setCreatingQuickContact] = useState(false);
  const [quickContact, setQuickContact] = useState({ name: "", phone: "", company: "", message: "" });
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [resolvingMediaIds, setResolvingMediaIds] = useState<Record<string, boolean>>({});
  const [showOrderDraft, setShowOrderDraft] = useState(false);
  const [orderDraft, setOrderDraft] = useState({
    title: "",
    description: "",
    status: "aberta" as ServiceOrderStatus,
    priority: "morno" as LeadTemperature,
    owner: "NextLead",
    estimatedValue: "0",
    dueAt: "",
    internalNotes: "",
  });
  const [followUpAt, setFollowUpAt] = useState(tomorrowBusinessTime);
  const [dealForm, setDealForm] = useState({ title: "", value: "", expectedClose: "" });
  const [proposalModel, setProposalModel] = useState<ProposalModel>("landing-pro");
  const [proposalDeadline, setProposalDeadline] = useState("7 a 12 dias úteis após aprovação do conteúdo");
  const [proposalPayment, setProposalPayment] = useState("50% para iniciar e 50% na entrega");
  const [lastGeneratedProposal, setLastGeneratedProposal] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
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
  const proposalStage = useMemo(() => stages.find((stage) => stage.title.toLowerCase().includes("proposta")), [stages]);
  const threadMessages = useMemo(() => {
    return messages
      .filter((message) => message.contactId === selected?.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, selected?.id]);
  const contactActivities = useMemo(() => activities.filter((activity) => activity.contactId === selected?.id), [activities, selected?.id]);
  const selectedServiceOrders = useMemo(() => serviceOrders.filter((order) => order.contactId === selected?.id), [serviceOrders, selected?.id]);
  const activeServiceOrders = useMemo(() => selectedServiceOrders.filter((order) => !["concluida", "entregue", "cancelada"].includes(order.status)), [selectedServiceOrders]);
  const latestMessageByContact = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) {
      const previous = map.get(message.contactId);
      if (!previous || new Date(message.createdAt).getTime() > new Date(previous.createdAt).getTime()) map.set(message.contactId, message);
    }
    return map;
  }, [messages]);

  function hasUnreadInbound(contactId: string) {
    const latest = latestMessageByContact.get(contactId);
    return Boolean(latest?.direction === "inbound" && latest.status !== "read");
  }

  const orderedContacts = useMemo(() => {
    return contacts
      .slice()
      .sort((a, b) => {
        const lastA = latestMessageByContact.get(a.id)?.createdAt || a.lastMessageAt;
        const lastB = latestMessageByContact.get(b.id)?.createdAt || b.lastMessageAt;
        return new Date(lastB).getTime() - new Date(lastA).getTime();
      });
  }, [contacts, latestMessageByContact]);

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

    selectedServiceOrders.slice(0, 6).forEach((order) => {
      items.push({
        id: `service-order-${order.id}`,
        date: order.updatedAt || order.createdAt,
        title: `OS ${serviceOrderStatusLabels[order.status]}`,
        detail: `${order.code} · ${order.title}`,
        tone: closedServiceOrderStatuses.includes(order.status) ? "success" : "info",
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12);
  }, [contactActivities, selectedDeal, selectedServiceOrders, selectedStage?.title, threadMessages]);

  async function refreshInboxData() {
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.contacts) return;

      const nextContacts = result.contacts as Contact[];
      const nextMessages = result.messages as Message[];
      const nextDeals = result.deals as Deal[];
      const nextActivities = result.activities as Activity[];
      const nextServiceOrders = result.serviceOrders as ServiceOrder[];

      setContacts(nextContacts);
      setDeals(nextDeals);
      setActivities(nextActivities);
      setServiceOrders(nextServiceOrders);
      setMessages((current) => {
        const serverIds = new Set(nextMessages.map((message) => message.id));
        const optimistic = current.filter((message) => String(message.id).startsWith("local-") && !serverIds.has(message.id));
        return [...nextMessages, ...optimistic].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
      setSelectedId((current) => (nextContacts.some((contact) => contact.id === current) ? current : nextContacts[0]?.id));
      setLastSyncAt(new Date().toISOString());
    } catch {
      // Polling é complementar; se falhar, mantém a tela atual.
    }
  }

  useEffect(() => {
    setContacts(initialContacts);
    setMessages(initialMessages);
    setDeals(initialDeals);
    setActivities(initialActivities);
    setServiceOrders(initialServiceOrders);
    setSelectedId((current) => {
      const urlSelected = initialContacts.find((contact) => contact.id === initialSelectedId)?.id;
      if (urlSelected) return urlSelected;
      return initialContacts.some((contact) => contact.id === current) ? current : initialContacts[0]?.id;
    });
  }, [initialActivities, initialContacts, initialDeals, initialMessages, initialSelectedId, initialServiceOrders]);

  useEffect(() => {
    const missing = contacts
      .filter((contact) => !avatarUrls[contact.id] && contact.phone)
      .slice(0, 12);

    if (!missing.length) return;

    let cancelled = false;

    missing.forEach(async (contact) => {
      try {
        const response = await fetch("/api/whatsapp/profile-picture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: contact.phone }),
        });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && result?.url) {
          setAvatarUrls((current) => ({ ...current, [contact.id]: result.url }));
        }
      } catch {
        // Foto real é complementar. Se falhar, mantém iniciais do contato.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [contacts, avatarUrls]);

  useEffect(() => {
    function refreshOnReturn() {
      refreshInboxData();
    }

    function refreshOnVisible() {
      if (document.visibilityState === "visible") refreshInboxData();
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshInboxData();
    }, 4500);

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, []);

  useEffect(() => {
    if (!isRecordingAudio) {
      setRecordingSeconds(0);
      return;
    }

    setRecordingSeconds(0);
    const interval = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRecordingAudio]);

  useEffect(() => {
    if (!selected) return;
    const hasUnread = threadMessages.some((message) => message.direction === "inbound" && message.status !== "read");
    if (!hasUnread) return;

    setMessages((current) =>
      current.map((message) =>
        message.contactId === selected.id && message.direction === "inbound" && message.status !== "read"
          ? { ...message, status: "read" }
          : message,
      ),
    );

    fetch("/api/inbox/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: selected.id }),
    }).catch(() => null);
  }, [selected?.id, threadMessages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedId, threadMessages.length]);

  useEffect(() => {
    setEditingDeal(false);
    setAssistantNote(null);
    setActionMessage(null);
    setFollowUpAt(tomorrowBusinessTime());
    setProposalModel("landing-pro");
    setProposalDeadline(proposalModels["landing-pro"].defaultDeadline);
    setProposalPayment("50% para iniciar e 50% na entrega");
    setLastGeneratedProposal(null);
    setActivePanel("acoes");
    setShowInspector(false);
    setShowOrderDraft(false);
  }, [selected?.id]);

  function openInspector(panel: "acoes" | "ordens" | "proposta" | "assistente" | "historico") {
    setActivePanel(panel);
    setShowInspector(true);
  }

  async function logCommercialHistory(title: string, dueAt = new Date().toISOString()) {
    if (!selected) return;
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selected.id, title, dueAt, done: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.activity) {
        setActivities((current) => [
          ...current,
          {
            id: result.activity.id,
            contactId: result.activity.contact_id || selected.id,
            title: result.activity.title || title,
            dueAt: result.activity.due_at || dueAt,
            done: Boolean(result.activity.done),
          },
        ]);
      }
    } catch {
      // Histórico é auxiliar: não bloqueia o fluxo principal.
    }
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

  function openServiceOrderDraft(forceNew = false) {
    if (!selected) return;

    if (!forceNew && activeServiceOrders.length > 0) {
      setActivePanel("ordens");
      setShowInspector(true);
      setShowOrderDraft(false);
      setActionMessage("Este lead já tem OS aberta. Revise a OS existente antes de criar outra.");
      return;
    }

    setOrderDraft({
      title: selectedDeal?.title || `Atendimento operacional - ${selected.name}`,
      description: `Demanda criada a partir do atendimento com ${selected.name}.`,
      status: "aberta",
      priority: selected.temperature,
      owner: selected.owner || "NextLead",
      estimatedValue: String(selectedDeal?.value || 0),
      dueAt: "",
      internalNotes: "",
    });
    setActivePanel("ordens");
    setShowInspector(true);
    setShowOrderDraft(true);
    setActionMessage(null);
  }

  async function createServiceOrderFromInbox() {
    if (!selected) return;

    if (!orderDraft.title.trim()) {
      setActionMessage("Informe o serviço/demanda antes de criar a OS.");
      return;
    }

    setCreatingOrder(true);
    setActionMessage(null);

    try {
      const response = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selected.id,
          dealId: selectedDeal?.id || null,
          ...orderDraft,
          dueAt: orderDraft.dueAt || null,
          preventDuplicate: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409 && result.existingOrder) {
          const existing = mapApiServiceOrder(result.existingOrder);
          setServiceOrders((current) => (current.some((order) => order.id === existing.id) ? current : [existing, ...current]));
          setShowOrderDraft(false);
          setActivePanel("ordens");
          throw new Error(`Já existe uma OS aberta para este lead: ${existing.code}.`);
        }
        throw new Error(result.detail || result.error || "Erro ao criar ordem de serviço.");
      }
      if (result.serviceOrder) {
        const saved = mapApiServiceOrder(result.serviceOrder);
        setServiceOrders((current) => [saved, ...current.filter((order) => order.id !== saved.id)]);
      }
      setActionMessage(`OS criada${result.serviceOrder?.code ? `: ${result.serviceOrder.code}` : ""}.`);
      await logCommercialHistory(`OS criada${result.serviceOrder?.code ? `: ${result.serviceOrder.code}` : ""}`);
      setShowOrderDraft(false);
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao criar ordem de serviço.");
    } finally {
      setCreatingOrder(false);
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

  async function generateProposalDraft() {
    if (!selected) return;
    const name = firstName(selected.name);
    const model = proposalModels[proposalModel];
    const dealTitle = selectedDeal?.title || model.label;
    const valueText = selectedDeal?.value ? money(selectedDeal.value) : "valor a definir após alinhamento final";
    const deadlineText = proposalDeadline.trim() || model.defaultDeadline;
    const paymentText = proposalPayment.trim() || "condições a combinar";
    const scope = model.scope.map((item) => `• ${item}`).join("\n");

    const text = `*Proposta NextLead — ${model.label}*

Olá ${name}, tudo bem?

Com base no que conversamos, minha sugestão é avançarmos com ${model.headline}.

*Escopo previsto:*
${scope}

*Investimento:* ${valueText}
*Prazo estimado:* ${deadlineText}
*Condição:* ${paymentText}

O objetivo é deixar sua empresa com uma presença mais profissional, facilitar o contato pelo WhatsApp e organizar melhor as oportunidades que chegarem.

Se fizer sentido para você, o próximo passo é confirmarmos o escopo e eu já organizo o início do projeto.`;

    setDraft(text);
    setLastGeneratedProposal(text);
    setActionMessage("Proposta profissional gerada no campo de mensagem. Revise antes de enviar.");
    await logCommercialHistory(`Proposta gerada: ${dealTitle}`);
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

  async function createQuickContact() {
    const name = quickContact.name.trim();
    const phone = quickContact.phone.trim();
    if (!name || !phone) {
      setActionMessage("Informe nome e WhatsApp para criar o contato rápido.");
      return;
    }

    setCreatingQuickContact(true);
    setActionMessage(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          company: quickContact.company,
          source: "Manual",
          interest: "Atendimento WhatsApp",
          owner: "NextLead",
          temperature: "morno",
          value: 0,
          tags: "manual,inbox",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao criar contato.");

      const contactId = result.contactId || `local-${Date.now()}`;
      const now = new Date().toISOString();
      const newContact: Contact = {
        id: contactId,
        name,
        phone,
        company: quickContact.company || undefined,
        source: "Manual",
        owner: "NextLead",
        temperature: "morno",
        tags: ["manual", "inbox"],
        lastMessageAt: now,
      };

      setContacts((current) => [newContact, ...current.filter((contact) => contact.id !== contactId)]);
      setSelectedId(contactId);
      setDraft(quickContact.message.trim());
      setQuickContact({ name: "", phone: "", company: "", message: "" });
      setShowQuickContact(false);
      setActionMessage("Contato criado. Revise a mensagem e clique em Enviar.");
      router.refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Erro ao criar contato.");
    } finally {
      setCreatingQuickContact(false);
    }
  }

  async function resolveMessageMedia(message: Message) {
    if (!messageNeedsMediaResolve(message) || resolvingMediaIds[message.id]) return;
    setResolvingMediaIds((current) => ({ ...current, [message.id]: true }));
    setActionMessage(null);

    try {
      const response = await fetch("/api/whatsapp/media-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.mediaUrl) throw new Error(result.error || "Não foi possível carregar a mídia.");

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? {
                ...item,
                mediaUrl: result.mediaUrl,
                fileName: result.fileName || item.fileName,
                type: result.mediaType || item.type,
              }
            : item,
        ),
      );
      setActionMessage("Mídia carregada no atendimento.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível carregar a mídia.");
    } finally {
      setResolvingMediaIds((current) => ({ ...current, [message.id]: false }));
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

      if (response.ok && selectedDeal && proposalStage && (body === lastGeneratedProposal || body.includes("Proposta NextLead"))) {
        await fetch("/api/pipeline/deals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId: selectedDeal.id, stageId: proposalStage.id, status: "aberto", lostReason: null }),
        }).catch(() => null);
        setDeals((current) => current.map((deal) => (deal.id === selectedDeal.id ? { ...deal, stageId: proposalStage.id, status: "aberto", lostReason: undefined } : deal)));
        await logCommercialHistory("Proposta enviada pelo WhatsApp");
        setLastGeneratedProposal(null);
      }
    } catch {
      setMessages((current) => current.map((message) => (message.id === optimistic.id ? { ...message, status: "failed" } : message)));
    }
  }

  function fileToDataUrl(file: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(file);
    });
  }

  function inferMediaTypeFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
    const mime = mimeType.toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  }

  async function sendMediaBlob(blob: Blob, fileName: string, caption = "") {
    if (!selected || sendingMedia) return;

    const maxSize = 8 * 1024 * 1024;
    if (blob.size > maxSize) {
      setActionMessage("Arquivo muito grande para este envio inicial. Use até 8 MB por enquanto.");
      return;
    }

    const mimeType = blob.type || "application/octet-stream";
    const mediaType = inferMediaTypeFromMime(mimeType);
    const mediaUrl = await fileToDataUrl(blob);
    const label = caption.trim() || (mediaType === "image" ? `[imagem] ${fileName}` : mediaType === "video" ? `[vídeo] ${fileName}` : mediaType === "audio" ? `[áudio] ${fileName}` : `[arquivo] ${fileName}`);

    const optimistic: Message = {
      id: `local-media-${Date.now()}`,
      contactId: selected.id,
      direction: "outbound",
      body: label,
      status: "queued",
      type: mediaType,
      mediaUrl,
      fileName,
      createdAt: new Date().toISOString(),
    };

    setSendingMedia(true);
    setMessages((current) => [...current, optimistic]);
    setShowAttachmentMenu(false);

    try {
      const response = await fetch("/api/whatsapp/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.phone,
          contactId: selected.id,
          media: mediaUrl,
          mimeType,
          fileName,
          caption,
          mediaType,
        }),
      });
      const result = await response.json().catch(() => ({}));
      setMessages((current) =>
        current.map((message) =>
          message.id === optimistic.id
            ? { ...message, status: response.ok ? "sent" : "failed", providerMessageId: result.providerMessageId }
            : message,
        ),
      );
      if (!response.ok) setActionMessage(result.error || "Erro ao enviar mídia.");
      else setActionMessage(mediaType === "audio" ? "Áudio enviado." : "Mídia enviada.");
      refreshInboxData();
    } catch (error) {
      setMessages((current) => current.map((message) => (message.id === optimistic.id ? { ...message, status: "failed" } : message)));
      setActionMessage(error instanceof Error ? error.message : "Erro ao enviar mídia.");
    } finally {
      setSendingMedia(false);
    }
  }

  async function handleMediaFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await sendMediaBlob(file, file.name);
  }

  async function toggleAudioRecording() {
    if (isRecordingAudio) {
      setActionMessage("Finalizando e enviando áudio...");
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setActionMessage("Este navegador não permite gravar áudio direto pelo CRM.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setIsRecordingAudio(false);
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg") || mimeType.includes("opus") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size > 0) await sendMediaBlob(blob, `audio-${Date.now()}.${extension}`);
      };

      recorder.start();
      setRecordingSeconds(0);
      setIsRecordingAudio(true);
      setActionMessage("Gravando áudio. Clique no microfone novamente para enviar.");
    } catch {
      setIsRecordingAudio(false);
      setActionMessage("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function formatRecordingTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
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
        <div className="thread-list-head whatsapp-thread-head">
          <div>
            <h2>Conversas</h2>
            <span className="muted">WhatsApp centralizado</span>
          </div>
          <button className="new-chat-button" onClick={() => setShowQuickContact(true)} aria-label="Novo contato rápido">+</button>
        </div>

        <div className="thread-stack whatsapp-thread-stack">
          {orderedContacts.map((contact) => {
            const latest = latestMessageByContact.get(contact.id);
            const waitingReply = hasUnreadInbound(contact.id);
            const avatarUrl = avatarUrls[contact.id] || contact.avatarUrl;
            return (
              <button
                key={contact.id}
                className={`thread thread-pro whatsapp-thread ${contact.id === selected?.id ? "active" : ""} ${waitingReply ? "waiting-reply" : ""}`}
                onClick={() => {
                  setSelectedId(contact.id);
                  setActionMessage(null);
                }}
              >
                <span className="avatar contact-photo-fallback">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : contactInitials(contact.name)}
                </span>
                <span className="thread-copy">
                  <span className="thread-title-line">
                    <strong>{contact.name}</strong>
                    {latest && <small>{shortDate(latest.createdAt)}</small>}
                  </span>
                  <span className="muted thread-preview">{previewMessage(latest).slice(0, 54)}</span>
                  <span className="thread-company-line">{contact.company || contact.source}</span>
                </span>
                <span className="thread-meta-side">
                  {waitingReply && <span className="unread-indicator" title="Mensagem nova" aria-label="Mensagem nova" />}
                  <span className={`thread-temp ${contact.temperature}`}>{contact.temperature}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="chat chat-fixed chat-pro">
        <header className="chat-head-pro">
          <div className="contact-title-block whatsapp-contact-title">
            <span className="avatar contact-photo-large contact-photo-fallback">
              {selected && (avatarUrls[selected.id] || selected.avatarUrl) ? <img src={avatarUrls[selected.id] || selected.avatarUrl} alt="" /> : contactInitials(selected?.name)}
            </span>
            <div>
              <span className="eyebrow-small">Contato em atendimento</span>
              <h2>{selected?.name}</h2>
              <span className="muted">{selected?.phone} • {selected?.company || "sem empresa"}</span>
            </div>
          </div>
          <div className="chat-head-actions-pro whatsapp-chat-actions">
            <label className="header-stage-field header-stage-whatsapp">
              <span>Etapa atual</span>
              <select
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
            <button className="btn mini secondary os-head-button" onClick={() => openInspector("ordens")}>
              {activeServiceOrders.length ? `${activeServiceOrders.length} OS aberta${activeServiceOrders.length > 1 ? "s" : ""}` : "OS"}
            </button>
            <button className="btn mini" onClick={() => openInspector("acoes")}>Ferramentas</button>
          </div>
        </header>

        <div className="messages messages-scroll messages-pro">
          {threadMessages.length === 0 && (
            <div className="message-empty">
              <p className="muted">Nenhuma mensagem ainda. Envie a primeira mensagem para testar o fluxo.</p>
            </div>
          )}
          {threadMessages.map((message) => {
            const isResolving = Boolean(resolvingMediaIds[message.id]);
            const fileName = message.fileName || message.body.replace(/^\[(arquivo|documento|áudio|audio|imagem|vídeo|video)\]\s*/i, "") || "mídia";
            return (
              <div key={message.id} className={`message whatsapp-bubble ${message.direction === "outbound" ? "outbound" : ""} ${message.status === "failed" ? "failed" : ""}`}>
                {isMediaImage(message) ? (
                  <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="message-media-link" title="Abrir imagem">
                    <img className="message-media-image" src={message.mediaUrl} alt={message.body || "Imagem recebida"} />
                  </a>
                ) : isMediaVideo(message) ? (
                  <video className="message-media-image" src={message.mediaUrl} controls />
                ) : isMediaAudio(message) ? (
                  <audio className="message-audio" src={message.mediaUrl} controls />
                ) : isMediaDocument(message) ? (
                  <div className="message-file-card">
                    <div className="message-file-icon">📄</div>
                    <div>
                      <strong>{fileName}</strong>
                      <span>Documento anexado</span>
                    </div>
                    <a href={message.mediaUrl} target="_blank" rel="noreferrer" download={message.fileName || undefined}>Abrir</a>
                  </div>
                ) : messageNeedsMediaResolve(message) ? (
                  <div className="message-file-card message-file-card-pending">
                    <div className="message-file-icon">↧</div>
                    <div>
                      <strong>{message.body}</strong>
                      <span>Mídia recebida. Clique para carregar no CRM.</span>
                    </div>
                    <button type="button" onClick={() => resolveMessageMedia(message)} disabled={isResolving}>
                      {isResolving ? "Carregando..." : mediaButtonLabel(message)}
                    </button>
                  </div>
                ) : null}
                {!isMediaDocument(message) && !isMediaAudio(message) && !isMediaImage(message) && !isMediaVideo(message) && <span>{message.body}</span>}
                {isMediaAudio(message) && <span className="message-media-caption">Áudio</span>}
                {isMediaImage(message) && message.body && !message.body.toLowerCase().includes("[imagem]") && <span className="message-media-caption">{message.body}</span>}
                {isMediaVideo(message) && <span className="message-media-caption">Vídeo</span>}
                <small>{shortDate(message.createdAt)} • {messageStatusLabel(message.status)}</small>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <footer className="composer composer-pro whatsapp-composer">
          <div className="composer-attachment-wrap">
            <button className="composer-plus" type="button" onClick={() => setShowAttachmentMenu((current) => !current)} aria-label="Anexar mídia">+</button>
            {showAttachmentMenu && (
              <div className="attachment-menu attachment-menu-files-only">
                <button type="button" onClick={() => mediaFileInputRef.current?.click()} disabled={sendingMedia}>
                  Imagem, vídeo ou arquivo
                </button>
              </div>
            )}
            <input
              ref={mediaFileInputRef}
              className="sr-only-file"
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleMediaFileChange}
            />
          </div>
          <textarea
            className="input composer-input"
            placeholder="Mensagem"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className={`composer-mic ${isRecordingAudio ? "recording" : ""}`}
            type="button"
            onClick={toggleAudioRecording}
            disabled={sendingMedia}
            aria-label={isRecordingAudio ? "Parar e enviar áudio" : "Gravar áudio"}
            title={isRecordingAudio ? "Clique para enviar" : "Gravar áudio"}
          >
            <span>{isRecordingAudio ? "■" : "🎙"}</span>
            {isRecordingAudio && <strong>{formatRecordingTime(recordingSeconds)}</strong>}
          </button>
          <button className="btn send-round" onClick={sendMessage} disabled={sendingMedia || isRecordingAudio}>{sendingMedia ? "Enviando..." : "Enviar"}</button>
        </footer>
      </div>


      {showQuickContact && (
        <div className="modal-backdrop quick-contact-backdrop" onClick={() => setShowQuickContact(false)}>
          <div className="modal-card quick-contact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow-small">Novo atendimento</p>
                <h2>Contato rápido</h2>
                <p className="muted">Crie um contato manual para iniciar uma conversa pelo WhatsApp.</p>
              </div>
              <button className="btn mini secondary" onClick={() => setShowQuickContact(false)}>Fechar</button>
            </div>
            <div className="form-grid compact-grid">
              <label className="form-row">Nome
                <input className="input" value={quickContact.name} onChange={(event) => setQuickContact((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do contato" />
              </label>
              <label className="form-row">WhatsApp
                <input className="input" value={quickContact.phone} onChange={(event) => setQuickContact((current) => ({ ...current, phone: event.target.value }))} placeholder="51999999999" />
              </label>
            </div>
            <label className="form-row">Empresa / origem
              <input className="input" value={quickContact.company} onChange={(event) => setQuickContact((current) => ({ ...current, company: event.target.value }))} placeholder="Empresa, indicação, Instagram..." />
            </label>
            <label className="form-row">Mensagem inicial opcional
              <textarea className="input" value={quickContact.message} onChange={(event) => setQuickContact((current) => ({ ...current, message: event.target.value }))} placeholder="Digite um rascunho para já deixar pronto no chat." />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={createQuickContact} disabled={creatingQuickContact}>
                {creatingQuickContact ? "Criando..." : "Criar e abrir conversa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInspector && <button className="inspector-backdrop" aria-label="Fechar painel" onClick={() => setShowInspector(false)} />}

      <aside className="lead-inspector" aria-label="Painel do lead">
        <div className="inspector-drawer-head">
          <div>
            <span className="eyebrow-small">Painel do lead</span>
            <strong>{selected?.name}</strong>
          </div>
          <button className="btn mini secondary" onClick={() => setShowInspector(false)}>Fechar</button>
        </div>

        <div className="inspector-scroll-area">
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
          <button className={activePanel === "ordens" ? "active" : ""} onClick={() => setActivePanel("ordens")}>OS</button>
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


          {activePanel === "ordens" && (
            <div className="inspector-section order-panel-whatsapp">
              <div className="inspector-headline">
                <span className="eyebrow-small">Execução</span>
                <strong>Ordens deste lead</strong>
              </div>
              <p className="muted tool-hint">Antes de criar uma nova OS, confira se já existe uma demanda aberta para este atendimento.</p>

              <div className="inbox-orders-list">
                {selectedServiceOrders.length === 0 ? (
                  <div className="empty-mini-card">
                    <strong>Nenhuma OS criada.</strong>
                    <span>Quando o atendimento virar execução, crie a primeira ordem aqui.</span>
                  </div>
                ) : (
                  selectedServiceOrders.map((order) => (
                    <div key={order.id} className={`inbox-order-card ${closedServiceOrderStatuses.includes(order.status) ? "closed" : "open"}`}>
                      <div>
                        <strong>{order.code}</strong>
                        <span>{order.title}</span>
                        <small>{serviceOrderStatusLabels[order.status]} • {money(order.finalValue || order.estimatedValue)}</small>
                      </div>
                      <a className="btn mini secondary" href="/ordens">Abrir</a>
                    </div>
                  ))
                )}
              </div>

              {!showOrderDraft && (
                <div className="os-create-actions">
                  {activeServiceOrders.length > 0 ? (
                    <>
                      <span className="duplicate-os-warning">Este lead já tem {activeServiceOrders.length} OS aberta{activeServiceOrders.length > 1 ? "s" : ""}. Evite criar duplicada.</span>
                      <button className="btn mini secondary" onClick={() => openServiceOrderDraft(true)} disabled={!selected}>Criar outra mesmo assim</button>
                    </>
                  ) : (
                    <button className="btn mini" onClick={() => openServiceOrderDraft(true)} disabled={!selected}>Criar OS deste lead</button>
                  )}
                </div>
              )}

              {showOrderDraft && (
                <div className="inbox-os-draft">
                  <div className="inspector-headline compact-headline">
                    <span className="eyebrow-small">Conferência</span>
                    <strong>Revise antes de salvar</strong>
                  </div>
                  <label className="form-row">Serviço / demanda
                    <input className="input input-compact" value={orderDraft.title} onChange={(event) => setOrderDraft((current) => ({ ...current, title: event.target.value }))} />
                  </label>
                  <div className="form-grid compact-grid">
                    <label className="form-row">Status
                      <select className="input input-compact" value={orderDraft.status} onChange={(event) => setOrderDraft((current) => ({ ...current, status: event.target.value as ServiceOrderStatus }))}>
                        <option value="aberta">Aberta</option>
                        <option value="diagnostico">Diagnóstico</option>
                        <option value="aguardando_aprovacao">Aguardando aprovação</option>
                        <option value="aprovada">Aprovada</option>
                        <option value="execucao">Em execução</option>
                        <option value="aguardando_material">Aguardando material</option>
                      </select>
                    </label>
                    <label className="form-row">Prioridade
                      <select className="input input-compact" value={orderDraft.priority} onChange={(event) => setOrderDraft((current) => ({ ...current, priority: event.target.value as LeadTemperature }))}>
                        <option value="frio">Baixa</option>
                        <option value="morno">Média</option>
                        <option value="quente">Alta</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-grid compact-grid">
                    <label className="form-row">Responsável
                      <input className="input input-compact" value={orderDraft.owner} onChange={(event) => setOrderDraft((current) => ({ ...current, owner: event.target.value }))} />
                    </label>
                    <label className="form-row">Valor
                      <input className="input input-compact" value={orderDraft.estimatedValue} onChange={(event) => setOrderDraft((current) => ({ ...current, estimatedValue: event.target.value }))} />
                    </label>
                  </div>
                  <label className="form-row">Previsão
                    <input className="input input-compact" type="datetime-local" value={orderDraft.dueAt} onChange={(event) => setOrderDraft((current) => ({ ...current, dueAt: event.target.value }))} />
                  </label>
                  <label className="form-row">Descrição
                    <textarea className="input input-compact" value={orderDraft.description} onChange={(event) => setOrderDraft((current) => ({ ...current, description: event.target.value }))} />
                  </label>
                  <label className="form-row">Observação interna
                    <textarea className="input input-compact" value={orderDraft.internalNotes} onChange={(event) => setOrderDraft((current) => ({ ...current, internalNotes: event.target.value }))} placeholder="Materiais, combinados, responsáveis, próximos passos..." />
                  </label>
                  <div className="inspector-actions">
                    <button className="btn mini" onClick={createServiceOrderFromInbox} disabled={!selected || creatingOrder}>
                      {creatingOrder ? "Criando..." : "Criar OS"}
                    </button>
                    <button className="btn mini secondary" onClick={() => setShowOrderDraft(false)} disabled={creatingOrder}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activePanel === "proposta" && (
            <div className="inspector-section proposal-builder">
              <div className="inspector-headline">
                <span className="eyebrow-small">Proposta</span>
                <strong>Gerador comercial</strong>
              </div>
              <p className="muted tool-hint">Monte um rascunho mais profissional, salve no histórico e revise antes de enviar.</p>

              <label className="form-row">
                Modelo
                <select
                  className="mini-select"
                  value={proposalModel}
                  onChange={(event) => {
                    const model = event.target.value as ProposalModel;
                    setProposalModel(model);
                    setProposalDeadline(proposalModels[model].defaultDeadline);
                  }}
                >
                  {Object.entries(proposalModels).map(([key, model]) => (
                    <option key={key} value={key}>{model.label}</option>
                  ))}
                </select>
              </label>

              <label className="form-row">
                Prazo
                <input className="input input-compact" value={proposalDeadline} onChange={(event) => setProposalDeadline(event.target.value)} />
              </label>

              <label className="form-row">
                Condição
                <input className="input input-compact" value={proposalPayment} onChange={(event) => setProposalPayment(event.target.value)} />
              </label>

              <button className="btn mini" onClick={generateProposalDraft} disabled={!selected}>Gerar proposta para WhatsApp</button>

              <div className="proposal-summary proposal-summary-pro">
                <span>Serviço</span>
                <strong>{selectedDeal?.title || proposalModels[proposalModel].label}</strong>
                <span>Valor</span>
                <strong>{selectedDeal ? money(selectedDeal.value) : "A definir"}</strong>
                <span>Ao enviar</span>
                <strong>Move para Proposta enviada</strong>
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
        </div>
      </aside>
    </section>
  );
}

export type LeadTemperature = "frio" | "morno" | "quente";
export type DealStatus = "aberto" | "ganho" | "perdido";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "queued" | "sent" | "received" | "delivered" | "read" | "failed" | string;
export type ServiceOrderStatus =
  | "aberta"
  | "diagnostico"
  | "aguardando_aprovacao"
  | "aprovada"
  | "execucao"
  | "aguardando_material"
  | "concluida"
  | "entregue"
  | "cancelada";

export interface Stage {
  id: string;
  title: string;
  order: number;
  color: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  source: string;
  owner: string;
  temperature: LeadTemperature;
  tags: string[];
  lastMessageAt: string;
  notes?: string;
}

export interface Deal {
  id: string;
  contactId: string;
  title: string;
  value: number;
  stageId: string;
  status: DealStatus;
  expectedClose?: string;
  lostReason?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  contactId: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  createdAt: string;
  providerMessageId?: string;
}

export interface Activity {
  id: string;
  contactId: string;
  title: string;
  dueAt: string;
  done: boolean;
}

export interface ServiceOrder {
  id: string;
  contactId: string;
  dealId?: string;
  code: string;
  title: string;
  description?: string;
  status: ServiceOrderStatus;
  priority: LeadTemperature;
  owner: string;
  estimatedValue: number;
  finalValue: number;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

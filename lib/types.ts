export type LeadTemperature = "frio" | "morno" | "quente";
export type DealStatus = "aberto" | "ganho" | "perdido";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

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

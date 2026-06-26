"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Deal } from "@/lib/types";
import { money, shortDate } from "@/lib/format";

const temperatureClass = {
  frio: "cold",
  morno: "warm",
  quente: "hot",
};

export function ContactTable({ contacts, deals }: { contacts: Contact[]; deals: Deal[] }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Contact[]>(contacts);
  const [localDeals, setLocalDeals] = useState<Deal[]>(deals);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const dealByContact = useMemo(() => {
    const map = new Map<string, Deal>();
    localDeals.forEach((deal) => {
      if (!map.has(deal.contactId)) map.set(deal.contactId, deal);
    });
    return map;
  }, [localDeals]);

  const filtered = useMemo(() => {
    const text = query.toLowerCase().trim();
    if (!text) return rows;
    return rows.filter((contact) => {
      const deal = dealByContact.get(contact.id);
      return [contact.name, contact.phone, contact.email, contact.company, contact.source, contact.owner, contact.tags.join(" "), deal?.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [rows, dealByContact, query]);

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
      setStatus("Lead excluído.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao excluir lead.");
    }
  }

  return (
    <section className="card">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <h2>Contatos e leads</h2>
          <p className="description">Base centralizada com origem, dono do atendimento, oportunidade e valor previsto.</p>
        </div>
        <input className="input" style={{ maxWidth: 360 }} placeholder="Buscar lead, telefone, origem..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {status && <div className="inline-alert">{status}</div>}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhum lead ainda.</strong>
          <p className="muted">Use o formulário do Dashboard ou envie um POST para /api/leads para testar a entrada real no Supabase.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Telefone</th>
                <th>Origem</th>
                <th>Responsável</th>
                <th>Temperatura</th>
                <th>Oportunidade</th>
                <th>Valor</th>
                <th>Último contato</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => {
                const deal = dealByContact.get(contact.id);
                return (
                  <tr key={contact.id}>
                    <td>
                      <strong>{contact.name}</strong>
                      <br />
                      <span className="muted">{contact.company || contact.email || "Sem empresa"}</span>
                    </td>
                    <td>{contact.phone}</td>
                    <td>{contact.source}</td>
                    <td>{contact.owner}</td>
                    <td><span className={`badge ${temperatureClass[contact.temperature]}`}>{contact.temperature}</span></td>
                    <td>{deal?.title || <span className="muted">—</span>}</td>
                    <td>{deal ? money(deal.value) : <span className="muted">—</span>}</td>
                    <td>{shortDate(contact.lastMessageAt)}</td>
                    <td>
                      <button type="button" className="btn mini danger" onClick={() => deleteContact(contact)}>Excluir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

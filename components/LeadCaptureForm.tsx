"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LeadCaptureForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = Object.fromEntries(form.entries());

    setStatus("Enviando lead...");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      setStatus(response.ok ? (result.demo ? "Lead recebido em modo demo." : "Lead salvo no CRM e no funil.") : result.error || "Erro ao enviar.");

      if (response.ok) {
        formEl.reset();
        router.refresh();
      }
    } catch {
      setStatus("Erro de conexão ao criar lead.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form id="entrada-lead" className="card" onSubmit={submit}>
      <h2>Entrada de lead</h2>
      <p className="description" style={{ marginBottom: 18 }}>
        Simula uma landing page entrando direto no CRM com dados comerciais completos.
      </p>

      <div className="form-grid">
        <label className="form-row">
          Nome do lead
          <input className="input" name="name" placeholder="Nome do lead" required />
        </label>
        <label className="form-row">
          WhatsApp
          <input className="input" name="phone" placeholder="51999999999" required />
        </label>
        <label className="form-row">
          Empresa / negócio
          <input className="input" name="company" placeholder="Ex: Academia Voltá" />
        </label>
        <label className="form-row">
          Origem
          <input className="input" name="source" defaultValue="Landing Page NextLead" />
        </label>
        <label className="form-row">
          Interesse
          <input className="input" name="interest" defaultValue="Orçamento de Landing Page" />
        </label>
        <label className="form-row">
          Valor estimado
          <input className="input" name="value" type="number" min="0" step="50" defaultValue="1200" />
        </label>
        <label className="form-row">
          Temperatura
          <select className="select" name="temperature" defaultValue="morno">
            <option value="frio">Frio</option>
            <option value="morno">Morno</option>
            <option value="quente">Quente</option>
          </select>
        </label>
        <label className="form-row">
          Responsável
          <select className="select" name="owner" defaultValue="Anthony">
            <option value="Anthony">Anthony</option>
            <option value="Felipe">Felipe</option>
            <option value="NextLead">NextLead</option>
          </select>
        </label>
        <label className="form-row">
          Previsão de fechamento
          <input className="input" name="expectedCloseDate" type="date" />
        </label>
        <label className="form-row">
          Tags
          <input className="input" name="tags" placeholder="site, orçamento, urgente" />
        </label>
      </div>

      <label className="form-row" style={{ marginTop: 14 }}>
        Observação
        <textarea className="textarea" name="notes" placeholder="Ex: pediu página para academia com mapa, WhatsApp e fotos reais." />
      </label>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn" type="submit" disabled={isSubmitting}>{isSubmitting ? "Criando..." : "Criar lead"}</button>
        {status && <span className="badge">{status}</span>}
      </div>
    </form>
  );
}

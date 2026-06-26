"use client";

import { useState } from "react";

export function WhatsAppTestPanel({ defaultMessage }: { defaultMessage: string }) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  async function sendTest() {
    const cleanPhone = phone.replace(/\D/g, "");
    const body = message.trim();

    if (!cleanPhone || !body) {
      setStatus("error");
      setFeedback("Informe o telefone com DDI e a mensagem de teste.");
      return;
    }

    setStatus("sending");
    setFeedback("Enviando...");

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: cleanPhone, message: body }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível enviar a mensagem.");
      }

      setStatus("success");
      setFeedback(result?.demo
        ? "Mensagem salva no CRM em modo demo. Configure a Evolution API para envio real."
        : `Mensagem enviada pela ${result?.provider === "evolution" ? "Evolution API" : "Meta"}. ID: ${result?.providerMessageId || "sem id retornado"}`
      );
    } catch (error: any) {
      setStatus("error");
      setFeedback(error?.message || "Erro ao enviar mensagem.");
    }
  }

  return (
    <div className="whatsapp-test-panel">
      <div className="form-grid single">
        <label>
          Telefone de teste
          <input
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="5551999999999"
          />
          <small className="muted">Use DDI + DDD + número. Ex.: 5551999999999.</small>
        </label>

        <label>
          Mensagem
          <textarea
            className="input textarea small"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensagem de teste"
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={sendTest} disabled={status === "sending"}>
          {status === "sending" ? "Enviando..." : "Enviar teste"}
        </button>
        {feedback && <span className={`feedback-pill ${status}`}>{feedback}</span>}
      </div>
    </div>
  );
}

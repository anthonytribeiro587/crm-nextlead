"use client";

import { useState } from "react";

export function EvolutionSetupPanel() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  async function configureWebhook() {
    setStatus("loading");
    setFeedback("Configurando webhook na Evolution API...");

    try {
      const response = await fetch("/api/whatsapp/evolution/configure-webhook", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result?.error || "Erro ao configurar webhook.");
      setStatus("success");
      setFeedback(`Webhook configurado: ${result.webhookUrl}`);
    } catch (error: any) {
      setStatus("error");
      setFeedback(error?.message || "Erro ao configurar webhook.");
    }
  }

  return (
    <div className="form-actions" style={{ marginTop: 12 }}>
      <button type="button" className="btn" onClick={configureWebhook} disabled={status === "loading"}>
        {status === "loading" ? "Configurando..." : "Configurar webhook Evolution"}
      </button>
      {feedback && <span className={`feedback-pill ${status === "loading" ? "sending" : status}`}>{feedback}</span>}
    </div>
  );
}

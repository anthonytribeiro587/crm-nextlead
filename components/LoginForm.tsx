"use client";

import { useState } from "react";

export function LoginForm() {
  const [user, setUser] = useState("Anthony");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Entrando...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(result.error || "Não foi possível entrar.");
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const next = searchParams.get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } catch {
      setStatus("Erro de conexão ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell-pro">
      <section className="login-pitch-panel">
        <div className="login-logo login-logo-pro">
          <img src="/nextlead-logo.png" alt="NextLead" />
        </div>
        <p className="eyebrow">CRM próprio</p>
        <h1>Atendimento, funil e WhatsApp em um só lugar.</h1>
        <p className="description">
          Controle leads captados pelas landing pages, responda pelo WhatsApp e acompanhe cada oportunidade com follow-up e proposta.
        </p>
        <div className="login-feature-grid">
          <span>WhatsApp conectado</span>
          <span>Funil comercial</span>
          <span>Follow-up</span>
          <span>Propostas</span>
        </div>
      </section>

      <form className="login-card login-card-pro" onSubmit={login}>
        <div>
          <p className="eyebrow">Acesso protegido</p>
          <h2>Entrar no CRM</h2>
          <p className="description">Use seu usuário da NextLead para continuar.</p>
        </div>

        <label className="form-row">
          Usuário
          <select className="select" value={user} onChange={(event) => setUser(event.target.value)}>
            <option value="Anthony">Anthony</option>
            <option value="Felipe">Felipe</option>
          </select>
        </label>

        <label className="form-row">
          Senha
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            autoFocus
            required
          />
        </label>

        <button className="btn login-submit" type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar no CRM"}</button>
        {status && <span className="login-status">{status}</span>}
      </form>
    </div>
  );
}

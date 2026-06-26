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
    <form className="login-card" onSubmit={login}>
      <div className="login-logo">
        <img src="/nextlead-logo.png" alt="NextLead" />
      </div>
      <p className="eyebrow">Acesso protegido</p>
      <h1>Entrar no CRM</h1>
      <p className="description">Acesse com seu usuário da NextLead.</p>

      <label className="form-row">
        Usuário
        <select className="select" value={user} onChange={(event) => setUser(event.target.value)}>
          <option value="Anthony">Anthony</option>
          <option value="Felipe">Felipe</option>
        </select>
      </label>

      <label className="form-row" style={{ marginTop: 12 }}>
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

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn" type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        {status && <span className="badge">{status}</span>}
      </div>
    </form>
  );
}

"use client";
import { useState } from "react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return location.reload();
    const j = (await res?.json().catch(() => null)) as { error?: string } | null;
    setErr(res?.status === 429 ? "Muitas tentativas. Aguarde 1 minuto." : j?.error ?? "Falha no login.");
  }

  return (
    <main className="adm-login">
      <form onSubmit={submit} className="adm-card adm-login-card">
        <div className="adm-brand"><img src="/icon.svg" alt="" /> Invest <b>Moment</b> <span className="adm-tag">Console</span></div>
        <h1>Acesso restrito</h1>
        <p className="adm-muted">Área administrativa. Tentativas são registradas e bloqueadas após excesso.</p>
        {!configured && <p className="adm-warn">Painel desativado: defina <code>ADMIN_PASSWORD</code> (12+ caracteres) nas variáveis da Vercel e faça Redeploy.</p>}
        <label htmlFor="pw">Senha de administrador</label>
        <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={!configured} autoFocus />
        {err && <p className="adm-err" role="alert">{err}</p>}
        <button className="adm-btn" disabled={busy || !pw || !configured}>{busy ? "Verificando…" : "Entrar"}</button>
      </form>
    </main>
  );
}

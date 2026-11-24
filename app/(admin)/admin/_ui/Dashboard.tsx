"use client";
import { useEffect, useMemo, useState } from "react";
import type { DayStats, SecEvent, Subscriber } from "@/lib/store";
import { DailyBars, RankBars } from "./Charts";

type System = {
  provider: string;
  keys: { name: string; ok: boolean }[];
  lockdown: boolean;
  aiDisabled: boolean;
  limits: { chatMin: number; chatDay: number; global: number };
};

const REASONS: Record<string, string> = {
  scanner_probe: "Robô procurando falhas",
  bad_origin: "Pedido de outro site",
  rate_limit: "Excesso por minuto",
  daily_limit: "Limite diário",
  global_limit: "Limite global",
  ip_banned_15min: "IP banido 15 min",
  banned: "Acesso de IP banido",
  prompt_injection: "Prompt injection",
  admin_login_failed: "Login do painel falhou",
  admin_unauthorized: "Painel sem sessão",
  body_too_large: "Pedido grande demais",
  bad_method: "Método não permitido",
  bad_content_type: "Formato inválido",
  lockdown: "Bloqueado (emergência)",
  ai_disabled: "Chat desligado",
};
const reasonLabel = (r: string) => REASONS[r] ?? r;
const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));

export function Dashboard(props: {
  store: boolean;
  days: DayStats[] | null;
  events: SecEvent[] | null;
  subs: Subscriber[] | null;
  generatedAt: string;
  system: System;
}) {
  const { store, days, events, system, generatedAt } = props;
  const [subs, setSubs] = useState(props.subs ?? []);
  const [tab, setTab] = useState<"visao" | "seguranca" | "cadastros" | "sistema">("visao");
  const [q, setQ] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    const f = () => setNow(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "medium" }).format(new Date()));
    f();
    const id = setInterval(f, 1000);
    const reload = setInterval(() => location.reload(), 60_000); // atualização automática a cada 1 min
    return () => { clearInterval(id); clearInterval(reload); };
  }, []);

  const today = days?.at(-1);
  const sum = (k: keyof DayStats) => (days ?? []).reduce((a, d) => a + (Number(d[k]) || 0), 0);
  const reasons = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const d of days ?? []) for (const [k, v] of Object.entries(d.fields)) if (k.startsWith("sec:")) acc[k.slice(4)] = (acc[k.slice(4)] ?? 0) + v;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: reasonLabel(k), value: v }));
  }, [days]);
  const threat = (today?.blocked ?? 0) > 200 ? "alto" : (today?.blocked ?? 0) > 30 ? "moderado" : "baixo";
  const filtered = subs.filter((s) => (s.name + s.email).toLowerCase().includes(q.toLowerCase()));

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    location.reload();
  }
  async function remove(email: string) {
    if (!window.confirm(`Excluir o cadastro de ${email}? (direito de exclusão, LGPD)`)) return;
    const r = await fetch(`/api/admin/subscribers?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    if (r.ok) setSubs((s) => s.filter((x) => x.email !== email));
  }

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand"><img src="/icon.svg" alt="" /> Invest <b>Moment</b></div>
        <span className="adm-tag">Console · Cybertruck</span>
        <nav>
          {([
            ["visao", "Visão geral"],
            ["seguranca", "Segurança"],
            ["cadastros", "Cadastros"],
            ["sistema", "Sistema"],
          ] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="adm-side-foot">
          <a href="/" target="_blank" rel="noreferrer">Abrir site público ↗</a>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <div>
            <h1>{{ visao: "Visão geral", seguranca: "Central de segurança", cadastros: "Cadastros (com consentimento)", sistema: "Sistema e automações" }[tab]}</h1>
            <p className="adm-muted">Atualizado {fmtTime(generatedAt)} · atualiza sozinho a cada 1 min</p>
          </div>
          <div className="adm-pills">
            <span className={`adm-pill ${system.lockdown ? "crit" : "good"}`}>● {system.lockdown ? "Emergência ativa" : "Site no ar"}</span>
            <span className={`adm-pill ${system.aiDisabled ? "warn" : "good"}`}>● IA {system.aiDisabled ? "desligada" : "ativa"}</span>
            <span className="adm-pill mono">{now} Brasília</span>
          </div>
        </header>

        {!store && (
          <div className="adm-notice">
            <b>Sem armazenamento conectado.</b> Conecte um banco (Supabase/Postgres ou Redis) na Vercel em Storage e faça Redeploy: a Vercel só entrega as variáveis novas ao site depois de um novo deploy. Até lá, nada é contado e nenhum número é inventado.
          </div>
        )}

        {tab === "visao" && (
          <>
            <section className="adm-kpis">
              <Kpi label="Acessos hoje" value={today?.views} total={sum("views")} />
              <Kpi label="Visitantes únicos hoje" value={today?.visitors} total={sum("visitors")} hint="contagem anônima" />
              <Kpi label="Perguntas ao bot hoje" value={today?.chats} total={sum("chats")} />
              <Kpi label="Bloqueios hoje" value={today?.blocked} total={sum("blocked")} />
              <Kpi label="Cadastros" value={store ? subs.length : undefined} totalLabel={`${sum("signups")} novos em 14 dias`} />
            </section>
            <section className="adm-grid2">
              <Card title="Visitantes únicos por dia" sub="últimos 14 dias">
                {days ? <DailyBars data={days.map((d) => ({ label: short(d.day), value: d.visitors }))} unit="visitantes" /> : <Empty />}
              </Card>
              <Card title="Perguntas ao bot por dia" sub="últimos 14 dias">
                {days ? <DailyBars data={days.map((d) => ({ label: short(d.day), value: d.chats }))} unit="perguntas" /> : <Empty />}
              </Card>
            </section>
            <section className="adm-grid2">
              <Card title="Páginas mais acessadas" sub="14 dias">
                {days ? (
                  <RankBars
                    data={[
                      { label: "Início (/)", value: days.reduce((a, d) => a + (d.fields["page:/"] ?? 0), 0) },
                      { label: "Chat (/chat)", value: days.reduce((a, d) => a + (d.fields["page:/chat"] ?? 0), 0) },
                      { label: "Radar do dia (API)", value: sum("radar") },
                    ]}
                  />
                ) : <Empty />}
              </Card>
              <Card title="Nível de ameaça hoje" sub="com base nos bloqueios">
                {days ? (
                  <div className="adm-threat">
                    <span className={`adm-threat-badge ${threat}`}>{threat === "alto" ? "▲ Alto" : threat === "moderado" ? "■ Moderado" : "● Baixo"}</span>
                    <p className="adm-muted">{today?.blocked ?? 0} pedidos bloqueados hoje. Acima de 200, ative o Attack Challenge Mode no Firewall da Vercel.</p>
                  </div>
                ) : <Empty />}
              </Card>
            </section>
          </>
        )}

        {tab === "seguranca" && (
          <>
            <section className="adm-kpis">
              <Kpi label="Bloqueios (14 dias)" value={store ? sum("blocked") : undefined} />
              <Kpi label="Robôs de invasão" value={store ? reasons.find((r) => r.label === REASONS.scanner_probe)?.value ?? 0 : undefined} />
              <Kpi label="Prompt injection" value={store ? reasons.find((r) => r.label === REASONS.prompt_injection)?.value ?? 0 : undefined} />
              <Kpi label="IPs banidos" value={store ? reasons.find((r) => r.label === REASONS.ip_banned_15min)?.value ?? 0 : undefined} />
            </section>
            <section className="adm-grid2">
              <Card title="Bloqueios por motivo" sub="14 dias">
                {store ? (reasons.length ? <RankBars data={reasons} /> : <p className="adm-muted">Nenhum bloqueio registrado.</p>) : <Empty />}
              </Card>
              <Card title="Bloqueios por dia" sub="14 dias">
                {days ? <DailyBars data={days.map((d) => ({ label: short(d.day), value: d.blocked }))} unit="bloqueios" /> : <Empty />}
              </Card>
            </section>
            <Card title="Eventos recentes" sub="IP mascarado (LGPD) · últimos 40">
              {events ? (
                events.length ? (
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead><tr><th>Quando</th><th>Evento</th><th>Caminho</th><th>Origem</th></tr></thead>
                      <tbody>
                        {events.map((e, i) => (
                          <tr key={i}><td className="mono">{fmtTime(e.at)}</td><td>{reasonLabel(e.reason)}</td><td className="mono">{e.path}</td><td className="mono">{e.ip}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="adm-muted">Nenhum evento.</p>
              ) : <Empty />}
            </Card>
          </>
        )}

        {tab === "cadastros" && (
          <Card
            title={`${subs.length} cadastro(s)`}
            sub="Só aparecem pessoas que se cadastraram e marcaram o consentimento no site"
            action={store ? <a className="adm-btn sm" href="/api/admin/subscribers">Exportar CSV</a> : null}
          >
            {store ? (
              <>
                <input className="adm-search" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
                {filtered.length ? (
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead><tr><th>Nome</th><th>E-mail</th><th>Consentimento</th><th>Aviso</th><th /></tr></thead>
                      <tbody>
                        {filtered.map((s) => (
                          <tr key={s.email}>
                            <td>{s.name}</td><td className="mono">{s.email}</td><td className="mono">{fmtTime(s.consentAt)}</td><td className="mono">v{s.policy}</td>
                            <td><button className="adm-link-danger" onClick={() => remove(s.email)}>Excluir</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="adm-muted">Nenhum cadastro ainda.</p>}
                <p className="adm-foot">Use estes contatos só para a finalidade aceita (Radar do dia e novidades). Se alguém pedir exclusão, clique em Excluir.</p>
              </>
            ) : <Empty />}
          </Card>
        )}

        {tab === "sistema" && (
          <section className="adm-grid2">
            <Card title="Conexões" sub="só mostra se está configurado, nunca o valor">
              <ul className="adm-checks">
                {system.keys.map((k) => (
                  <li key={k.name}><span className={k.ok ? "ok" : "no"}>{k.ok ? "✓" : "✕"}</span>{k.name}<em>{k.ok ? "configurado" : "falta configurar"}</em></li>
                ))}
              </ul>
              <p className="adm-muted">IA em uso: <b>{system.provider}</b></p>
            </Card>
            <Card title="Proteções automáticas" sub="Cybertruck">
              <ul className="adm-checks">
                <li><span className="ok">✓</span>Limite por visitante<em>{system.limits.chatMin}/min · {system.limits.chatDay}/dia</em></li>
                <li><span className="ok">✓</span>Limite global do chat<em>{system.limits.global}/min</em></li>
                <li><span className="ok">✓</span>Banimento automático<em>3 alertas → 15 min</em></li>
                <li><span className="ok">✓</span>Anti prompt injection<em>entrada e notícias</em></li>
                <li><span className="ok">✓</span>Filtro de chaves na saída<em>ativo</em></li>
                <li><span className="ok">✓</span>Cabeçalhos CSP/HSTS<em>ativo</em></li>
                <li><span className={system.lockdown ? "no" : "ok"}>{system.lockdown ? "!" : "✓"}</span>Emergência (SITE_LOCKDOWN)<em>{system.lockdown ? "LIGADA" : "desligada"}</em></li>
              </ul>
              <p className="adm-muted">Para ligar a emergência: Vercel &gt; Settings &gt; Environment Variables &gt; <code>SITE_LOCKDOWN=1</code> &gt; Redeploy.</p>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, total, totalLabel, hint }: { label: string; value?: number; total?: number; totalLabel?: string; hint?: string }) {
  return (
    <div className="adm-card adm-kpi">
      <span className="adm-kpi-label">{label}</span>
      <span className="adm-kpi-value">{value === undefined ? "—" : value.toLocaleString("pt-BR")}</span>
      <span className="adm-kpi-sub">{totalLabel ?? (total !== undefined && value !== undefined ? `${total.toLocaleString("pt-BR")} em 14 dias` : value === undefined ? "sem dados" : hint ?? "últimos 14 dias")}</span>
    </div>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="adm-card">
      <div className="adm-card-head"><div><h2>{title}</h2>{sub && <p className="adm-muted">{sub}</p>}</div>{action}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="adm-muted">Sem dados: armazenamento não conectado.</p>;
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TickerTape } from "@/components/TickerTape";
import { MarketChart } from "@/components/MarketChart";
import { RadarDoDia } from "@/components/RadarDoDia";
import { DelayBadge } from "@/components/DelayBadge";

type Msg = { role: "user" | "assistant"; content: string; chart?: string };

const COMMANDS = [
  "Hello invest moment",
  "Qual ação está melhor para os próximos 20 pregões?",
  "Bolsa hoje",
  "Analise [TICKER]",
  "Previsão de [TICKER]",
  "Compare [A] e [B]",
  "Onde estão os olhos dos investidores?",
  "Mostre um gráfico",
];
const STORE = "im_chat_v1";
const NAME = "im_name_v1";

function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sem armazenamento local */
  }
}

function chartRequest(text: string): string | null {
  const m = text.trim().match(/^mostre (?:um )?gr[aá]fico(?:\s+(?:de|do|da))?\s*([A-Za-z0-9]{4,8})?/i);
  if (!m) return null;
  return (m[1] ?? "IBOV").toUpperCase();
}

function BrasiliaClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const f = () =>
      setNow(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short", dateStyle: "short" }).format(new Date()));
    f();
    const id = setInterval(f, 30000);
    return () => clearInterval(id);
  }, []);
  return <span className="badge mono">🕒 {now} Brasília</span>;
}

export default function ChatPage() {
  const [name, setName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(load<string | null>(NAME, null) ?? "");
    setMsgs(load<Msg[]>(STORE, []));
  }, []);
  useEffect(() => {
    save(STORE, msgs.slice(-60));
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    const chart = chartRequest(t);
    if (chart) {
      setMsgs((m) => [...m, { role: "user", content: t }, { role: "assistant", content: "", chart }]);
      return;
    }
    const history = [...msgs, { role: "user" as const, content: t }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name ?? "",
          messages: history.filter((m) => !m.chart && m.content).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `Não consegui responder agora. ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function chip(c: string) {
    const i = c.indexOf("[");
    if (i < 0) return send(c);
    setInput(c);
    setTimeout(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(i, c.indexOf("]") + 1);
    }, 0);
  }

  return (
    <div className="chat-wrap">
      <TickerTape />
      <div className="chat-top">
        <Link href="/" className="brand"><img src="/icon.svg" alt="" />Invest <span>Moment</span></Link>
        <div className="right">
          <BrasiliaClock />
          <DelayBadge />
          <button className="chip" onClick={() => setShowChart((v) => !v)}>📈 Gráfico</button>
          {msgs.length > 0 && <button className="chip" onClick={() => setMsgs([])}>Nova conversa</button>}
        </div>
      </div>
      <main className="chat-main">
        <div className="chat-inner">
          {showChart && <MarketChart />}
          {msgs.length === 0 && (
            <>
              <RadarDoDia />
              <p className="muted" style={{ textAlign: "center", marginTop: 24 }}>
                Digite <b className="mono" style={{ color: "var(--accent)" }}>Hello invest moment</b> para começar.
              </p>
            </>
          )}
          {msgs.map((m, i) =>
            m.chart ? (
              <div key={i} className="msg bot"><MarketChart initial={m.chart} /></div>
            ) : (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                <div className="bubble">
                  {m.role === "user" ? (
                    m.content
                  ) : m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  ) : (
                    <span className="dim">Consultando dados…</span>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
      </main>
      <div className="composer">
        <div className="composer-inner">
          <div className="chips">
            {COMMANDS.map((c) => (
              <button key={c} className="chip" onClick={() => chip(c)} disabled={busy}>{c}</button>
            ))}
          </div>
          <form
            className="inputrow"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={ta}
              rows={1}
              value={input}
              placeholder="Pergunte sobre a B3…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="btn" disabled={busy || !input.trim()}>Enviar</button>
          </form>
          <div className="disclaimer">O Invest Moment pode cometer erros. Análises informativas, não garantia de resultado.</div>
        </div>
      </div>
      {name === "" && (
        <div className="modal">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const n = nameInput.trim().slice(0, 80);
              if (!n) return;
              const em = emailInput.trim();
              if (em && consent) {
                fetch("/api/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: n, email: em, consent: true }),
                }).catch(() => {});
              }
              save(NAME, n);
              setName(n);
            }}
          >
            <h3 style={{ margin: 0 }}>Como você quer ser chamado?</h3>
            <p className="dim" style={{ margin: "6px 0 0", fontSize: 13 }}>O bot usa seu nome nas boas-vindas. O nome fica salvo neste navegador; o e-mail só é guardado se você marcar o consentimento.</p>
            <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Seu nome" />
            <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Seu e-mail (opcional, para receber o Radar do dia)" />
            {emailInput.trim() && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "var(--muted)", textAlign: "left", lineHeight: 1.45 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: "auto", marginTop: 2 }} />
                <span>Aceito que o Invest Moment guarde meu nome e e-mail para enviar o Radar do dia e novidades, conforme a <a href="/privacidade" target="_blank">Política de Privacidade</a>. Posso pedir a exclusão a qualquer momento.</span>
              </label>
            )}
            <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={!!emailInput.trim() && !consent}>Começar</button>
          </form>
        </div>
      )}
    </div>
  );
}

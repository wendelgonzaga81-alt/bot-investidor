"use client";
import { useEffect, useRef, useState } from "react";
import { DelayBadge } from "./DelayBadge";

const QUICK = ["IBOV", "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "WEGE3", "USDBRL"];

export function toTvSymbol(t: string): string {
  const s = t.trim().toUpperCase();
  if (s === "USDBRL" || s === "DOLAR" || s === "DÓLAR") return "FX_IDC:USDBRL";
  if (s.includes(":")) return s;
  return `BMFBOVESPA:${s || "IBOV"}`;
}

export function MarketChart({ initial = "IBOV" }: { initial?: string }) {
  const [symbol, setSymbol] = useState(toTvSymbol(initial));
  const [input, setInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/Sao_Paulo",
      theme: "dark",
      style: "1",
      locale: "br",
      backgroundColor: "#0B0F14",
      allow_symbol_change: true,
      hide_side_toolbar: true,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="card chart-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong className="mono">{symbol}</strong>
        <DelayBadge />
      </div>
      <div className="symbol-row">
        {QUICK.map((q) => (
          <button key={q} className="chip" onClick={() => setSymbol(toTvSymbol(q))}>
            {q === "USDBRL" ? "Dólar" : q}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setSymbol(toTvSymbol(input));
          }}
        >
          <input placeholder="Ticker" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Ticker da B3" />
        </form>
      </div>
      <div className="tv-holder">
        <div className="tradingview-widget-container" ref={ref} style={{ height: "100%", width: "100%" }} />
      </div>
      <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>
        Gráfico fornecido pelo{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView
        </a>
        . Cotações da B3 com 15 minutos de atraso. O analista não vê os números deste gráfico. Não é recomendação de investimento.
      </p>
    </div>
  );
}

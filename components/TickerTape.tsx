"use client";
import { useEffect, useRef } from "react";
import { DelayBadge } from "./DelayBadge";

const SYMBOLS = [
  { proName: "BMFBOVESPA:IBOV", title: "Ibovespa" },
  { proName: "FX_IDC:USDBRL", title: "Dólar" },
  { proName: "BMFBOVESPA:PETR4", title: "Petrobras PN" },
  { proName: "BMFBOVESPA:VALE3", title: "Vale ON" },
  { proName: "BMFBOVESPA:ITUB4", title: "Itaú PN" },
  { proName: "BMFBOVESPA:BBDC4", title: "Bradesco PN" },
  { proName: "BMFBOVESPA:BBAS3", title: "Banco do Brasil ON" },
  { proName: "BMFBOVESPA:WEGE3", title: "WEG ON" },
  { proName: "BMFBOVESPA:ABEV3", title: "Ambev ON" },
  { proName: "BMFBOVESPA:B3SA3", title: "B3 ON" },
  { proName: "TVC:UKOIL", title: "Petróleo Brent" },
];

export function TickerTape() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      symbols: SYMBOLS,
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "dark",
      locale: "br",
    });
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, []);
  return (
    <div className="tape">
      <div className="tradingview-widget-container" ref={ref} />
      <div className="tape-note">
        <DelayBadge compact />
        <span>Cotações via TradingView · ações da B3 com 15 min de atraso</span>
      </div>
    </div>
  );
}

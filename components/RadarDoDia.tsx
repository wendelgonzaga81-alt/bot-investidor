"use client";
import { useEffect, useState } from "react";
import { PriceVolume } from "./PriceVolume";

type Item = {
  ticker: string; name: string | null; bias: string; score: number | null; coveragePct: number;
  regime: string; signal: string; lastPrice: number | null; lastTradeTimeBrasilia: string | null;
  changes: { d1: number | null; d5: number | null; d20: number | null };
  volumeVsMedian20: number | null; bars: { date: number; close: number; volume: number }[];
};
type Radar = { generatedAt: string; universoReduzido: boolean; top: Item[]; error?: string };

const sign = (v: number | null) => (v === null ? "n/d" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

export function RadarDoDia() {
  const [data, setData] = useState<Radar | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/radar")
      .then(async (r) => {
        const j = (await r.json()) as Radar;
        if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <div className="card radar"><h2>📡 Radar do dia</h2><p className="dim">Indisponível agora: {err}</p></div>;
  if (!data) return <div className="card radar"><h2>📡 Radar do dia</h2><p className="dim">Calculando com dados da brapi.dev…</p></div>;

  const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(data.generatedAt));
  return (
    <div className="card radar">
      <h2>📡 Radar do dia</h2>
      <div className="dim" style={{ fontSize: 12.5 }}>
        Ativos com maior score agora (horizonte de 20 pregões). Gerado {when} (Brasília). Dados: brapi.dev, podem ter atraso.
        {data.universoReduzido && " Universo reduzido: falta o token da brapi no servidor."}
      </div>
      {data.top.length === 0 && <p className="dim" style={{ fontSize: 13 }}>Sem dados de cotação no momento. Tente de novo em alguns minutos.</p>}
      <div className="radar-grid">
        {data.top.map((a) => (
          <div className="radar-item" key={a.ticker}>
            <div className="t">
              <strong className="mono">{a.ticker}</strong>
              <span className={`score ${a.score !== null && a.score >= 0 ? "pos" : "neg"}`}>{a.score ?? "n/d"}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              Viés <b>{a.bias}</b> · {a.regime} · sinal {a.signal}
            </div>
            <div className="dim mono" style={{ fontSize: 11.5 }}>
              R$ {a.lastPrice?.toFixed(2) ?? "n/d"} · 1d {sign(a.changes.d1)} · 20d {sign(a.changes.d20)} · cobertura {a.coveragePct}%
            </div>
            <PriceVolume bars={a.bars} ticker={a.ticker} />
          </div>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>⚠️ Análise informativa, pode conter erros. Não é garantia de resultado.</div>
    </div>
  );
}

"use client";
import { useState } from "react";

type Point = { label: string; value: number };

// Barras verticais, série única (sem legenda: o título nomeia a série). Dica ao passar o mouse.
export function DailyBars({ data, unit, height = 150 }: { data: Point[]; unit: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = height, PADB = 20, PADT = 10, PADL = 30;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = (W - PADL) / data.length;
  const bw = Math.max(4, step - 6);
  const y = (v: number) => PADT + (H - PADB - PADT) * (1 - v / max);
  const ticks = Array.from(new Set([0, Math.round(max / 2), max]));
  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Série diária de ${unit}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} x2={W} y1={y(t)} y2={y(t)} className="adm-grid" />
            <text x={PADL - 6} y={y(t) + 3} textAnchor="end" className="adm-axis">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PADL + i * step + (step - bw) / 2;
          const top = y(d.value);
          const h = Math.max(0, H - PADB - top);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={PADL + i * step} y={0} width={step} height={H} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, top, bw, h, Math.min(4, bw / 2, h))} className={hover === i ? "adm-bar on" : "adm-bar"} />}
              {(i === 0 || i === data.length - 1 || i % 3 === 0) && (
                <text x={PADL + i * step + step / 2} y={H - 5} textAnchor="middle" className="adm-axis">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="adm-tip" style={{ left: `${((PADL + (hover + 0.5) * step) / W) * 100}%` }}>
          <b>{data[hover].value.toLocaleString("pt-BR")}</b> {unit}
          <span>{data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// Barras horizontais com rótulo e valor em texto (identidade nunca só por cor).
export function RankBars({ data }: { data: Point[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="adm-rank">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${d.value}`}>
          <span className="adm-rank-label">{d.label}</span>
          <span className="adm-rank-track"><span className="adm-rank-fill" style={{ width: `${(d.value / max) * 100}%` }} /></span>
          <span className="adm-rank-val mono">{d.value.toLocaleString("pt-BR")}</span>
        </li>
      ))}
    </ul>
  );
}
